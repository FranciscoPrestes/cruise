import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions } from 'claude-code'

import type { Level } from '../types'
import { nextWarning, thresholds } from './levels'
import type { Thresholds } from './levels'

const warned = atom({ plugin: 'cruise', key: 'contextWarned' } as const, 0 as Level)

// A warning is advice: a failure here must never block a turn or a tool.
const quietly = (work: Promise<unknown>): Promise<void> => work.then(() => undefined, () => undefined)

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

export function contextLimits(options: PluginOptions): Thresholds {
  return thresholds(options)
}

// Never throws: a warning is advice, and a failure here must not block a turn or a tool.
export function checkContext($: EngineInterface, limits: Thresholds): Promise<void> {
  return quietly(check($, limits))
}
