// What /cruise prints: the state of every feature and how to change it, in plain text with a few colour dots.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { contextLimits } from './context'
import { judgeMode, report } from './effort'
import type { Thresholds } from './levels'
import { updateLine, updateMode } from './updates'
import { VERSION } from './version'

const BAR_WIDTH = 10

// ▰▰▰▰▰▰▱▱▱▱ with a dot that turns yellow at the first warning and red at the urgent one.
export function gauge(percent: number, limits: Thresholds): string {
  const lit = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)))
  const dot = percent >= limits.urgentAt ? '🔴' : percent >= limits.warnAt ? '🟡' : '🟢'
  return `${dot} ${'▰'.repeat(lit)}${'▱'.repeat(BAR_WIDTH - lit)} ${percent}%`
}

export const HELP = [
  'Settings: context · warnAt/urgentAt · progress · effort · steer · topLevel · judgeModel · updates',
  'Change any: /cruise:configure (a short conversation) or /plugin configure cruise@prestes',
  'Update now: /cruise:update   ·   Long session: /handoff, then /pickup',
].join('\n')

const LABEL_WIDTH = 12
const row = (dot: string, label: string, text: string): string => `${dot} ${label.padEnd(LABEL_WIDTH - 2)}${text}`
const RULE = '─'.repeat(64)

async function contextRow($: EngineInterface, options: PluginOptions): Promise<string> {
  if (options.context === false) return row('⚪', 'Context', 'off · turn on with /cruise:configure')
  const limits = contextLimits(options)
  const percent = await $.session.usage().then(u => u.context.percent, () => undefined)
  const warns = `warns at ${limits.warnAt}% and ${limits.urgentAt}%`
  if (percent === undefined) return row('🟢', 'Context', warns)
  const [dot = '🟢', ...bar] = gauge(percent, limits).split(' ')
  return row(dot, 'Context', `${bar.join(' ')}  ·  ${warns}`)
}

export async function panel($: EngineInterface, options: PluginOptions): Promise<string> {
  const progress = options.progress === true ? row('🟢', 'Progress', 'two lines above the prompt: request, step, effort, background') : row('⚪', 'Progress', 'off · turn on with /cruise:configure')
  const mode = judgeMode(options)
  const effort = row(mode === 'off' ? '⚪' : '🟢', 'Effort', await report($, options, LABEL_WIDTH + 1))
  const updates = await updateLine($, updateMode(options))
  return [
    `✈  Cruise ${VERSION}  ·  cruise control for Claude Code`,
    RULE,
    await contextRow($, options),
    progress,
    effort,
    row(updates.includes('available') ? '🟡' : '🟢', 'Updates', updates),
    RULE,
    HELP,
  ].join('\n')
}
