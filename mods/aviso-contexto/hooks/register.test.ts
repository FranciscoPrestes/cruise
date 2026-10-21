import { expect, test } from 'claude-code/testing'

const usage = (percent: number | undefined) =>
  ({ value: { startedAt: 0, context: { window: 200000, tokens: 0, percent } } }) as never

test('after a turn above 75% it shows the status line with /handoff', async ($, on) => {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('session.usage', async () => usage(78))
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' })
  expect(statuses.at(-1)).toContain('/handoff')
  expect(toasts).toHaveLength(1)
})

test('mid-turn: a tool call above 75% already warns', async ($, on) => {
  const toasts: string[] = []
  on('session.usage', async () => usage(80))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('tool.call', async () => ({ result: {} }) as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'true' } } as never)
  expect(toasts).toHaveLength(1)
})

test('warns once per band, not on every call', async ($, on) => {
  const toasts: string[] = []
  on('session.usage', async () => usage(80))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('tool.call', async () => ({ result: {} }) as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'true' } } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'true' } } as never)
  expect(toasts).toHaveLength(1)
})

test('at 90% it also sends a system notification', async ($, on) => {
  const notified: string[] = []
  on('session.usage', async () => usage(92))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.notify', async (_$, e) => { notified.push(e.message); return { value: undefined } as never })
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2' })
  expect(notified).toHaveLength(1)
})

test('a failing usage lookup never breaks the turn', async ($, on) => {
  on('session.usage', async () => { throw new Error('boom') })
  on('turn.complete', async () => ({ text: 'done' }))
  const out = await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't3' })
  expect(out).toBeDefined()
})

test('custom thresholds from settings are honored', { options: { warnAt: 50, urgentAt: 60, resetBelow: 20 } }, async ($, on) => {
  const toasts: string[] = []
  on('session.usage', async () => usage(55))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't4' })
  expect(toasts).toHaveLength(1)
})

test('before a model request it already warns, even with no tool call in the step', async ($, on) => {
  const toasts: string[] = []
  on('session.usage', async () => usage(85))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('turn.step', async function* (_$, _e, _next) {
    yield { kind: 'text', index: 0, text: 'ok' } as never
    return { turnId: 't5', index: 3, answer: 'ok', toolUses: [] } as never
  })
  const chunks: unknown[] = []
  for await (const chunk of $.turn.step({ turnId: 't5', index: 3, model: 'm', messageCount: 40 } as never)) chunks.push(chunk)
  expect(chunks).toHaveLength(1)
  expect(toasts).toHaveLength(1)
})

test('a response that jumps past the threshold is flagged as soon as it completes', async ($, on) => {
  const toasts: string[] = []
  let calls = 0
  // 50% before the request, 85% once the response is complete.
  on('session.usage', async () => usage(++calls === 1 ? 50 : 85))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('turn.step', async function* (_$, _e, _next) {
    yield { kind: 'text', index: 0, text: 'big reply' } as never
    return { turnId: 't6', index: 0, answer: 'big reply', toolUses: [] } as never
  })
  for await (const _chunk of $.turn.step({ turnId: 't6', index: 0, model: 'm', messageCount: 10 } as never)) void _chunk
  expect(toasts).toHaveLength(1)
})
