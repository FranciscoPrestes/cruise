import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from './levels'
import { gauge, HELP } from './panel'

test('the gauge turns yellow at the first warning and red at the urgent one', () => {
  expect(gauge(10, DEFAULTS)).toBe('🟢 ▰▱▱▱▱▱▱▱▱▱ 10%')
  expect(gauge(60, DEFAULTS)).toBe('🟡 ▰▰▰▰▰▰▱▱▱▱ 60%')
  expect(gauge(95, DEFAULTS)).toBe('🔴 ▰▰▰▰▰▰▰▰▰▰ 95%')
})

test('the help names every setting a person can change', () => {
  for (const name of ['context', 'warnAt', 'contextAction', 'effort', 'steer', 'topLevel', 'judgeModel', 'updates']) expect(HELP).toContain(name)
})
