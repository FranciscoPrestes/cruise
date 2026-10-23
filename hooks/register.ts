import type { Register } from 'claude-code'

import { checkContext, contextLimits } from './context'
import { registerPurser } from './purser'
import { afterRequest, effortFor, judgeFrom, judgeMode, notePrompt } from './effort'
import { DEFAULT_MIN_ASK_CHARS } from './helpers'
import { registerDash } from './dash-view'
import { noteAsk, registerProgress, startProgress, trackShell } from './progress'
import { checkForUpdate, updateMode } from './updates'
import { welcome } from './welcome'

// Each feature can be switched off in the plugin's settings. The engine allows one unfiltered hook per event,
// so the events several features share are owned here, and each feature's function is called from them.
export const register: Register = (on, options) => {
  const wantContext = options.context !== false
  const wantProgress = options.progress === true
  const wantEffort = judgeMode(options) !== 'off'
  const limits = contextLimits(options)
  const judge = judgeFrom(options)
  const minAskChars = typeof options.minAskChars === 'number' ? options.minAskChars : DEFAULT_MIN_ASK_CHARS

  on('session.start', async ($, e, next) => {
    if (wantProgress) startProgress($)
    void welcome($, options)
    void checkForUpdate($, updateMode(options))
    await $.command.register({ name: 'cruise', description: 'The Cruise panel: what is on, what it is doing, and how to change it' })
    return next(e)
  })

  registerDash(on, options)
  registerPurser(on, options)

  on('prompt.submit', async ($, e, next) => {
    if (wantProgress) await noteAsk($, e, minAskChars)
    if (wantEffort) await notePrompt($, e)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const out = await next(e)
    if (wantProgress) await trackShell($, out)
    if (wantContext) await checkContext($, limits)
    return out
  })

  // Checked before every model request and again the moment its response is complete: context only grows between
  // requests, so a long run of steps is warned mid-turn, and a reply that jumps past a threshold is flagged
  // before any tool it asks for runs. The effort of a main-loop request is steered here too.
  on('turn.step', async function* ($, e, next) {
    if (wantContext && e.agentId === undefined) await checkContext($, limits, e.model)
    else if (wantContext) await checkContext($, limits)
    const steer = wantEffort && e.agentId === undefined ? await effortFor($, e, judge) : undefined
    const result = yield* next(steer ? { ...e, effort: steer } : e)
    if (wantEffort && e.agentId === undefined) await afterRequest($, e, steer, result.usage ?? undefined)
    if (wantContext) await checkContext($, limits)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (wantContext) await checkContext($, limits)
    return result
  })

  if (wantProgress) registerProgress(on, options)
}
