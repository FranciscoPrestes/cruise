import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, BgTask, Plan } from '../types'
import { addTask, endedTaskId, removeTask, snapshot } from './tasks'
import { backgroundSummary, cleanAsk, isRealAsk, planFromTodos, planProgress } from './helpers'

const ask = atom({ plugin: 'cruise', key: 'progressAsk' } as const, null as Ask | null)
const plan = atom({ plugin: 'cruise', key: 'progressPlan' } as const, {} as Plan)
const background = atom({ plugin: 'cruise', key: 'progressBackground' } as const, [] as readonly BgTask[])
const expanded = atom({ plugin: 'cruise', key: 'progressExpanded' } as const, false)

// The band is informational only: a failure here must never block a prompt or a tool.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

const field = (result: unknown, key: string) => (result as Record<string, string | undefined> | undefined)?.[key]

async function track($: EngineInterface, type: string, id: string | undefined): Promise<void> {
  if (id) await quietly(update($, background, list => addTask(list, { id, type })))
}

// Any tool can start a background shell (Bash with run_in_background, a command sent to the background
// with Ctrl+B or by its timeout, another shell tool): they all report it as `backgroundTaskId`.
export async function trackShell($: EngineInterface, out: { result?: unknown }): Promise<void> {
  await track($, 'shell', field(out.result, 'backgroundTaskId'))
}

async function untrack($: EngineInterface, id: string | undefined): Promise<void> {
  if (id) await quietly(update($, background, list => removeTask(list, id)))
}

// What the Progress section of the /cruise dashboard shows: the request, how long ago, the plan step, background work and whether the request is open.
// The tracking runs all the time (a few small state writes per prompt and tool call); only the dashboard draws it.
export type ProgressFacts = {
  ask: Ask | null
  now: number
  expanded: boolean
  step: ReturnType<typeof planProgress>
  background: string | null
  details?: readonly string[] | null
}

export async function progressFacts($: EngineInterface): Promise<ProgressFacts> {
  const agents = await $.agent.list().catch(() => undefined)
  const tasks = await read($, background)
  return {
    ask: await read($, ask),
    now: await $.clock.now().catch(() => 0),
    expanded: await read($, expanded),
    step: planProgress(await read($, plan)),
    background: agents ? backgroundSummary([...agents.filter(a => a.status === 'running').map(() => 'subagent'), ...tasks.map(t => t.type)]) : [backgroundSummary(tasks.map(t => t.type)), 'agents unavailable'].filter(Boolean).join(' · '),
    details: [...(agents ? agents.filter(a => a.status === 'running').map(a => `${a.description || a.id} · ${a.type} · ${a.status}`) : ['agents unavailable']), ...tasks.map(t => `${t.type} · ${t.id}`)],
  }
}

// Opens or closes the request (the control beside it in the dashboard).
export async function toggleAsk($: EngineInterface): Promise<void> {
  await quietly(update($, expanded, open => !open))
}

// A session always starts with the request closed.
export function startProgress($: EngineInterface): void {
  void quietly(update($, expanded, () => false))
}

// The latest real request is what the dashboard shows; a new one clears the previous plan and closes the request.
export async function noteAsk($: EngineInterface, e: { text: string; command?: unknown; isMeta?: true }, minAskChars: number): Promise<void> {
  const text = cleanAsk(e.text)
  if (e.command || e.isMeta || !isRealAsk(text, minAskChars)) return
  await quietly(
    $.clock.now().then(at => Promise.all([update($, ask, () => ({ text, at })), update($, plan, () => ({})), update($, expanded, () => false)])),
  )
}

export const registerProgress: Register = on => {
  // The plan is the main conversation's: a subagent's task list must not overwrite it.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    await quietly(update($, plan, () => planFromTodos(e.todos)))
    return next(e)
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const out = await next(e)
    const id = (out.result as { task?: { id?: string } } | undefined)?.task?.id
    if (id) await quietly(update($, plan, p => ({ ...p, [id]: { title: e.subject, status: 'pending' as const } })))
    return out
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const { taskId, status, activeForm, subject } = e
    await quietly(update($, plan, p => {
      const step = p[taskId]
      if (!step) return p
      if (status === 'deleted') return Object.fromEntries(Object.entries(p).filter(([k]) => k !== taskId))
      const title = status === 'in_progress' ? activeForm ?? subject ?? step.title : subject ?? step.title
      return { ...p, [taskId]: { title, status: status ?? step.status } }
    }))
    return next(e)
  })

  // Background work is tracked as it starts and ends, so the count does not wait for a turn to finish.
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const out = await next(e)
    await track($, 'monitor', field(out.result, 'taskId'))
    return out
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const out = await next(e)
    await track($, 'workflow', field(out.result, 'taskId'))
    return out
  })

  on('tool.call', { tool: 'CronCreate' }, async ($, e, next) => {
    const out = await next(e)
    await track($, 'schedule', field(out.result, 'id'))
    return out
  })

  on('tool.call', { tool: 'CronDelete' }, async ($, e, next) => {
    await untrack($, e.id)
    return next(e)
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    await untrack($, e.task_id ?? e.shell_id)
    return next(e)
  })

  // A task that ends on its own announces itself with a notification row.
  on('session.append', async ($, e, next) => {
    const text = e.message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    await untrack($, endedTaskId(text) ?? undefined)
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    await quietly(update($, background, () => snapshot(e.background_tasks, e.session_crons)))
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await quietly(update($, background, () => snapshot(e.background_tasks, e.session_crons)))
    return next(e)
  })
}
