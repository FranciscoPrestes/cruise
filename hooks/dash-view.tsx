// The /cruise dashboard: a rounded card in a pane, one row per feature, drawn in the Claude orange.
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import { AskBlock } from './ask-block'
import { askView, wrapText } from './ask'
import type { AskView } from './ask'
import { contextLimits } from './context'
import { cells, fitRuns, meter, mix, ORANGE, tickRow, zone } from './dash'
import type { Run } from './dash'
import { effortFacts } from './effort'
import type { Thresholds } from './levels'
import { LEVEL_COLOR } from './levels'
import { panel } from './panel'
import { autoThreshold, contextAction, loadRelay } from './relay'
import type { ContextAction, RelayRecord } from './relay'
import { progressFacts, toggleAsk } from './progress'
import type { ProgressFacts } from './progress'
import { updateLine, updateMode } from './updates'
import { VERSION } from './version'
import { age } from './helpers'
import { workspace } from './workspace'
import { handoffInfo } from './handoff-info'
import { sessionInfo } from './session-info'

const PANE = 'cruise'
const REFRESH_MS = 5000
const LABEL = 11
const METER_MAX = 36

export type Snapshot = {
  handoff?: Awaited<ReturnType<typeof handoffInfo>>
  session?: Awaited<ReturnType<typeof sessionInfo>>
  workspace: Awaited<ReturnType<typeof workspace>>
  limits: Thresholds
  context: { on: boolean; percent?: number }
  progress: { facts: ProgressFacts }
  effort: Awaited<ReturnType<typeof effortFacts>>
  update: { line: string; available: boolean }
  // The handoff relay: what the context warning offers, what it is doing now and how the last run ended.
  relay: { action: ContextAction; autoAt: number; running: boolean; now: number; last: RelayRecord | null; stage?: string }
}

export async function snapshot($: EngineInterface, options: PluginOptions): Promise<Snapshot> {
  const limits = contextLimits(options)
  const percent = options.context === false ? undefined : await $.session.usage().then(u => u.context.percent, () => undefined)
  const update = await updateLine($, updateMode(options))
  const relay = await loadRelay($)
  return {
    handoff: await handoffInfo($),
    session: await sessionInfo($),
    workspace: await workspace($),
    limits,
    context: { on: options.context !== false, percent },
    progress: { facts: await progressFacts($) },
    effort: await effortFacts($, options),
    update: { line: update, available: update.includes('available') },
    relay: { action: contextAction(options), autoAt: autoThreshold(options, limits), running: relay.running, now: await $.clock.now().catch(() => 0), last: relay.last, stage: relay.stage },
  }
}

// A line of the card is a list of runs; the dot and label sit in a column of their own to its left.
// `ask` is the request, drawn first (with its control) when there is one.
export type Row = { dot: string; color?: string; label: string; lines: Run[][]; ask?: AskView }

const dim = (text: string): Run[] => [{ text, dim: true }]
const OFF = dim('off · turn on with /cruise:configure')

export function detailPages(s: Snapshot, width: number): string[][] {
  const files = s.workspace.files
  const handoff = s.handoff
  const lines = [
    'Workspace:', s.workspace.cwd, `${s.workspace.branch} · ${s.workspace.worktree}`, 'Git files:', ...(files ? files.map(f => `staged=${f.staged === ' ' ? '-' : f.staged} unstaged=${f.unstaged === ' ' ? '-' : f.unstaged} ${f.path}`) : ['unavailable']),
    'Latest handoff in folder:', ...(handoff?.status === 'found' ? [handoff.path, handoff.goal ?? 'goal unavailable'] : [handoff?.status ?? 'unavailable']),
    'Active work:', ...(s.progress.facts.details ?? ['agents unavailable']),
    'Model:', s.session?.model ?? 'unavailable', 'Task summary:', s.effort.summary ?? 'unavailable', 'Request:', s.progress.facts.ask?.text ?? 'unavailable',
  ].flatMap(line => pathLines(line, width).map(run => run.map(part => part.text).join('')))
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += 8) pages.push(lines.slice(i, i + 8))
  return pages.length ? pages : [[]]
}

