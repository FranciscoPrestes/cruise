import { expect, test } from 'claude-code/testing'
import { parseStatus, workspace } from './workspace'

test('git status handles mixed changes, untracked files and renamed paths', () => {
  expect(parseStatus('MM file a\0?? new file\0R  new name\0old name\0')).toEqual([
    { path: 'file a', staged: 'M', unstaged: 'M' },
    { path: 'new file', staged: '?', unstaged: '?' },
    { path: 'new name', staged: 'R', unstaged: ' ' },
  ])
})

test('workspace reports clean status and preserves unavailable status on Git failure', async () => {
  let fail = false
  const $ = { session: { cwd: async () => '/work' }, process: { run: async (argv: string[]) => argv[1] === 'rev-parse' ? { exitCode: 0, stdout: '/work\n/work/.git\n/work/.git\nmain\n', stderr: '' } : { exitCode: fail ? 1 : 0, stdout: '', stderr: '' } } }
  expect((await workspace($ as never)).files).toEqual([])
  fail = true
  expect((await workspace($ as never)).files).toBeUndefined()
})

test('workspace reports the session folder, branch and linked worktree', async () => {
  const $ = { session: { cwd: async () => '/work/demo/subdir' }, process: { run: async () => ({ exitCode: 0, stdout: '/work/demo\n/work/main/.git/worktrees/demo\n/work/main/.git\nfeature\n', stderr: '' }) } }
  expect(await workspace($ as never)).toEqual({ cwd: '/work/demo/subdir', branch: 'feature', worktree: 'linked worktree' })
})

test('workspace distinguishes the main checkout, detached HEAD and a non-repository', async () => {
  let result = { exitCode: 0, stdout: '/work/main\n/work/main/.git\n/work/main/.git\nHEAD\n', stderr: '' }
  const $ = { session: { cwd: async () => '/work/main' }, process: { run: async () => result } }
  expect(await workspace($ as never)).toEqual({ cwd: '/work/main', branch: 'detached HEAD', worktree: 'main checkout' })
  result = { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
  expect(await workspace($ as never)).toEqual({ cwd: '/work/main', branch: 'not a Git repository', worktree: '' })
})
