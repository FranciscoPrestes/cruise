import type { BgTask } from '../types'

const ENDED = new Set(['completed', 'failed', 'killed'])

export const addTask = (list: readonly BgTask[], task: BgTask): readonly BgTask[] =>
  list.some(t => t.id === task.id) ? list : [...list, task]

export const removeTask = (list: readonly BgTask[], id: string): readonly BgTask[] => list.filter(t => t.id !== id)

// Ground truth from a Stop / SubagentStop: replaces whatever was tracked. Subagents are read live instead.
export function snapshot(tasks: readonly { id: string; type: string }[] | undefined, crons: readonly unknown[] | undefined): readonly BgTask[] {
  return [
    ...(tasks ?? []).filter(t => t.type !== 'subagent').map(t => ({ id: t.id, type: t.type })),
    ...(crons ?? []).map((_, i) => ({ id: `cron:${i}`, type: 'schedule' })),
  ]
}

// The id of the task a notification row says has ended, or null for any other text.
// Row text looks like: <task-notification><task-id>ID</task-id>...<status>completed</status>...
export function endedTaskId(text: string): string | null {
  if (!text.trimStart().startsWith('<task-notification>')) return null
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1]
  const status = /<status>([^<]+)<\/status>/.exec(text)?.[1]
  return id && status && ENDED.has(status) ? id : null
}
