import { expect, test } from 'claude-code/testing'

import { nextWarning, thresholds } from './levels'

test('below 60% it does not warn', () => {
  expect(nextWarning(50, 0)).toEqual({ show: 0, warned: 0 })
})

test('warns once when passing 60%', () => {
  expect(nextWarning(61, 0)).toEqual({ show: 60, warned: 60 })
  expect(nextWarning(70, 60)).toEqual({ show: 0, warned: 60 })
})

test('warns again, urgently, when passing 80%', () => {
  expect(nextWarning(81, 60)).toEqual({ show: 80, warned: 80 })
  expect(nextWarning(95, 80)).toEqual({ show: 0, warned: 80 })
})

test('starts over after a compaction', () => {
  expect(nextWarning(30, 80)).toEqual({ show: 0, warned: 0 })
})

test('does not reset between the reset point and the first warning', () => {
  expect(nextWarning(50, 60)).toEqual({ show: 0, warned: 60 })
})

test('custom thresholds apply', () => {
  const t = thresholds({ warnAt: 75, urgentAt: 90, resetBelow: 30 })
  expect(nextWarning(76, 0, t)).toEqual({ show: 75, warned: 75 })
  expect(nextWarning(91, 75, t)).toEqual({ show: 90, warned: 90 })
})

test('incoherent settings are corrected, not trusted', () => {
  expect(thresholds({ warnAt: 80, urgentAt: 70, resetBelow: 95 })).toEqual({ warnAt: 80, urgentAt: 80, resetBelow: 80 })
})

test('missing or invalid settings fall back to the defaults', () => {
  expect(thresholds({ warnAt: 'x' as never })).toEqual({ warnAt: 60, urgentAt: 80, resetBelow: 40 })
})
