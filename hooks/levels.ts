import type { PluginOptions } from 'claude-code'

import type { Level } from '../types'

export type Thresholds = { warnAt: number; urgentAt: number; resetBelow: number }

// One colour per effort, from calm to costly: the band and the panel draw the same levels alike.
export const LEVEL_COLOR: Readonly<Record<string, string>> = { low: 'green', medium: 'cyan', high: 'yellow', xhigh: 'magenta', max: 'red' }

export const DEFAULTS: Thresholds = { warnAt: 60, urgentAt: 80, resetBelow: 40 }

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

// Reads the user's settings and keeps them coherent: urgent never below the first warning,
// and the reset point never above it (otherwise a warning could never fire again).
export function thresholds(options: PluginOptions): Thresholds {
  const warnAt = num(options.warnAt, DEFAULTS.warnAt)
  return {
    warnAt,
    urgentAt: Math.max(num(options.urgentAt, DEFAULTS.urgentAt), warnAt),
    resetBelow: Math.min(num(options.resetBelow, DEFAULTS.resetBelow), warnAt),
  }
}

// Which warning to give now and what is recorded as already warned.
// Warns once per band; after a compaction (below `resetBelow`) it starts over.
export function nextWarning(percent: number, warned: Level, t: Thresholds = DEFAULTS): { show: Level; warned: Level } {
  if (percent < t.resetBelow) return { show: 0, warned: 0 }
  const level: Level = percent >= t.urgentAt ? t.urgentAt : percent >= t.warnAt ? t.warnAt : 0
  return level > warned ? { show: level, warned: level } : { show: 0, warned }
}
