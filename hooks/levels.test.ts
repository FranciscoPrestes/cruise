import { expect, test } from 'claude-code/testing'

import { nextWarning, thresholds } from './levels'

test('below 75% it does not warn', () => {
  expect(nextWarning(60, 0)).toEqual({ show: 0, warned: 0 })
})

test('warns once when passing 75%', () => {
  expect(nextWarning(76, 0)).toEqual({ show: 75, warned: 75 })
  expect(nextWarning(80, 75)).toEqual({ show: 0, warned: 75 })
})

test('warns again, urgently, when passing 90%', () => {
  expect(nextWarning(91, 75)).toEqual({ show: 90, warned: 90 })
  expect(nextWarning(95, 90)).toEqual({ show: 0, warned: 90 })
})

test('starts over after a compaction', () => {
  expect(nextWarning(30, 90)).toEqual({ show: 0, warned: 0 })
})

test('does not reset between the reset point and the first warning', () => {
  expect(nextWarning(60, 75)).toEqual({ show: 0, warned: 75 })
})

test('custom thresholds apply', () => {
  const t = thresholds({ warnAt: 60, urgentAt: 80, resetBelow: 30 })
  expect(nextWarning(65, 0, t)).toEqual({ show: 60, warned: 60 })
  expect(nextWarning(85, 60, t)).toEqual({ show: 80, warned: 80 })
})

test('incoherent settings are corrected, not trusted', () => {
  expect(thresholds({ warnAt: 80, urgentAt: 70, resetBelow: 95 })).toEqual({ warnAt: 80, urgentAt: 80, resetBelow: 80 })
})

test('missing or invalid settings fall back to the defaults', () => {
  expect(thresholds({ warnAt: 'x' as never })).toEqual({ warnAt: 75, urgentAt: 90, resetBelow: 50 })
})
