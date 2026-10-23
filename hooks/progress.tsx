import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, BgTask, Plan } from '../types'
import { AskBlock } from './ask-block'
import { askView } from './ask'
import { fitRuns } from './dash'
import type { Run } from './dash'
import { effortParts, judgeMode } from './effort'
import { LEVEL_COLOR } from './levels'
import { addTask, endedTaskId, removeTask, snapshot } from './tasks'
import { age, backgroundSummary, cleanAsk, isRealAsk, oneLine, planFromTodos, planProgress } from './helpers'

const ask = atom({ plugin: 'cruise', key: 'progressAsk' } as const, null as Ask | null)
const plan = atom({ plugin: 'cruise', key: 'progressPlan' } as const, {} as Plan)
const background = atom({ plugin: 'cruise', key: 'progressBackground' } as const, [] as readonly BgTask[])
const tick = atom({ plugin: 'cruise', key: 'progressTick' } as const, 0)
const expanded = atom({ plugin: 'cruise', key: 'progressExpanded' } as const, false)

const TICK_MS = 60_000

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

// Subagents are read live from the engine; everything else comes from the last Stop snapshot.
async function runningAgents($: EngineInterface): Promise<readonly string[]> {
  const agents = await $.agent.list().catch(() => [])
  return agents.filter(a => a.status === 'running').map(() => 'subagent')
}

// What the band and the /cruise dashboard both show: the request, how long ago, the plan step, background work and whether the request is open.
// Reading the tick redraws both once a minute.
export type ProgressFacts = {
  ask: Ask | null
  now: number
  expanded: boolean
  step: ReturnType<typeof planProgress>
  background: string | null
}

export async function progressFacts($: EngineInterface): Promise<ProgressFacts> {
  await read($, tick)
  return {
    ask: await read($, ask),
    now: await $.clock.now(),
    expanded: await read($, expanded),
    step: planProgress(await read($, plan)),
    background: backgroundSummary([...(await runningAgents($)), ...(await read($, background)).map(t => t.type)]),
  }
}

// Opens or closes the request (the control beside it; the same state serves the band and the dashboard).
export async function toggleAsk($: EngineInterface): Promise<void> {
  await quietly(update($, expanded, open => !open))
}

// Redraws the band once a minute so "x min ago" does not freeze between events. A session always starts with the request closed.
export function startProgress($: EngineInterface): void {
  void quietly(update($, expanded, () => false))
  $.clock.every(TICK_MS, () => quietly(update($, tick, n => n + 1)))
}

// The latest real request is what the band shows; a new one clears the previous plan.
export async function noteAsk($: EngineInterface, e: { text: string; command?: unknown; isMeta?: true }, minAskChars: number): Promise<void> {
  const text = cleanAsk(e.text)
  if (e.command || e.isMeta || !isRealAsk(text, minAskChars)) return
  await quietly(
    $.clock.now().then(at => Promise.all([update($, ask, () => ({ text, at })), update($, plan, () => ({})), update($, expanded, () => false)])),
  )
}

export const registerProgress: Register = (on, options) => {
  const showEffort = judgeMode(options) !== 'off'

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const facts = await progressFacts($)
    const current = facts.ask
    if (e.props.hasSurvey || current === null) return next(e)

    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    const effort = showEffort ? await effortParts($) : null
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    // Always collapsed to at most three rows, whatever the room: the request in two (a control opens it whole), then one row
    // for where the work is, what it costs and how long ago it was asked.
    const view = askView(current.text, width - 2, facts.expanded)
    const steps = facts.step
    const bar = steps ? '▰'.repeat(steps.done) + '▱'.repeat(steps.total - steps.done) : ''
    const stepRuns: Run[] = steps
      ? [{ text: '◆ ', color: 'magenta', bold: true }, { text: `${steps.n}/${steps.total} `, bold: true }, { text: bar, color: 'green' }, { text: ` ${oneLine(steps.complete ? 'complete' : steps.title, Math.max(8, Math.floor(width / 3)))}` }]
      : []
    const effortRuns: Run[] =
      effort && 'paused' in effort
        ? [{ text: '⏸ effort steering paused', color: 'yellow' }]
        : effort
          ? [{ text: `⚡ ${effort.pick}`, color: LEVEL_COLOR[effort.pick] ?? 'white', bold: true }, ...(effort.app ? [{ text: ` (app ${effort.app})`, dim: true }] : []), ...(effort.why ? [{ text: ` · ${oneLine(effort.why, 24)}`, dim: true }] : [])]
          : []
    const bgRuns: Run[] = facts.background ? [{ text: `⚙ ${facts.background}`, color: 'blue' }] : []
    const whenRuns: Run[] = [{ text: age(facts.now - current.at), dim: true }]
    // One Text for the whole row, its runs coloured inside it: separate boxes in a row broke apart when the terminal was narrow.
    const sep: Run = { text: '  │  ', dim: true }
    const second = fitRuns(
      [whenRuns, stepRuns, effortRuns, bgRuns].filter(g => g.length > 0).flatMap((g, i) => (i === 0 ? g : [sep, ...g])),
      width,
    )
    const request = AskBlock(ui, view, () => void toggleAsk($), 'ask-more')
    const status = <Text>{second.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text>
    // Open, the request can be taller than the band's room and the engine scrolls it: the status row goes first so it never scrolls away.
    return <Box flexDirection="column">{facts.expanded ? [status, request] : [request, status]}</Box>
  })
}
