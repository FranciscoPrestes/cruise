import { expect, mock, test } from 'claude-code/testing'

const ASK = 'change the color of the save button on the settings page to blue'
const verdict = (effort: string, sure = 0.9) => ({ isAnswered: true, text: JSON.stringify({ effort, sure, why: 'test' }), usage: { input_tokens: 100, output_tokens: 20 } })
const usage = (read: number, wrote: number) => ({ input_tokens: 2, output_tokens: 70, cache_read_input_tokens: read, cache_creation_input_tokens: wrote })

type Setup = { sent: unknown[]; judged: string[]; models: string[]; toasts: string[]; calls: { url?: string; auth?: string; body?: string }[]; clock: { advance: (ms: number) => Promise<void> } }

// Everything beneath the plugin is a stub; the plugin's own hooks run for real.
// Routed models are an opt-in: nothing routed is steered unless routerModels names it.
const EX = 'OpenAI (Login)/gpt-*,Google (Login)/gemini-*,Google (Login)/claude-sonnet-5-5-high'

function stubs(on: any, opts: { replies?: unknown[]; reply?: unknown; steps?: ReturnType<typeof usage>[]; fetchBody?: string; throwJudge?: boolean } = {}): Setup {
  const clock = mock.clock(on)
  const out: Setup = { sent: [], judged: [], models: [], toasts: [], calls: [], clock }
  let asked = 0
  let step = 0
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('session.messages', async () => ({ value: [] }) as never)
  on('ui.toast', async (_$: unknown, e: { text: string }) => { out.toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  // No pane can be drawn here, so /cruise falls back to its plain-text report.
  on('ui.open', async () => ({ value: { isPlaced: false } }) as never)
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 10 } } }) as never)
  on('model.complete', async (_$: unknown, e: { prompt: string; model: string }) => { out.judged.push(e.prompt); out.models.push(e.model); if (opts.throwJudge) throw new Error('boom'); const r = opts.replies ? opts.replies[asked] : opts.reply; asked += 1; return { value: r ?? verdict('low') } as never })
  on('http.fetch', async (_$: unknown, e: { url: string; init?: { headers?: Record<string, string>; body?: string } }) => {
    out.calls.push({ url: e.url, auth: e.init?.headers?.authorization, body: e.init?.body })
    if (opts.throwJudge) throw new Error('connection refused')
    return { value: { ok: true, status: 200, headers: {}, text: opts.fetchBody ?? '' } } as never
  })
  on('turn.step', async function* (_$: unknown, e: { effort?: unknown; turnId: string; index: number }, _next: unknown) {
    out.sent.push(e.effort)
    const u = opts.steps?.[step] ?? usage(45_000, 100)
    step += 1
    yield { kind: 'text', index: 0, text: 'ok' } as never
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], usage: u } as never
  })
  return out
}

async function run($: any, e: { model?: string; effort?: unknown; index?: number; agentId?: string } = {}) {
  for await (const _chunk of $.turn.step({ turnId: 't', index: e.index ?? 0, model: e.model ?? 'claude-opus-5-5', effort: 'effort' in e ? e.effort : 'high', messageCount: 5, agentId: e.agentId } as never)) void _chunk
}

test('effort off: the app effort goes out untouched and no judge is asked', { options: { effort: 'off' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
  expect(s.judged).toHaveLength(0)
})

test('haiku: a simple prompt goes out at the effort the judge picked, below the app\'s', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['low'])
  expect(s.judged).toHaveLength(1)
  expect(s.judged[0]).toContain('Highest level allowed: max')
})

test('through a router: a routed model the person opted in is steered', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5' , routerModels: EX } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'OpenAI (Login)/gpt-6.1-sol', effort: 'medium' })
  expect(s.sent).toEqual(['low'])
  expect(s.judged).toHaveLength(1)
})

