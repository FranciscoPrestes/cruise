// The band above the prompt: one row, and only when there is something to say. Below the first context warning it is the effort the
// judge picked; from the warning up it is the context, that pick and the handoff button (or the automatic notice). Never more than a row.
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { contextLimits } from './context'
import { effortToken, fitRuns, ORANGE } from './dash'
import { effortParts, judgeMode } from './effort'
import { autoThreshold, bandRow, contextAction, loadRelay, startRelay } from './relay'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const RELAY_HOTKEY = 'h'
const RELAY_LABEL = '↗ Handoff'
// Reserve space for the button and its terminal chrome.
const BUTTON_COLS = 16

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
  const runs = fitRuns(row.runs, Math.max(12, columns - 2 - (row.button ? BUTTON_COLS : 0)))
  const color = row.severity === 'critical' ? 'red' : row.severity === 'recommended' ? ORANGE : 'blue'
  return (
    <Box flexDirection="row">
      <Text>{runs.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text>
      {row.button && isWorking ? <Text color={color}>Handoff after this turn</Text> : null}
      {row.button && !isWorking ? <Button key="relay-go" hotkey={RELAY_HOTKEY} variant="primary" onPress={() => void startRelay($, 'button')}><Text color={color}>{RELAY_LABEL}</Text></Button> : null}
    </Box>
  )
}

export const registerBand: Register = (on, options) => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return (await band($, $.ui.resolve(e), options, e.props.bodyColumns ?? 80, e.props.isWorking)) ?? next(e)
  })
}
