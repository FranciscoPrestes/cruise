import type { Register } from 'claude-code'

import { checkContext, contextLimits } from './context'
import { registerProgress, trackShell } from './progress'

// Each feature can be switched off in the plugin's settings. The engine allows one unfiltered hook per event,
// so the events several features share are owned here, and each feature's function is called from them.
export const register: Register = (on, options) => {
  const wantContext = options.context !== false
  const wantProgress = options.progress !== false
  const limits = contextLimits(options)

  on('tool.call', async ($, e, next) => {
    const out = await next(e)
    if (wantProgress) await trackShell($, out)
    if (wantContext) await checkContext($, limits)
    return out
  })

  // Checked before every model request and again the moment its response is complete: context only grows between
  // requests, so a long run of steps is warned mid-turn, and a reply that jumps past a threshold is flagged
  // before any tool it asks for runs.
  on('turn.step', async function* ($, e, next) {
    if (wantContext) await checkContext($, limits)
    const result = yield* next(e)
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
