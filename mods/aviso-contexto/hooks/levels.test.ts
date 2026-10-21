import { expect, test } from 'claude-code/testing'

import { nextWarning } from './levels'

test('abaixo de 75% não avisa', () => {
  expect(nextWarning(60, 0)).toEqual({ show: 0, warned: 0 })
})

test('avisa uma vez ao passar de 75%', () => {
  expect(nextWarning(76, 0)).toEqual({ show: 75, warned: 75 })
  expect(nextWarning(80, 75)).toEqual({ show: 0, warned: 75 })
})

test('avisa de novo, urgente, ao passar de 90%', () => {
  expect(nextWarning(91, 75)).toEqual({ show: 90, warned: 90 })
  expect(nextWarning(95, 90)).toEqual({ show: 0, warned: 90 })
})

test('zera depois da compactação', () => {
  expect(nextWarning(30, 90)).toEqual({ show: 0, warned: 0 })
})