test('through a router: Anthropic ids with the router label are left alone by default (the cache is lost there) and steered only if named', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'Anthropic (Login)/claude-sonnet-5-5[1m]', effort: 'high' })
  expect(s.sent).toEqual(['high'])
  expect(s.judged).toHaveLength(0)
})

test('through a router: Anthropic ids are steered once the person names them in routerModels', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5', routerModels: 'Anthropic (Login)/claude-*' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'Anthropic (Login)/claude-sonnet-5-5[1m]', effort: 'high' })
  expect(s.sent).toEqual(['low'])
})

test('through a router: nothing routed is steered by default, and DeepSeek and the like stay out even when GPT and Gemini are in', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'OpenAI (Login)/gpt-6.1-sol', effort: 'medium' })
  await run($, { model: 'Google (Login)/gemini-3.8-flash-high', effort: 'xhigh', index: 1 })
  expect(s.sent).toEqual(['medium', 'xhigh'])
  expect(s.judged).toHaveLength(0)
  const text = JSON.stringify(await $.command.run({ command: 'cruise', args: '' } as never))
  expect(text).toContain('off by default')
})

test('the dashboard says why a router-labelled Anthropic model is left alone: the cache lost on an effort change', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'Anthropic (Login)/claude-sonnet-5-5[1m]', effort: 'high' })
  const text = JSON.stringify(await $.command.run({ command: 'cruise', args: '' } as never))
  expect(s.sent).toEqual(['high'])
  expect(text).toContain('lost its prompt cache when the effort changed')
})

test('plain Claude Code is steered exactly as before whatever routerModels says, even a pattern that would match everything', { options: { effort: 'haiku', routerModels: '*' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'claude-opus-5-5', effort: 'high' })
  expect(s.sent).toEqual(['low'])
  expect(s.models).toEqual(['claude-haiku-5-5'])
})

test('plain Claude Code leaves Haiku and unsupported ids alone with routerModels empty', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'claude-sonnet-5-5-high', effort: 'high' })
  expect(s.sent).toEqual(['high'])
  expect(s.judged).toHaveLength(0)
})

test('through a router: with GPT and Gemini opted in, DeepSeek and other Google models are still left alone', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5', routerModels: EX } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'OpenRouter/~deepseek/deepseek-pro-latest', effort: 'xhigh' })
  await run($, { model: 'Google (Login)/claude-opus-5-5-high', effort: 'high', index: 1 })
  expect(s.sent).toEqual(['xhigh', 'high'])
  expect(s.judged).toHaveLength(0)
})

