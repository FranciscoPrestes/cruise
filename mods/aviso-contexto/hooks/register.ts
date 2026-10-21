import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Level } from '../types'
import { nextWarning, thresholds } from './levels'
import type { Thresholds } from './levels'

const warned = atom({ plugin: 'aviso-contexto', key: 'warned' } as const, 0 as Level)

// A warning is advice: a failure here must never block a turn or a tool.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

async function check($: EngineInterface, limits: Thresholds): Promise<void> {
  const { context } = await $.session.usage()
  const percent = context.percent
  if (percent === undefined) return

  const step = nextWarning(percent, await read($, warned), limits)
  await update($, warned, () => step.warned)
  $.ui.status(step.warned ? `Context ${percent}% · type /handoff` : undefined)

  if (step.show === limits.urgentAt) {
    $.ui.toast(`Context at ${percent}%. Type /handoff now, before compaction.`)
    void $.ui.notify(`Context at ${percent}%: time for a handoff`, { title: 'Claude Code' })
  } else if (step.show) {
    $.ui.toast(`Context at ${percent}%. When you finish this step, type /handoff.`)
  }
}

export const register: Register = (on, options) => {
  const limits = thresholds(options)

  // Checked before every model request and again the moment its response is complete: context only
  // grows between requests, so a long run of steps (with or without tool calls) is warned mid-turn,
  // and a reply that jumps past a threshold is flagged before any tool it asks for runs.
  on('turn.step', async function* ($, e, next) {
    await quietly(check($, limits))
    const result = yield* next(e)
    await quietly(check($, limits))
    return result
  })

  // Also checked after each tool call: its result is already in the context for the next request.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await quietly(check($, limits))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await quietly(check($, limits))
    return result
  })
}
