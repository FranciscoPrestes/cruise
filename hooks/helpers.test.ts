import { expect, test } from 'claude-code/testing'

import { age, backgroundSummary, cleanAsk, isRealAsk, oneLine, planFromTodos, planSummary } from './helpers'

test('short replies and commands do not become the request', () => {
  expect(isRealAsk('go ahead')).toBe(false)
  expect(isRealAsk('/model opus')).toBe(false)
  expect(isRealAsk('<task-notification> anything long enough to pass the length check')).toBe(false)
  expect(isRealAsk('integrate billing into the planning app')).toBe(true)
})

test('a pasted prompt is the request: the paste wrapper is removed, system notices still are not', () => {
  const pasted = '<pasted_content id="2af8">\nReview the billing module and list every rounding path.\n</pasted_content id="2af8">'
  expect(cleanAsk(pasted)).toBe('Review the billing module and list every rounding path.')
  expect(isRealAsk(cleanAsk(pasted))).toBe(true)
  expect(cleanAsk('before <pasted_content id="1">middle</pasted_content id="1"> after')).toBe('before middle after')
  expect(isRealAsk(cleanAsk('<task-notification> anything long enough to pass the length check'))).toBe(false)
})

test('the minimum length is adjustable', () => {
  expect(isRealAsk('fix the login bug', 10)).toBe(true)
  expect(isRealAsk('fix the login bug', 40)).toBe(false)
})

test('current step and plan total', () => {
  const plan = planFromTodos([
    { content: 'Read code', activeForm: 'Reading code', status: 'completed' },
    { content: 'Write mod', activeForm: 'Writing mod', status: 'in_progress' },
    { content: 'Test', activeForm: 'Testing', status: 'pending' },
  ])
  expect(planSummary(plan)).toBe('Step 2 of 3: Writing mod')
  expect(planSummary({})).toBe(null)
})

test('finished plan', () => {
  const plan = planFromTodos([{ content: 'A', activeForm: 'A', status: 'completed' }])
  expect(planSummary(plan)).toBe('Plan complete: 1 of 1')
})

test('background work is grouped and pluralized', () => {
  expect(backgroundSummary(['subagent', 'subagent', 'shell'])).toBe('2 agents, 1 command')
  expect(backgroundSummary(['schedule'])).toBe('1 schedule')
  expect(backgroundSummary([])).toBe(null)
})

test('age and line cut', () => {
  expect(age(30_000)).toBe('now')
  expect(age(12 * 60_000)).toBe('12 min ago')
  expect(age(72 * 60_000)).toBe('1 h 12 min ago')
  expect(oneLine('abc  def', 5)).toBe('abc …')
})