function pathLines(path: string, width: number): Run[][] {
  const lines = ['']
  for (const ch of path) {
    if (cells(lines[lines.length - 1]! + ch) > width) lines.push('')
    lines[lines.length - 1] += ch
  }
  return lines.map(dim)
}

// Every line is cut to `body` cells (what is left of the card after its border, padding and label column).
export function rows(s: Snapshot, body: number, framed: boolean): Row[] {
  const fit = (lines: Run[][]) => lines.map(l => fitRuns(l, body))
  const barWidth = Math.max(4, Math.min(METER_MAX, body - 6))
  const percent = s.context.percent
  const warns = `warns at ${s.limits.warnAt}% and ${s.limits.urgentAt}%`
  const auto = s.relay.action === 'auto'

  const context: Run[][] = !s.context.on
    ? [OFF]
    : percent === undefined
      ? [dim(warns)]
      : [
          [...meter(percent, barWidth, s.limits), { text: `  ${percent}%`, bold: true, color: zone(percent, s.limits) }],
          ...(framed ? [dim(tickRow(barWidth, s.limits))] : []),
          dim(auto ? `${warns} · auto at ${s.relay.autoAt}%` : `${warns}, then type /handoff`),
        ]

  const e = s.effort
  // » marks the pick: a glyph every terminal draws one cell wide (⚡ is two in some and one in others, which broke the card's edge).
  // A model that is left alone is named: the effort rows above it are from before it.
  const now: Run[] = e.paused
    ? [{ text: `|| paused: ${e.paused}`, color: 'yellow' }]
    : e.idle
      ? [{ text: `resting · ${e.idle} is left alone`, color: 'yellow' }]
    : e.pick
      ? [{ text: `» ${e.pick}`, color: LEVEL_COLOR[e.pick] ?? 'white', bold: true }, ...(e.app ? dim(` (app ${e.app})`) : []), ...(e.why ? dim(` · ${e.why}`) : [])]
      : dim('no eligible prompt judged yet')
  const legend: Run[] = Object.entries(e.picks).flatMap(([k, n], i): Run[] => [{ text: `${i ? '   ' : ''}● `, color: LEVEL_COLOR[k] }, { text: `${k} ${n}`, dim: true }])
  const hasPicks = Object.keys(e.picks).length > 0
  const effort: Run[][] = !e.on
    ? [OFF]
    : [
        now,
        ...(e.idle && e.idleWhy ? [dim(e.idleWhy)] : []),
        ...(!hasPicks ? [] : framed ? [mix(e.picks, Math.min(METER_MAX, body)), legend] : [[...mix(e.picks, 12), { text: '  ' }, ...legend]]),
        ...(framed ? [dim(`${e.mode} judge · ${e.way}`), dim(`steers ${e.families}`), dim(e.counts)] : [dim(`${e.mode} judge · ${e.counts}`)]),
      ]

  const r = s.relay
  const how: Run[] =
    r.action === 'alert' ? dim('alert only · warnings, no button')
    : r.action === 'auto' ? [{ text: `auto at ${r.autoAt}% · clears your conversation`, color: 'yellow' }]
    : dim(`button · offered from ${s.limits.warnAt}%, above the prompt`)
  const last: Run[] = r.running
    ? [{ text: 'running: handoff, clear, pickup…', color: 'yellow' }]
    : r.last
      ? [{ text: `${age(r.now - r.last.at)} · `, dim: true }, { text: r.last.ok ? 'ok' : 'aborted', color: r.last.ok ? 'green' : 'yellow', bold: true }, { text: ` · ${r.last.why}`, dim: true }]
      : dim('not run yet')

  const facts = s.progress.facts
  const step = facts.step
  const stepLine: Run[] = step
    ? [{ text: '◆ ', color: 'magenta', bold: true }, { text: `${step.n}/${step.total} `, bold: true }, { text: '▰'.repeat(step.done) + '▱'.repeat(step.total - step.done), color: 'green' }, { text: ` ${step.complete ? 'complete' : step.title}` }]
    : dim('no plan yet · steps appear when Claude keeps a task list')
  const tail: Run[] = [...(facts.ask ? [{ text: age(facts.now - facts.ask.at), dim: true }] : []), ...(facts.background ? [{ text: `◆ ${facts.background}`, color: 'blue' }] : [])]
    .flatMap((r, i): Run[] => (i ? [{ text: ' · ', dim: true }, r] : [r]))
  const askShown = facts.ask ? askView(facts.ask.text, body - 2, facts.expanded) : undefined
  const progress: Run[][] = [
    ...(e.summary ? wrapText(`Task summary: ${e.summary}`, body).map(dim) : []),
    ...(facts.ask ? [] : [dim('waiting for an observed request')]),
    // Above the prompt the row count is tight, so the age and background work share the step's line there.
    ...(framed || tail.length === 0 ? [stepLine, ...(tail.length > 0 ? [tail] : [])] : [[...stepLine, { text: '  │  ', dim: true }, ...tail]]),
  ]

  const ctxDot = percent === undefined ? undefined : zone(percent, s.limits)
  const files = s.workspace.files
  const git = files ? `${files.filter(f => f.unstaged !== ' ' && f.unstaged !== '?').length} modified · ${files.filter(f => f.staged === '?').length} new · ${files.filter(f => f.staged !== ' ' && f.staged !== '?').length} staged` : 'Git changes unavailable'
  const latest = s.handoff?.status === 'found' ? `Last in folder: ${age(Math.max(0, r.now - s.handoff.at))}` : `Last in folder: ${s.handoff?.status ?? 'unavailable'}`
  const session = s.session
  const elapsed = session?.now !== undefined && session.started !== undefined ? age(Math.max(0, session.now - session.started)) : 'start not observed'
  const activity = session?.now !== undefined && session.activity !== undefined ? `${session.action ?? 'observed'} · ${age(Math.max(0, session.now - session.activity))}` : 'waiting for observed activity'
  const on = (yes: boolean) => (yes ? 'green' : undefined)
  return [
    { dot: '◇', color: 'green', label: 'Workspace', lines: fit([...pathLines(s.workspace.cwd, body), ...wrapText([s.workspace.branch, s.workspace.worktree].filter(Boolean).join(' · '), body).map(dim), ...wrapText(git, body).map(dim)]) },
    { dot: yes(s.context.on), color: ctxDot ?? on(s.context.on), label: 'Context', lines: fit(context) },
    { dot: '↗', color: r.action === 'alert' ? undefined : r.last && !r.last.ok ? 'yellow' : 'green', label: 'Handoff', lines: fit([how, [{ text: 'Relay: ', dim: true }, ...last], dim(latest), ...(r.stage ? [dim(r.stage)] : [])]) },
    { dot: yes(e.on), color: e.paused ? 'yellow' : on(e.on), label: 'Effort', lines: fit([dim(`model: ${session?.model ?? 'unavailable'}`), ...effort]) },
    { dot: '●', color: 'green', label: 'Progress', lines: fit(progress), ask: askShown },
    { dot: '◷', color: 'green', label: 'Time', lines: fit([dim(`observed start: ${elapsed}`), ...wrapText(`last activity: ${activity}`, body).map(dim)]) },
    { dot: '◇', color: s.update.available ? 'yellow' : 'green', label: 'Updates', lines: fit(wrapText(s.update.line, body).map(dim)) },
  ]
}

