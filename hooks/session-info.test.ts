import { expect, test } from 'claude-code/testing'
import { observeActivity, resetActivity, sessionInfo } from './session-info'

test('shows observed timing and explicitly unavailable model', async () => {
  resetActivity(1000)
  observeActivity(2000)
  const $ = { session: { model: async () => { throw new Error('unavailable') } }, clock: { now: async () => 4000 } }
  expect(await sessionInfo($ as never)).toEqual({ model: undefined, now: 4000, started: 1000, activity: 2000 })
})

test('a new session clears the prior observed activity', async () => {
  resetActivity(1000)
  observeActivity(2000, 'using Bash')
  resetActivity(3000)
  const $ = { session: { model: async () => 'model' }, clock: { now: async () => 4000 } }
  expect(await sessionInfo($ as never)).toEqual({ model: 'model', now: 4000, started: 3000, activity: undefined })
})
