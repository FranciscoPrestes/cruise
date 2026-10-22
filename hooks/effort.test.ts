import { expect, mock, test } from 'claude-code/testing'

const ASK = 'change the color of the save button on the settings page to blue'
const verdict = (effort: string, sure = 0.9) => ({ isAnswered: true, text: JSON.stringify({ effort, sure, why: 'test' }), usage: { input_tokens: 100, output_tokens: 20 } })
const usage = (read: number, wrote: number) => ({ input_tokens: 2, output_tokens: 70, cache_read_input_tokens: read, cache_creation_input_tokens: wrote })

type Setup = { sent: unknown[]; judged: string[]; toasts: string[]; calls: { url?: string; auth?: string; body?: string }[]; clock: { advance: (ms: number) => Promise<void> } }

// Everything beneath the plugin is a stub; the plugin's own hooks run for real.
function stubs(on: any, opts: { replies?: unknown[]; reply?: unknown; steps?: ReturnType<typeof usage>[]; fetchBody?: string; throwJudge?: boolean } = {}): Setup {
  const clock = mock.clock(on)
  const out: Setup = { sent: [], judged: [], toasts: [], calls: [], clock }
  let asked = 0
  let step = 0
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('session.messages', async () => ({ value: [] }) as never)
  on('ui.toast', async (_$: unknown, e: { text: string }) => { out.toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 10 } } }) as never)
  on('model.complete', async (_$: unknown, e: { prompt: string }) => { out.judged.push(e.prompt); if (opts.throwJudge) throw new Error('boom'); const r = opts.replies ? opts.replies[asked] : opts.reply; asked += 1; return { value: r ?? verdict('low') } as never })
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

test('off by default: the app effort goes out untouched and no judge is asked', async ($, on) => {
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
  expect(s.judged[0]).toContain('Highest level allowed: high')
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

test('never above the effort the app set: a verdict above it is refused and the request is untouched', { options: { effort: 'haiku' } }, async ($, on) => {
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
  expect(text).toContain('judge haiku')
  expect(text).toContain('current pick: low')
  expect(text).toContain('Verdicts: 1')
})

test('/cruise says plainly when effort steering is off', async ($, on) => {
  stubs(on)
  const text = JSON.stringify(await $.command.run({ command: 'cruise', args: '' } as never))
  expect(text).toContain('effort steering is off')
})

test('an unreachable laya server (connection refused) never holds the request back', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { throwJudge: true })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})

test('if the person lowers the app effort mid-work, the pick never goes above it', { options: { effort: 'haiku' } }, async ($, on) => {
  const s = stubs(on, { reply: verdict('high') })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'high' })
  await run($, { effort: 'medium', index: 1 })
  expect(s.sent).toEqual(['high', 'medium'])
})

test('jev: its highest label keeps an xhigh app effort instead of lowering it', { options: { effort: 'jev' } }, async ($, on) => {
  const body = JSON.stringify({ answers: { effort: { choice: 'high', confidence: 0.9 } } })
  const s = stubs(on, { fetchBody: body })
  await $.prompt.submit({ text: 'investigate why the nightly export job corrupts rows when two workers overlap' })
  await run($, { effort: 'xhigh' })
  expect(s.sent).toEqual(['xhigh'])
  // the hosted judge is offered three levels at most, whatever the app is on
  expect(Object.keys(JSON.parse(s.calls[0]?.body ?? '{}').questions.effort.criteria)).toEqual(['low', 'medium', 'high'])
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

test('laya: an unsure "low" becomes medium, and a plausible "high" is kept', { options: { effort: 'laya' } }, async ($, on) => {
  const unsureLow = JSON.stringify({ answers: { effort: { choice: 'low', probabilities: { low: 0.5, medium: 0.42, high: 0.08 } } } })
  const s = stubs(on, { fetchBody: unsureLow })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['medium'])
})

test('laya: a plausible "high" keeps the app effort even when "low" leads', { options: { effort: 'laya' } }, async ($, on) => {
  const s = stubs(on, { fetchBody: JSON.stringify({ answers: { effort: { choice: 'low', probabilities: { low: 0.6, medium: 0.1, high: 0.3 } } } }) })
  await $.prompt.submit({ text: ASK })
  await run($)
  expect(s.sent).toEqual(['high'])
})