const yes = (on: boolean) => (on ? '●' : '○')

// The title, the rules and the footer, each cut to the card's inner width.
export function chrome(inner: number) {
  return {
    title: fitRuns([{ text: '◐ Cruise ', color: ORANGE, bold: true }, { text: VERSION, bold: true }, { text: '  ·  cruise control for Claude Code', dim: true }], inner),
    rule: '─'.repeat(inner),
    footer: fitRuns(dim('/cruise:configure · /handoff · /pickup'), inner),
  }
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// `framed`: draw the rounded card. Above the prompt the engine already boxes the pane, so the card drops its own border there.
function Dashboard(ui: Ui, s: Snapshot, columns: number, framed = true, onToggle: () => void = () => {}, page = -1, onPage: (page: number) => void = () => {}, onScroll: (to: 'start' | 'end') => void = () => {}) {
  const { Box, Text, Button } = ui
  const inner = Math.max(20, columns - (framed ? 4 : 2))
  const body = Math.max(8, inner - LABEL)
  const text = (runs: readonly Run[]) => <Text>{runs.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text>
  const top = chrome(inner)
  const pages = detailPages(s, inner)
  const currentPage = Math.min(page, pages.length - 1)
  if (page >= 0) return <Box flexDirection="column" width={columns}><Text bold>{`Details ${currentPage + 1}/${pages.length}`}</Text>{pages[currentPage]!.map(line => <Text>{line}</Text>)}<Button key="details-previous" label="Previous page" hotkey="p" onPress={() => onPage((currentPage + pages.length - 1) % pages.length)} /><Button key="details-next" label="Next page" hotkey="n" onPress={() => onPage((currentPage + 1) % pages.length)} /><Button key="details-close" label="Back to overview" hotkey="d" onPress={() => onPage(-1)} /></Box>
  const overview = rows(s, body, framed)
  return (
    <Box flexDirection="column" borderStyle={framed ? 'round' : undefined} borderColor={ORANGE} paddingX={1} width={columns}>
      {text(top.title)}
      <Text color={ORANGE}>{top.rule}</Text>
      <Box flexDirection="row"><Button key="details-open" label="View details" hotkey="d" onPress={() => onPage(0)} /><Button key="overview-end" label="Scroll down" hotkey="b" onPress={() => onScroll('end')} /><Button key="overview-start" label="Scroll up" hotkey="t" onPress={() => onScroll('start')} /></Box>
      {overview.map(r => (
        <Box flexDirection="row">
          <Box width={LABEL}>
            <Text color={r.color}>{r.dot}</Text>
            <Text bold>{` ${r.label}`}</Text>
          </Box>
          <Box flexDirection="column">
            {r.ask ? AskBlock(ui, r.ask, onToggle, 'ask-more-pane') : null}
            {r.lines.map(text)}
          </Box>
        </Box>
      ))}
      {framed && <Text color={ORANGE} dimColor>{top.rule}</Text>}
      {text(top.footer)}
    </Box>
  )
}

// One shared tick keeps the context percent fresh while the pane is open: nothing else redraws it between prompts.
export const registerDash: Register = (on, options) => {
  let refresh: Timer | undefined
  let page = -1

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const columns = Math.min(e.props.bodyColumns ?? 80, 84)
    return Dashboard($.ui.resolve(e), await snapshot($, options), columns, e.props.placement !== 'inline', () => void toggleAsk($), page, value => { page = value; $.ui.invalidate('ui.render') }, to => { void $.ui.scroll({ in: PANE, to }) })
  })

  // Where no pane can be drawn (a narrow terminal, a headless run) the same facts print as plain text.
  on('command.run', { command: 'cruise' }, async $ => {
    page = -1
    const opened = await $.ui.open({ id: PANE, title: 'Cruise', focus: true, closeOnEscape: true, rows: 15 })
    if (!opened.isPlaced) return { text: await panel($, options) }
    refresh ??= $.clock.every(REFRESH_MS, () => $.ui.invalidate('ui.render'))
    return {}
  })
}
