import { expect, test } from 'claude-code/testing'

// Only the engine below the plugin is stubbed; the plugin's own turn.step hook runs for real.
function stubs(on: any, toasts: string[], sent: unknown[] = []) {
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 0, percent: 70 } } }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } as never })
  on('turn.step', async function* (_$: unknown, e: { effort?: unknown; turnId: string; index: number }) {
    sent.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], usage: null } as never
  })
}

async function step($: any, model: string) {
  for await (const _chunk of $.turn.step({ turnId: 't', index: 0, model, messageCount: 5 } as never)) void _chunk
}

test('a model switch keeps the conversation and says what the percentage now means', async ($, on) => {
  const toasts: string[] = []
  stubs(on, toasts)
  await step($, 'claude-opus-5-5')
  await step($, 'claude-sonnet-5-5')
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toContain('Model changed')
  expect(toasts[1]).toContain('70% of this model')
})

test('the same model does not repeat the warning', async ($, on) => {
  const toasts: string[] = []
  stubs(on, toasts)
  await step($, 'claude-opus-5-5')
  await step($, 'claude-opus-5-5')
  expect(toasts).toHaveLength(1)
})

test('a model Cruise cannot steer is left alone', async ($, on) => {
  const sent: unknown[] = []
  stubs(on, [], sent)
  for await (const _c of $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5-high', effort: 'high', messageCount: 5 } as never)) void _c
  expect(sent).toEqual(['high'])
})
