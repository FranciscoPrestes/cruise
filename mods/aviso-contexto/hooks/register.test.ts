import { expect, test } from 'claude-code/testing'

test('ao passar de 75% mostra a linha de status com /handoff', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 156000, percent: 78 } } }) as never)
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' })
  expect(statuses.at(-1)).toContain('/handoff')
})
