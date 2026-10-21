import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, BgTask, Plan } from '../types'
import { addTask, endedTaskId, removeTask, snapshot } from './tasks'
import { DEFAULT_MIN_ASK_CHARS, age, backgroundSummary, isRealAsk, oneLine, planFromTodos, planSummary } from './helpers'

const ask = atom({ plugin: 'onde-estamos', key: 'ask' } as const, null as Ask | null)
const plan = atom({ plugin: 'onde-estamos', key: 'plan' } as const, {} as Plan)
const background = atom({ plugin: 'onde-estamos', key: 'background' } as const, [] as readonly BgTask[])
const tick = atom({ plugin: 'onde-estamos', key: 'tick' } as const, 0)

const TICK_MS = 60_000

// The band is informational only: a failure here must never block a prompt or a tool.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

const field = (result: unknown, key: string) => (result as Record<string, string | undefined> | undefined)?.[key]

async function track($: EngineInterface, type: string, id: string | undefined): Promise<void> {
  if (id) await quietly(update($, background, list => addTask(list, { id, type })))
}

async function untrack($: EngineInterface, id: string | undefined): Promise<void> {
  if (id) await quietly(update($, background, list => removeTask(list, id)))
}

// Subagents are read live from the engine; everything else comes from the last Stop snapshot.
async function runningAgents($: EngineInterface): Promise<readonly string[]> {
  const agents = await $.agent.list().catch(() => [])
  return agents.filter(a => a.status === 'running').map(() => 'subagent')
}

export const register: Register = (on, options) => {
  const minAskChars = typeof options.minAskChars === 'number' ? options.minAskChars : DEFAULT_MIN_ASK_CHARS

  // Redraws the band once a minute so "x min ago" does not freeze between events.
  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, () => quietly(update($, tick, n => n + 1)))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && isRealAsk(e.text, minAskChars)) {
      await quietly(
        $.clock.now().then(at =>
          Promise.all([update($, ask, () => ({ text: e.text, at })), update($, plan, () => ({}))]),
        ),
      )
    }
    return next(e)
  })

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
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const out = await next(e)
    await track($, 'shell', field(out.result, 'backgroundTaskId'))
    return out
  })

  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const out = await next(e)
    await track($, 'monitor', field(out.result, 'taskId'))
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
    const steps = planSummary(await read($, plan))
    const bg = backgroundSummary([...(await runningAgents($)), ...(await read($, background)).map(t => t.type)])
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>{oneLine(`Request (${age(now - current.at)}): ${current.text}`, width)}</Text>
        {steps && <Text>{oneLine(steps, width)}</Text>}
        {bg && <Text dimColor>{oneLine(`Running in background: ${bg}`, width)}</Text>}
      </Box>
    )
  })
}
