// The /cruise dashboard: a rounded card in a pane, one row per feature, drawn in the Claude orange.
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import { AskBlock } from './ask-block'
import { askView } from './ask'
import type { AskView } from './ask'
import { contextLimits } from './context'
import { fitRuns, meter, mix, ORANGE, tickRow, zone } from './dash'
import type { Run } from './dash'
import { effortFacts } from './effort'
import type { Thresholds } from './levels'
import { LEVEL_COLOR } from './levels'
import { panel } from './panel'
import { progressFacts, toggleAsk } from './progress'
import type { ProgressFacts } from './progress'
import { updateLine, updateMode } from './updates'
import { VERSION } from './version'
import { age } from './helpers'

export const PANE = 'cruise'
const REFRESH_MS = 5000
const LABEL = 11
const METER_MAX = 36

export type Snapshot = {
  limits: Thresholds
  context: { on: boolean; percent?: number }
  progress: { on: boolean; facts: ProgressFacts | null }
  effort: Awaited<ReturnType<typeof effortFacts>>
  update: { line: string; available: boolean }
}

export async function snapshot($: EngineInterface, options: PluginOptions): Promise<Snapshot> {
  const limits = contextLimits(options)
  const percent = options.context === false ? undefined : await $.session.usage().then(u => u.context.percent, () => undefined)
  const update = await updateLine($, updateMode(options))
  return {
    limits,
    context: { on: options.context !== false, percent },
    progress: { on: options.progress === true, facts: options.progress === true ? await progressFacts($) : null },
    effort: await effortFacts($, options),
    update: { line: update, available: update.includes('available') },
  }
}

// A line of the card is a list of runs; the dot and label sit in a column of their own to its left.
// `ask` is the request, drawn first (with its control) when there is one.
export type Row = { dot: string; color?: string; label: string; lines: Run[][]; ask?: AskView }

const dim = (text: string): Run[] => [{ text, dim: true }]
const OFF = dim('off · turn on with /cruise:configure')

// Every line is cut to `body` cells (what is left of the card after its border, padding and label column).
export function rows(s: Snapshot, body: number, framed: boolean): Row[] {
  const fit = (lines: Run[][]) => lines.map(l => fitRuns(l, body))
  const barWidth = Math.max(4, Math.min(METER_MAX, body - 6))
  const percent = s.context.percent
  const warns = `warns at ${s.limits.warnAt}% and ${s.limits.urgentAt}%`

  const context: Run[][] = !s.context.on
    ? [OFF]
    : percent === undefined
      ? [dim(warns)]
      : [
          [...meter(percent, barWidth, s.limits), { text: `  ${percent}%`, bold: true, color: zone(percent, s.limits) }],
          ...(framed ? [dim(tickRow(barWidth, s.limits))] : []),
          dim(`${warns}, then type /handoff`),
        ]

  const e = s.effort
  // » marks the pick: a glyph every terminal draws one cell wide (⚡ is two in some and one in others, which broke the card's edge).
  const now: Run[] = e.paused
    ? [{ text: `⏸ paused: ${e.paused}`, color: 'yellow' }]
    : e.pick
      ? [{ text: `» ${e.pick}`, color: LEVEL_COLOR[e.pick] ?? 'white', bold: true }, ...(e.app ? dim(` (app ${e.app})`) : []), ...(e.why ? dim(` · ${e.why}`) : [])]
      : dim('waiting for your first prompt')
  const legend: Run[] = Object.entries(e.picks).flatMap(([k, n], i): Run[] => [{ text: `${i ? '   ' : ''}● `, color: LEVEL_COLOR[k] }, { text: `${k} ${n}`, dim: true }])
  const hasPicks = Object.keys(e.picks).length > 0
  const effort: Run[][] = !e.on
    ? [OFF]
    : [
        now,
        ...(!hasPicks ? [] : framed ? [mix(e.picks, Math.min(METER_MAX, body)), legend] : [[...mix(e.picks, 12), { text: '  ' }, ...legend]]),
        ...(framed ? [dim(`${e.mode} judge · ${e.way}`), dim(e.counts)] : [dim(`${e.mode} judge · ${e.counts}`)]),
      ]

  const facts = s.progress.facts
  const step = facts?.step ?? null
  const stepLine: Run[] = step
    ? [{ text: '◆ ', color: 'magenta', bold: true }, { text: `${step.n}/${step.total} `, bold: true }, { text: '▰'.repeat(step.done) + '▱'.repeat(step.total - step.done), color: 'green' }, { text: ` ${step.complete ? 'complete' : step.title}` }]
    : dim('no plan yet · steps appear when Claude keeps a task list')
  const tail: Run[] = [...(facts?.ask ? [{ text: age(facts.now - facts.ask.at), dim: true }] : []), ...(facts?.background ? [{ text: `⚙ ${facts.background}`, color: 'blue' }] : [])]
    .flatMap((r, i): Run[] => (i ? [{ text: ' · ', dim: true }, r] : [r]))
  const askShown = s.progress.on && facts?.ask ? askView(facts.ask.text, body - 2, facts.expanded) : undefined
  const progress: Run[][] = !s.progress.on
    ? [OFF]
    : [
        ...(facts?.ask ? [] : [dim('no request yet')]),
        // Above the prompt the row count is tight, so the age and background work share the step's line there.
        ...(framed || tail.length === 0 ? [stepLine, ...(tail.length > 0 ? [tail] : [])] : [[...stepLine, { text: '  │  ', dim: true }, ...tail]]),
      ]

  const ctxDot = percent === undefined ? undefined : zone(percent, s.limits)
  const on = (yes: boolean) => (yes ? 'green' : undefined)
  return [
    { dot: yes(s.context.on), color: ctxDot ?? on(s.context.on), label: 'Context', lines: fit(context) },
    { dot: yes(e.on), color: e.paused ? 'yellow' : on(e.on), label: 'Effort', lines: fit(effort) },
    { dot: yes(s.progress.on), color: on(s.progress.on), label: 'Progress', lines: fit(progress), ask: askShown },
    { dot: '●', color: s.update.available ? 'yellow' : 'green', label: 'Updates', lines: fit([dim(s.update.available ? s.update.line : 'up to date · checks daily')]) },
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
export function Dashboard(ui: Ui, s: Snapshot, columns: number, framed = true, onToggle: () => void = () => {}) {
  const { Box, Text } = ui
  const inner = Math.max(20, columns - (framed ? 4 : 2))
  const body = Math.max(8, inner - LABEL)
  const text = (runs: readonly Run[]) => <Text>{runs.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text>
  const top = chrome(inner)
  return (
    <Box flexDirection="column" borderStyle={framed ? 'round' : undefined} borderColor={ORANGE} paddingX={1} width={columns}>
      {text(top.title)}
      <Text color={ORANGE}>{top.rule}</Text>
      {rows(s, body, framed).map(r => (
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const columns = Math.min(e.props.bodyColumns ?? 80, 84)
    return Dashboard($.ui.resolve(e), await snapshot($, options), columns, e.props.placement !== 'inline', () => void toggleAsk($))
  })

  // Where no pane can be drawn (a narrow terminal, a headless run) the same facts print as plain text.
  on('command.run', { command: 'cruise' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Cruise', focus: true, closeOnEscape: true, rows: 15 })
    if (!opened.isPlaced) return { text: await panel($, options) }
    refresh ??= $.clock.every(REFRESH_MS, () => $.ui.invalidate('ui.render'))
    return {}
  })
}
