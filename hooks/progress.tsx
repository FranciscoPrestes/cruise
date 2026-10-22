import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, BgTask, Plan } from '../types'
import { effortParts, judgeMode } from './effort'
import { addTask, endedTaskId, removeTask, snapshot } from './tasks'
import { age, backgroundSummary, isRealAsk, oneLine, planFromTodos, planProgress } from './helpers'

const ask = atom({ plugin: 'cruise', key: 'progressAsk' } as const, null as Ask | null)
const plan = atom({ plugin: 'cruise', key: 'progressPlan' } as const, {} as Plan)
const background = atom({ plugin: 'cruise', key: 'progressBackground' } as const, [] as readonly BgTask[])
const tick = atom({ plugin: 'cruise', key: 'progressTick' } as const, 0)

const TICK_MS = 60_000

// One colour per effort, from calm to costly.
const LEVEL_COLOR: Readonly<Record<string, string>> = { low: 'green', medium: 'cyan', high: 'yellow', xhigh: 'magenta', max: 'red' }

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

// Redraws the band once a minute so "x min ago" does not freeze between events.
export function startProgress($: EngineInterface): void {
  $.clock.every(TICK_MS, () => quietly(update($, tick, n => n + 1)))
}

// The latest real request is what the band shows; a new one clears the previous plan.
export async function noteAsk($: EngineInterface, e: { text: string; command?: unknown; isMeta?: true }, minAskChars: number): Promise<void> {
  if (e.command || e.isMeta || !isRealAsk(e.text, minAskChars)) return
  await quietly(
    $.clock.now().then(at => Promise.all([update($, ask, () => ({ text: e.text, at })), update($, plan, () => ({}))])),
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
    const current = await read($, ask)
    if (e.props.hasSurvey || current === null) return next(e)

    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    await read($, tick) // subscribes this band to the minute tick
    const now = await $.clock.now()
    const steps = planProgress(await read($, plan))
    const effort = showEffort ? await effortParts($) : null
    const bg = backgroundSummary([...(await runningAgents($)), ...(await read($, background)).map(t => t.type)])
    const { Box, Text } = $.ui.resolve(e)

    // Two lines at most: where the work started, then where it is and what it costs.
    const when = ` · ${age(now - current.at)}`
    const bar = steps ? '▰'.repeat(steps.done) + '▱'.repeat(steps.total - steps.done) : ''
    const fixed = steps ? 6 + bar.length + String(steps.n).length + String(steps.total).length : 0
    // Each line is ONE Text with coloured runs inside it: separate boxes in a row broke apart when the terminal was narrow.
    const sep = (here: boolean) => (here ? <Text dimColor>{'  │  '}</Text> : '')
    const stepRuns = steps
      ? [
          <Text color="magenta" bold>{'◆ '}</Text>,
          <Text bold>{`${steps.n}/${steps.total} `}</Text>,
          <Text color="green">{bar}</Text>,
          ` ${oneLine(steps.complete ? 'complete' : steps.title, Math.max(8, Math.floor((width - fixed) / 2)))}`,
        ]
      : []
    const effortRuns =
      effort && 'paused' in effort
        ? [<Text color="yellow">{'⏸ effort steering paused'}</Text>]
        : effort
          ? [
              <Text color={LEVEL_COLOR[effort.pick] ?? 'white'} bold>{`⚡ ${effort.pick}`}</Text>,
              effort.app ? <Text dimColor>{` (app ${effort.app})`}</Text> : '',
              effort.why ? <Text dimColor>{` · ${oneLine(effort.why, 24)}`}</Text> : '',
            ]
          : []
    const bgRuns = bg ? [<Text color="blue">{`⚙ ${bg}`}</Text>] : []
    const second = [stepRuns, effortRuns, bgRuns].filter(g => g.length > 0).flatMap((g, i) => (i === 0 ? g : [sep(true), ...g]))
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="cyan" bold>{'❯ '}</Text>
          {oneLine(current.text, Math.max(10, width - when.length - 2))}
          <Text dimColor>{when}</Text>
        </Text>
        {second.length > 0 ? <Text>{second}</Text> : ''}
      </Box>
    )
  })
}