test('through a router: a pattern the person adds is steered', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5', routerModels: 'OpenRouter/~deepseek/*' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'OpenRouter/~deepseek/deepseek-pro-latest', effort: 'xhigh' })
  expect(s.sent).toEqual(['low'])
})

test('through a router: a provider that reports no cache numbers never pauses steering', { options: { effort: 'haiku', judgeModel: 'claude-haiku-5-5' , routerModels: EX } }, async ($, on) => {
  const s = stubs(on, { replies: [verdict('low'), verdict('high')], steps: [{} as never, {} as never] })
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'OpenAI (Login)/gpt-6.1-sol', effort: 'medium' })
  await $.prompt.submit({ text: 'Redesign the whole billing module across all services and migrate the data, with a rollback plan' })
  await run($, { model: 'OpenAI (Login)/gpt-6.1-sol', effort: 'medium', index: 1 })
  expect(s.toasts.some(t => t.includes('cache'))).toBe(false)
})

test('the conversation never leaves: the judge sees the next message and two small facts', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.judged[0]).toContain(ASK)
  expect(s.judged[0]).not.toContain('assistant:')
})

test('the judge is asked once per prompt, not once per request of the turn', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { index: 0 })
  await run($, { index: 1 })
  await run($, { index: 2 })
  expect(s.judged).toHaveLength(1)
  expect(s.sent).toEqual(['low', 'low', 'low'])
})

test('steer down: never above the effort the app set; a verdict above it is refused and the request is untouched', { options: { effort: 'haiku', steer: 'down' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('xhigh') })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('a judge that fails never holds the request back', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on, { reply: { isAnswered: false, reason: 'api-error' } })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('a model without an effort setting (Haiku) and a subagent are left alone', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($, { model: 'claude-haiku-5-5', effort: undefined })
  await run($, { agentId: 'sub-1' })
  expect(s.sent).toEqual([undefined, 'high'])
  expect(s.judged).toHaveLength(0)
})

test('a short follow-up keeps the pick and asks no judge', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  await $.prompt.submit({ text: 'ok' })
  await run($)
  expect(s.judged).toHaveLength(1)
  expect(s.sent).toEqual(['low', 'low'])
})

test('jev: the key is sent, the hosted URL is used, and the verdict steers the request', { options: { effort: 'jev', judgeKey: 'secret-key' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } }, usage: { input_tokens: 50, output_tokens: 5 } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['low'])
  expect(s.calls[0]?.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(s.calls[0]?.auth).toBe('Bearer secret-key')
})

test('laya: the local URL is used and no key is sent', { options: { effort: 'laya' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'medium', confidence: 0.9 } } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['medium'])
  expect(s.calls[0]?.url).toBe('http://127.0.0.1:18787/v1/systemone')
  expect(s.calls[0]?.auth).toBe(undefined)
})

test('an unreachable laya server never holds the request back', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: 'not json' })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('the cache guard stops steering when an effort change is followed by a rewrite', { options: { effort: 'haiku' } }, async ($, on) => {
  // Prompt 1 is easy (low, healthy cache). Prompt 2 is hard: the judge says high, the app's own level, so the request
  // goes back up, and the cache came back rewritten. Steering must stop, say so, and leave prompt 3 untouched.
  const s = stubs(on, { replies: [verdict('low'), verdict('high')], steps: [usage(45_000, 100), usage(0, 40_000), usage(45_000, 100)] })
  await $.prompt.submit({ text: ASK })
  await run($)
  await s.clock.advance(30_000)
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($)
  await s.clock.advance(30_000)
  await $.prompt.submit({ text: 'now rename the helper in the settings page to something clearer please' })
  await run($)
  expect(s.sent).toEqual(['low', 'high', 'high'])
  expect(s.toasts.some(t => t.includes('prompt cache was rewritten'))).toBe(true)
  expect(s.judged).toHaveLength(2)
})

test('a healthy cache after an effort change keeps steering on', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on, { replies: [verdict('low'), verdict('high'), verdict('low')], steps: [usage(45_000, 100), usage(45_100, 500), usage(45_600, 100)] })
  for (const text of [ASK, 'investigate why the nightly export job corrupts rows when two workers overlap', ASK + ' again']) {
    await $.prompt.submit({ text })
    await run($)
    await s.clock.advance(30_000)
  }
  expect(s.sent).toEqual(['low', 'high', 'low'])
  expect(s.toasts).toHaveLength(0)
})

test('a judge that throws (model error, connection refused) never holds the request back, and is counted', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on, { throwJudge: true })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
  const report = await $.command.run({ command: 'cruise', args: '' } as never)
  expect(JSON.stringify(report)).toContain('judge failures: 1')
})

test('/cruise reports the judge, the pick and the counters', { options: { effort: 'haiku' } }, async ($, on) => {
  stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  const text = JSON.stringify(await $.command.run({ command: 'cruise', args: '' } as never))
  expect(text).toContain('haiku judge')
  expect(text).toContain('now ⚡ low')
  expect(text).toContain('1 judged')
})

test('/cruise says plainly when effort steering is off', { options: { effort: 'off' } }, async ($, on) => {
  stubs(on)
  const text = JSON.stringify(await $.command.run({ command: 'cruise', args: '' } as never))
  expect(text).toContain('Effort    off')
})

test('an unreachable laya server (connection refused) never holds the request back', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { throwJudge: true })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('steer down: if the person lowers the app effort mid-work, the pick never goes above it', { options: { effort: 'haiku', steer: 'down' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('high') })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'high' })
  await run($, { effort: 'medium', index: 1 })
  expect(s.sent).toEqual(['high', 'medium'])
})

test('jev: it is offered every level up to the top level, whatever the app is on, and a lower label lowers an xhigh app', { options: { effort: 'jev' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'high', confidence: 0.9 } } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'xhigh' })
  expect(s.sent).toEqual(['high'])
  expect(Object.keys(JSON.parse(s.calls[0]?.body ?? '{}').questions.effort.criteria)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('jev: a lower label still lowers an xhigh app effort', { options: { effort: 'jev' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: ASK })
  await run($, { effort: 'xhigh' })
  expect(s.sent).toEqual(['low'])
})

test('laya: a trained checkpoint can be named, and the default asks the server to route', { options: { effort: 'laya', judgeModel: 'cruise-effort' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(JSON.parse(s.calls[0]?.body ?? '{}').model).toBe('cruise-effort')
})

test('laya: with no checkpoint named the server routes by language', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(JSON.parse(s.calls[0]?.body ?? '{}').model).toBe('jev-1')
})

test('laya gets the exact two-line text its head is trained on', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(JSON.parse(s.calls[0]?.body ?? '{}').state).toBe(`last reply asked a question: no\nmessage: ${ASK}`)
})

test('jev gets a structured state', { options: { effort: 'jev' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.9 } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(JSON.parse(s.calls[0]?.body ?? '{}').state.next_message).toBe(ASK)
})

test('laya: a "low" that does not reach the median becomes medium', { options: { effort: 'laya' } }, async ($, on) => {
  const unsureLow = JSON.stringify({ answers: { effort: { choice: 'low', probabilities: { low: 0.45, medium: 0.47, high: 0.08 } } } })
  const s = stubs(on, { fetchBody: unsureLow })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['medium'])
})

test('laya: enough weight on "high" lifts the pick even when "low" leads', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', probabilities: { low: 0.3, medium: 0.1, high: 0.6 } } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('the Haiku judge is on by default', async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.judged).toHaveLength(1)
})

test('both ways: on a medium app a hard prompt is lifted to high', { options: { effort: 'haiku', topLevel: 'high' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('high') })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'medium' })
  expect(s.sent).toEqual(['high'])
  expect(s.judged[0]).toContain('Level the app uses by default: medium')
  expect(s.judged[0]).toContain('Highest level allowed: high')
})

test('both ways: a simple prompt on a medium app goes down to low', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('low') })
  await $.prompt.submit({ text: ASK })
  await run($, { effort: 'medium' })
  expect(s.sent).toEqual(['low'])
})

test('both ways: the top level setting decides how high a hard prompt may go', { options: { effort: 'haiku', topLevel: 'max' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('max') })
  await $.prompt.submit({ text: 'rewrite the whole billing engine and migrate every customer' })
  await run($, { effort: 'medium' })
  expect(s.sent).toEqual(['max'])
})

test('both ways: a verdict above the top level is refused and the app effort goes out', { options: { effort: 'haiku', topLevel: 'high' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('xhigh') })
  await $.prompt.submit({ text: 'rewrite the whole billing engine and migrate every customer' })
  await run($, { effort: 'medium' })
  expect(s.sent).toEqual(['medium'])
})

test('laya, five levels: weight on xhigh lifts a medium app to xhigh', { options: { effort: 'laya', topLevel: 'xhigh' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'xhigh', probabilities: { low: 0.05, medium: 0.05, high: 0.1, xhigh: 0.7, max: 0.1 } } } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'medium' })
  expect(s.sent).toEqual(['xhigh'])
})

test('a judge model of your own replaces the default Haiku', { options: { effort: 'haiku', judgeModel: 'claude-haiku-4-5' } }, async ($, on) => {
  const s = stubs(on)
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.models).toEqual(['claude-haiku-4-5'])
})
