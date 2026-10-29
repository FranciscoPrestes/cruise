// The band above the prompt: one row, and only when there is something to say. Below the first context warning it is the effort the
// judge picked; from the warning up it is the context, that pick and the handoff button (or the automatic notice). Never more than a row.
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { contextLimits } from './context'
import { cells, effortToken, fitRuns, ORANGE } from './dash'
import { effortParts, judgeMode } from './effort'
import { handoffInfo, pickupTarget } from './handoff-info'
import { autoThreshold, bandRow, contextAction, loadRelay, startPickup, startRelay } from './relay'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// The word under the pointer says what the button does: handoff, clear, then a fresh session picks up (go-around).
const PICKUP_WORD = 'Go-around'
const PICKUP_ICON = '↺'
const PICKUP_LABEL = 'Pickup'
// One button: a white airplane on a block of the status colour, with the word beside it on wide terminals.
const RELAY_LABEL = 'Handoff'
const RELAY_WORD = 'Handoff → Go-around'
// Narrow terminals: the airplane alone.
const NARROW_COLUMNS = 80
const RELAY_ICON = '✈'
export const relayWord = (columns: number) => (columns < NARROW_COLUMNS ? '' : RELAY_WORD)
const pillText = (icon: string, word: string) => (word ? ` ${icon} ${word} ` : ` ${icon} `)

// A band button: the icon and the word in one Button, so a click anywhere on it presses it, and the pointer inverts it
// whole (the host inverts the Button under the pointer; two Buttons would invert apart).
function pillButton(ui: Ui, o: { key: string; icon: string; label: string; word: string; color: string; onPress: () => void }) {
  const { Box, Text, Button } = ui
  // The block keeps its status colour (blue, orange or red) at rest and under the pointer; the airplane and the word are
  // drawn black at rest and white under the pointer. The host swaps text and background of a Button under the pointer
  // (seen in waveterm), so the hover colours are written swapped and the rest colours as drawn.
  const icon = { scope: o.key, color: o.color, backgroundColor: 'white' } as const
  return (
    <Box key={o.key} hover={{ scope: o.key }}>
      <Button key={`${o.key}-go`} plain label={o.label} onPress={o.onPress} hover={{ color: o.color, backgroundColor: 'white' }}>
        <Text color="black" backgroundColor={o.color} bold hover={icon}>{` ${o.icon}`}</Text>
        <Text color="black" backgroundColor={o.color} bold hover={icon}>{o.word ? ` ${o.word} ` : ' '}</Text>
      </Button>
    </Box>
  )
}

// In a fresh session the pickup takes the place of the handoff button: there is nothing to hand over yet.
const pickupRow = ($: EngineInterface, ui: Ui, path: string) => (
  <ui.Box flexDirection="row">{pillButton(ui, { key: 'pickup', icon: PICKUP_ICON, label: PICKUP_LABEL, word: PICKUP_WORD, color: ORANGE, onPress: () => startPickup($, path) })}</ui.Box>
)

// The pickup button shows only in a fresh session (no messages yet) when a handoff was saved for this folder.
async function pickupPath($: EngineInterface): Promise<string | null> {
  const messages = await $.session.messages().catch(() => undefined)
  if (messages === undefined) return null
  return pickupTarget(messages.length, await handoffInfo($))
}

async function band($: EngineInterface, ui: Ui, options: PluginOptions, columns: number, isWorking: boolean) {
  const { Box, Text } = ui
  const limits = contextLimits(options)
  const usage = options.context === false ? undefined : await $.session.usage().catch(() => undefined)
  const parts = judgeMode(options) === 'off' ? null : await effortParts($)
  const row = bandRow({
    percent: usage?.context.percent,
    window: usage?.context.window,
    action: options.context === false ? 'alert' : contextAction(options),
    limits,
    autoAt: autoThreshold(options, limits),
    running: (await loadRelay($)).running,
    effort: parts && 'pick' in parts ? effortToken(parts.pick, parts.app) : [],
  })
  const pickup = await pickupPath($)
  if (!row) return pickup ? pickupRow($, ui, pickup) : null
  const room = Math.max(0, columns - 2 - (row.button ? cells(pillText(RELAY_ICON, relayWord(columns))) : 0))
  const compact = row.severity === 'unknown' ? 'Context unavailable' : row.severity === 'critical' ? `${usage?.context.percent}% · critical` : row.severity === 'recommended' ? `${usage?.context.percent}% · recommended` : ''
  const detail = row.runs.reduce((n, run) => n + cells(run.text), 0) <= room ? row.runs : compact && cells(compact) <= room ? [{ text: compact }] : []
  const runs = row.button ? detail : fitRuns(row.runs, Math.max(0, columns - 2))
  const color = row.severity === 'critical' ? 'red' : row.severity === 'recommended' ? ORANGE : 'blue'
  const go = () => void startRelay($, 'button')
  return (
    <Box flexDirection="row">
      {row.button && isWorking ? <Text color={color}>Handoff after this turn</Text> : null}
      {row.button && !isWorking && pickup ? pickupRow($, ui, pickup) : null}
      {row.button && !isWorking && !pickup ? <Box flexDirection="row">{pillButton(ui, { key: 'relay', icon: RELAY_ICON, label: RELAY_LABEL, word: relayWord(columns), color, onPress: go })}</Box> : null}
      {runs.length ? <Text>{row.button ? '  ' : ''}{runs.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text> : null}
    </Box>
  )
}

export const registerBand: Register = (on, options) => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return (await band($, $.ui.resolve(e), options, e.props.bodyColumns ?? 80, e.props.isWorking)) ?? next(e)
  })
}
