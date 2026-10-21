import { expect, test } from 'claude-code/testing'

import { addTask, endedTaskId, removeTask, snapshot } from './tasks'

const note = (id: string, status: string) =>
  `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>t</tool-use-id>\n<status>${status}</status>\n</task-notification>`

test('adding the same task twice keeps one', () => {
  const once = addTask([], { id: 'a', type: 'shell' })
  expect(addTask(once, { id: 'a', type: 'shell' })).toHaveLength(1)
})

test('removing an unknown id changes nothing', () => {
  expect(removeTask([{ id: 'a', type: 'shell' }], 'zzz')).toHaveLength(1)
  expect(removeTask([{ id: 'a', type: 'shell' }], 'a')).toHaveLength(0)
})

test('a snapshot drops subagents and numbers the schedules', () => {
  expect(snapshot([{ id: '1', type: 'subagent' }, { id: '2', type: 'shell' }], [{}, {}])).toEqual([
    { id: '2', type: 'shell' },
    { id: 'cron:0', type: 'schedule' },
    { id: 'cron:1', type: 'schedule' },
  ])
  expect(snapshot(undefined, undefined)).toEqual([])
})

test('a finished notification yields its task id', () => {
  expect(endedTaskId(note('b82', 'completed'))).toBe('b82')
  expect(endedTaskId(note('b82', 'killed'))).toBe('b82')
  expect(endedTaskId(note('b82', 'failed'))).toBe('b82')
})

test('anything else yields nothing', () => {
  expect(endedTaskId(note('b82', 'running'))).toBe(null)
  expect(endedTaskId('hello <task-id>x</task-id> <status>completed</status>')).toBe(null)
  expect(endedTaskId('<task-notification>no id here</task-notification>')).toBe(null)
})
