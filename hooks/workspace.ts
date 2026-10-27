import type { EngineInterface } from 'claude-code'

export type GitFile = { path: string; staged: string; unstaged: string }
export function parseStatus(output: string): GitFile[] {
  const entries = output.split('\0')
  const files: GitFile[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (!entry) continue
    if (entry.length < 4 || entry[2] !== ' ') throw new Error('Invalid Git status')
    const staged = entry[0]!, unstaged = entry[1]!
    files.push({ path: entry.slice(3), staged, unstaged })
    if (staged === 'R' || staged === 'C' || unstaged === 'R' || unstaged === 'C') i++
  }
  return files
}

export async function workspace($: EngineInterface): Promise<{ cwd: string; branch: string; worktree: string; files?: GitFile[] }> {
  const cwd = await $.session.cwd().catch(() => 'unknown')
  try {
    const result = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 2000 })
    if (result.exitCode !== 0) return { cwd, branch: result.stderr.includes('not a git repository') ? 'not a Git repository' : 'Git status unavailable', worktree: '' }
    const [, gitDir, commonDir, branch] = result.stdout.trim().split('\n')
    if (!gitDir || !commonDir || !branch) return { cwd, branch: 'Git status unavailable', worktree: '' }
    const status = await $.process.run(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=normal'], { cwd, timeoutMs: 2000 }).catch(() => undefined)
    let files: GitFile[] | undefined
    try { if (status?.exitCode === 0) files = parseStatus(status.stdout) } catch { /* Git status remains unavailable. */ }
    return { cwd, branch: branch === 'HEAD' ? 'detached HEAD' : branch, worktree: gitDir === commonDir ? 'main checkout' : 'linked worktree', ...(files ? { files } : {}) }
  } catch {
    return { cwd, branch: 'Git status unavailable', worktree: '' }
  }
}
