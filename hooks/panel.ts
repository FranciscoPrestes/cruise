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
  'Change a setting:  /cruise:configure  (a short conversation)  or  /plugin configure cruise@prestes',
  '  context        true | false             context warnings and /handoff reminders',
  '  warnAt/urgentAt  numbers (60 / 80)      where the two warnings fire',
  '  progress       true | false             the band above the prompt',
  '  effort         haiku | jev | laya | off   who judges the effort',
  '  steer          both | down              both = up or down from your app\'s effort, down = only lower',
  '  topLevel       high | xhigh | max       the highest effort the judge may pick',
  '  judgeModel     a model or checkpoint name   the judge\'s model (Haiku by default)',
  '  updates        check | auto | off       daily update check (check = ask before installing)',
  'Update now: /cruise:update   ·   Hand off a long session: /handoff, then /pickup',
].join('\n')

async function contextLine($: EngineInterface, options: PluginOptions): Promise<string> {
  if (options.context === false) return 'Context warnings: off (setting "context")'
  const limits = contextLimits(options)
  const percent = await $.session.usage().then(u => u.context.percent, () => undefined)
  const now = percent === undefined ? '' : `${gauge(percent, limits)}  ·  `
  return `Context warnings: ${now}warns at ${limits.warnAt}% and ${limits.urgentAt}%`
}

export async function panel($: EngineInterface, options: PluginOptions): Promise<string> {
  const progress = options.progress === false ? 'Progress band: off (setting "progress")' : 'Progress band: on, above the prompt'
  const effort = judgeMode(options) === 'off' ? 'Effort steering: off (setting "effort")' : await report($, options)
  return [
    `Cruise ${VERSION}`,
    '',
    await contextLine($, options),
    progress,
    effort,
    await updateLine($, updateMode(options)),
    '',
    HELP,
  ].join('\n')
}
