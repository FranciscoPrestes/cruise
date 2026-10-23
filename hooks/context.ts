import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions } from 'claude-code'

import type { Level } from '../types'
import { nextWarning, thresholds } from './levels'
import type { Thresholds } from './levels'

const warned = atom({ plugin: 'cruise', key: 'contextWarned' } as const, 0 as Level)
const seenModel = atom({ plugin: 'cruise', key: 'contextModel' } as const, '')

// 200000 -> "200K", 1000000 -> "1M": the percentage means little without the window it is a share of.
export const windowLabel = (tokens: number): string => (tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M` : `${Math.round(tokens / 1000)}K`)

// A warning is advice: a failure here must never block a turn or a tool.
const quietly = (work: Promise<unknown>): Promise<void> => work.then(() => undefined, () => undefined)

async function check($: EngineInterface, limits: Thresholds, model?: string): Promise<void> {
  const { context } = await $.session.usage()
  const percent = context.percent
  if (percent === undefined) return
  const of = windowLabel(context.window)

  // A model switch keeps the conversation, but the same tokens are a different share of another model's window:
  // judge the percentage afresh and say why it changed.
  const switched = model !== undefined && (await read($, seenModel)) !== '' && (await read($, seenModel)) !== model
  if (model !== undefined) await update($, seenModel, () => model)
  const step = nextWarning(percent, switched ? 0 : await read($, warned), limits)
  await update($, warned, () => step.warned)
  $.ui.status(step.warned ? `Context ${percent}% of ${of} · type /handoff` : undefined)
  if (switched && step.show) {
    $.ui.toast(`Model changed: the conversation comes with you, and it is ${percent}% of this model's ${of} window. Type /handoff when this step is done.`)
    return
  }

  if (step.show === limits.urgentAt) {
    $.ui.toast(`Context at ${percent}% of ${of}. Type /handoff now, before compaction.`)
    void $.ui.notify(`Context at ${percent}%: time for a handoff`, { title: 'Claude Code' })
  } else if (step.show) {
    $.ui.toast(`Context at ${percent}% of ${of}. When you finish this step, type /handoff.`)
  }
}

export function contextLimits(options: PluginOptions): Thresholds {
  return thresholds(options)
}

// Never throws: a warning is advice, and a failure here must not block a turn or a tool.
export function checkContext($: EngineInterface, limits: Thresholds, model?: string): Promise<void> {
  return quietly(check($, limits, model))
}
