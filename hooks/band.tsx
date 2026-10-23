// The band above the prompt. The engine allows one hook per site, so this one draws everything the band holds: the progress
// rows (when `progress` is on) and, from the first context warning, one extra row with the handoff button (or its automatic notice).
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { contextLimits } from './context'
import { fitRuns } from './dash'
import { judgeMode } from './effort'
import { progressBand } from './progress'
import { autoThreshold, contextAction, contextRow, loadRelay, startRelay } from './relay'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

export const RELAY_HOTKEY = 'h'
export const RELAY_LABEL = 'Handoff and continue'
// "h: Handoff and continue" and two cells of air: what the button takes from the row.
const BUTTON_COLS = 26

async function relayBand($: EngineInterface, { Box, Text, Button }: Ui, options: PluginOptions, columns: number, isWorking: boolean) {
  const limits = contextLimits(options)
  const usage = await $.session.usage().catch(() => undefined)
  const row = contextRow({
    percent: usage?.context.percent,
    window: usage?.context.window,
    action: contextAction(options),
    limits,
    autoAt: autoThreshold(options, limits),
    running: (await loadRelay($)).running,
  })
  if (!row) return null
  const runs = fitRuns(row.runs, Math.max(12, columns - 2 - (row.button ? BUTTON_COLS : 0)))
  return (
    <Box flexDirection="row">
      <Text>{runs.map(r => <Text color={r.color} dimColor={r.dim} bold={r.bold}>{r.text}</Text>)}</Text>
      {row.button && !isWorking ? <Button key="relay-go" label={RELAY_LABEL} hotkey={RELAY_HOTKEY} plain onPress={() => void startRelay($, 'button')} /> : null}
    </Box>
  )
}

export const registerBand: Register = (on, options) => {
  const wantProgress = options.progress === true
  const showEffort = judgeMode(options) !== 'off'

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const columns = e.props.bodyColumns ?? 80
    const progress = wantProgress ? await progressBand($, ui, columns, showEffort) : null
    const relay = options.context === false ? null : await relayBand($, ui, options, columns, e.props.isWorking)
    if (!progress && !relay) return next(e)
    const { Box } = ui
    return <Box flexDirection="column">{progress}{relay}</Box>
  })
}
