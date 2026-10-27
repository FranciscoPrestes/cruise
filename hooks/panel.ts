// What /cruise prints: the state of every feature and how to change it, in plain text with a few colour dots.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { contextLimits } from './context'
import { judgeMode, report } from './effort'
import type { Thresholds } from './levels'
import { updateLine, updateMode } from './updates'
import { VERSION } from './version'
import { workspace } from './workspace'
import { handoffInfo } from './handoff-info'
import { sessionInfo } from './session-info'
import { progressFacts } from './progress'
import { loadRelay } from './relay'
import { age } from './helpers'

const BAR_WIDTH = 10

// ▰▰▰▰▰▰▱▱▱▱ with a dot that turns yellow at the first warning and red at the urgent one.
export function gauge(percent: number, limits: Thresholds): string {
  const lit = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)))
  const dot = percent >= limits.urgentAt ? '🔴' : percent >= limits.warnAt ? '🟡' : '🟢'
  return `${dot} ${'▰'.repeat(lit)}${'▱'.repeat(BAR_WIDTH - lit)} ${percent}%`
}

export const HELP = [
  'Settings: context · warnAt/urgentAt · contextAction · effort · steer · topLevel · judgeModel · updates',
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
  const mode = judgeMode(options)
  const effort = row(mode === 'off' ? '⚪' : '🟢', 'Effort', await report($, options, LABEL_WIDTH + 1))
  const updates = await updateLine($, updateMode(options))
  const location = await workspace($)
  const handoff = await handoffInfo($)
  const session = await sessionInfo($)
  const progress = await progressFacts($)
  const relay = await loadRelay($)
  const elapsed = (at: number | undefined) => session.now !== undefined && at !== undefined ? age(Math.max(0, session.now - at)) : 'unavailable'
  return [
    `✈  Cruise ${VERSION}  ·  cruise control for Claude Code`,
    RULE,
    row('🟢', 'Workspace', location.cwd),
    row(' ', '', [location.branch, location.worktree].filter(Boolean).join(' · ')),
    row(' ', '', location.files ? `Git: ${location.files.length} changed` : 'Git changes unavailable'),
    ...(location.files ?? []).map(f => `    ${f.staged}${f.unstaged} ${f.path}`),
    row(' ', 'Handoff', handoff.status === 'found' ? `folder: ${handoff.path} · ${elapsed(handoff.at)} · ${handoff.goal ?? 'goal unavailable'}` : `folder: ${handoff.status}`),
    row(' ', '', `relay: ${relay.stage ?? 'not run'}`),
    row(' ', 'Work', progress.background ?? 'none'),
    ...(progress.details ?? ['agents unavailable']).map(d => `    ${d}`),
    row(' ', 'Model', session.model ?? 'unavailable'),
    row(' ', 'Time', `observed start: ${elapsed(session.started)} · last activity: ${elapsed(session.activity)}`),
    await contextRow($, options),
    effort,
    row(updates.includes('available') ? '🟡' : '🟢', 'Updates', updates),
    RULE,
    HELP,
  ].join('\n')
}
