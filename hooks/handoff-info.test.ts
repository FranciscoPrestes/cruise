import { expect, test } from 'claude-code/testing'
import { handoffInfo, pickupTarget } from './handoff-info'

test('latest handoff is selected by time and reports its goal', async () => {
  const $ = { env: { get: async () => '/home/a' }, session: { cwd: async () => '/work' }, fs: { exists: async () => true, list: async () => [{ name: 'old.md', kind: 'file', mtimeMs: 1 }, { name: 'new.md', kind: 'file', mtimeMs: 2 }], read: async () => '### Goal\nFinish work\n' } }
  expect(await handoffInfo($ as never)).toEqual({ status: 'found', path: '/home/a/.local/state/handoffs/-work/new.md', at: 2, goal: 'Finish work' })
})

test('missing and unreadable handoffs are distinct', async () => {
  const $ = { env: { get: async () => '/home/a' }, session: { cwd: async () => '/work' }, fs: { exists: async () => false, list: async () => [], read: async () => '' } }
  expect((await handoffInfo($ as never)).status).toBe('absent')
  $.fs.exists = async () => { throw new Error('unavailable') }
  expect((await handoffInfo($ as never)).status).toBe('unavailable')
})

test('an unreadable latest file reports unavailable', async () => {
  const $ = { env: { get: async () => '/home/a' }, session: { cwd: async () => '/work' }, fs: { exists: async () => true, list: async () => [{ name: 'new.md', kind: 'file', mtimeMs: 2 }], read: async () => { throw new Error('denied') } } }
  expect((await handoffInfo($ as never)).status).toBe('unavailable')
})

test('pickup is offered only in a fresh session with a saved handoff', () => {
  const found = { status: 'found' as const, path: '/home/a/.local/state/handoffs/-work/new.md', at: 2 }
  expect(pickupTarget(0, found)).toBe(found.path)
  expect(pickupTarget(3, found)).toBeNull()
  expect(pickupTarget(0, { status: 'absent' })).toBeNull()
  expect(pickupTarget(0, { status: 'unavailable' })).toBeNull()
})
