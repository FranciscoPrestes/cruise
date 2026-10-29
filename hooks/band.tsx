// The band above the prompt: one row, and only when there is something to say. Below the first context warning it is the effort the
// judge picked; from the warning up it is the context, that pick and the handoff button (or the automatic notice). Never more than a row.
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { contextLimits } from './context'
import { cells, effortToken, fitRuns, ORANGE } from './dash'
import { effortParts, judgeMode } from './effort'
import { autoThreshold, bandRow, contextAction, loadRelay, startRelay } from './relay'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const RELAY_HOTKEY = 'h'
// One button: a white airplane on a block of the status colour. Under the pointer the word " Handoff " is revealed in the
// same hover group, right after the block, so the block reads as growing (the row moves aside until the pointer leaves).
const RELAY_LABEL = 'Handoff'
const RELAY_SCOPE = 'relay'
const RELAY_ICON = '✈'
// Reserve space for the button at rest ( ✈ ).
const BUTTON_COLS = 3

async function band($: EngineInterface, { Box, Text, Button }: Ui, options: PluginOptions, columns: number, isWorking: boolean) {
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
  if (!row) return null
  const room = Math.max(0, columns - 2 - (row.button ? BUTTON_COLS : 0))
  const compact = row.severity === 'unknown' ? 'Context unavailable' : row.severity === 'critical' ? `${usage?.context.percent}% · critical` : row.severity === 'recommended' ? `${usage?.context.percent}% · recommended` : ''
  const detail = row.runs.reduce((n, run) => n + cells(run.text), 0) <= room ? row.runs : compact && cells(compact) <= room ? [{ text: compact }] : []
  const runs = row.button ? detail : fitRuns(row.runs, Math.max(0, columns - 2))
  const color = row.severity === 'critical' ? 'red' : row.severity === 'recommended' ? ORANGE : 'blue'
  const go = () => void startRelay($, 'button')
  // Under the pointer the block turns white and its text takes the status colour; the airplane and the word flip together.
  const flip = { scope: RELAY_SCOPE, color, backgroundColor: 'white' as const }
  return (
    <Box flexDirection="row">
      {row.button && isWorking ? <Text color={color}>Handoff after this turn</Text> : null}
      {row.button && !isWorking ? (
        <Box key="relay" flexDirection="row" hover={{ scope: RELAY_SCOPE }}>
          <Button key="relay-go" plain label={RELAY_LABEL} hotkey={RELAY_HOTKEY} hover={{ backgroundColor: 'white', color }} onPress={go}><Text color="white" backgroundColor={color} bold>{` ${RELAY_ICON} `}</Text></Button>
          <Box display="none" hover={{ scope: RELAY_SCOPE, display: 'flex' }}><Text color="white" backgroundColor={color} bold hover={flip}>{`${RELAY_LABEL} `}</Text></Box>
        </Box>
      ) : null}
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
