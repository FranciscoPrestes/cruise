import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Ask, Plan } from '../types'
import { age, backgroundSummary, isRealAsk, oneLine, planFromTodos, planSummary } from './helpers'

const ask = atom({ plugin: 'onde-estamos', key: 'ask' } as const, null as Ask | null)
const plan = atom({ plugin: 'onde-estamos', key: 'plan' } as const, {} as Plan)
const background = atom({ plugin: 'onde-estamos', key: 'background' } as const, [] as readonly string[])

// A faixa é só informativa: falha aqui nunca pode travar prompt nem ferramenta.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && isRealAsk(e.text)) {
      await quietly(
        $.clock.now().then(at =>
          Promise.all([update($, ask, () => ({ text: e.text, at })), update($, plan, () => ({}))]),
        ),
      )
    }
    return next(e)
  })

  // O plano é o da conversa principal: a lista de tarefas de um subagente não o sobrescreve.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    await quietly(update($, plan, () => planFromTodos(e.input.todos)))
    return next(e)
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const out = await next(e)
    const id = out.result?.task?.id
    if (id) await quietly(update($, plan, p => ({ ...p, [id]: { title: e.input.subject, status: 'pending' } })))
    return out
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const { taskId, status, activeForm, subject } = e.input
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
    const types = [
      ...(e.background_tasks ?? []).map(t => t.type),
      ...(e.session_crons ?? []).map(() => 'agendamento'),
    ]
    await quietly(update($, background, () => types))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, ask)
    if (e.props.hasSurvey || current === null) return next(e)

    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    const now = await $.clock.now()
    const steps = planSummary(await read($, plan))
    const bg = backgroundSummary(await read($, background))
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>{oneLine(`Pedido (${age(now - current.at)}): ${current.text}`, width)}</Text>
        {steps && <Text>{oneLine(steps, width)}</Text>}
        {bg && <Text dimColor>{oneLine(`Em segundo plano: ${bg}`, width)}</Text>}
      </Box>
    )
  })
}
