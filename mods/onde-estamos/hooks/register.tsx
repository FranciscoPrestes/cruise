import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, Plan } from '../types'
import { DEFAULT_MIN_ASK_CHARS, age, backgroundSummary, isRealAsk, oneLine, planFromTodos, planSummary } from './helpers'

const ask = atom({ plugin: 'onde-estamos', key: 'ask' } as const, null as Ask | null)
const plan = atom({ plugin: 'onde-estamos', key: 'plan' } as const, {} as Plan)
const background = atom({ plugin: 'onde-estamos', key: 'background' } as const, [] as readonly string[])
const tick = atom({ plugin: 'onde-estamos', key: 'tick' } as const, 0)

const TICK_MS = 60_000

// The band is informational only: a failure here must never block a prompt or a tool.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

// Subagents are read live from the engine; everything else comes from the last Stop snapshot.
async function runningAgents($: EngineInterface): Promise<readonly string[]> {
  const agents = await $.agent.list().catch(() => [])
  return agents.filter(a => a.status === 'running').map(() => 'subagent')
}

const otherBackground = (tasks: readonly { type: string }[] | undefined, crons: readonly unknown[] | undefined) => [
  ...(tasks ?? []).map(t => t.type).filter(t => t !== 'subagent'),
  ...(crons ?? []).map(() => 'schedule'),
]

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

  on('classic.Stop', async ($, e, next) => {
    await quietly(update($, background, () => otherBackground(e.background_tasks, e.session_crons)))
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await quietly(update($, background, () => otherBackground(e.background_tasks, e.session_crons)))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, ask)
    if (e.props.hasSurvey || current === null) return next(e)

    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    await read($, tick) // subscribes this band to the minute tick
    const now = await $.clock.now()
    const steps = planSummary(await read($, plan))
    const bg = backgroundSummary([...(await runningAgents($)), ...(await read($, background))])
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
