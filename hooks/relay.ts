// The relay: handoff, clear, pickup. A button offers it from the first context warning; in automatic mode it runs by itself.
// The pure decisions are at the top; the part that talks to the engine is at the bottom.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { zone } from './dash'
import type { Run } from './dash'
import type { Thresholds } from './levels'

export type ContextAction = 'button' | 'alert' | 'auto'
export type RelayRecord = { at: number; ok: boolean; mode: 'button' | 'auto'; why: string }
export type RelayState = { running: boolean; pickupPending: boolean; autoDone: boolean; mode: 'button' | 'auto' | null; last: RelayRecord | null }
export type Entry = { name: string; kind: string; mtimeMs: number }

export const contextAction = (options: PluginOptions): ContextAction => (options.contextAction === 'alert' || options.contextAction === 'auto' ? options.contextAction : 'button')

// The highest point automatic mode may start at: above it the handoff itself (a turn that writes the file) might not fit.
export const AUTO_MAX = 95

// Where automatic mode starts: `autoAt`, or the urgent warning when it is 0 or unset; never before the first warning, never above 95.
export function autoThreshold(options: PluginOptions, limits: Thresholds): number {
  const at = typeof options.autoAt === 'number' && options.autoAt > 0 ? options.autoAt : limits.urgentAt
  return Math.max(Math.min(at, AUTO_MAX), limits.warnAt)
}

// The handoff skill saves under ~/.local/state/handoffs/<working directory with / turned into ->/.
export const handoffDir = (home: string, cwd: string): string => `${home}/.local/state/handoffs/${cwd.replace(/\//g, '-')}`

// The handoff this run wrote: a markdown file at least as new as the run's start. Anything older is a previous session's.
export function freshHandoff(entries: readonly Entry[], startedAt: number): string | undefined {
  return entries
    .filter(e => e.kind === 'file' && e.name.endsWith('.md') && e.mtimeMs >= startedAt)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.name
}

export function windowLabel(tokens: number | undefined): string | undefined {
  if (!tokens) return undefined
  return tokens >= 1_000_000 ? `${Number((tokens / 1_000_000).toFixed(1))}M` : `${Math.round(tokens / 1000)}K`
}

export type RowInput = { percent: number | undefined; window: number | undefined; action: ContextAction; limits: Thresholds; autoAt: number; running: boolean }

// The extra row of the band: absent below the first warning and in alert mode; with the button in button mode; without it in auto mode and while running.
export function contextRow(i: RowInput): { runs: Run[]; button: boolean } | null {
  if (i.action === 'alert' || i.percent === undefined || i.percent < i.limits.warnAt) return null
  const size = windowLabel(i.window)
  const head: Run = { text: `Context ${i.percent}%${size ? ` of ${size}` : ''}`, color: zone(i.percent, i.limits), bold: true }
  if (i.running) return { runs: [head, { text: ' · handing off, clearing and picking up…', color: 'yellow' }], button: false }
  if (i.action === 'auto') return { runs: [head, { text: ` · automatic at ${i.autoAt}%`, dim: true }], button: false }
  return { runs: [head, { text: ' · ', dim: true }], button: true }
}

// Auto runs once per context band, never during a run or while a pickup waits; the band is over when the context falls below `resetBelow`.
export function decideAuto(i: { percent: number; action: ContextAction; at: number; limits: Thresholds; state: RelayState }): { run: boolean; reset: boolean } {
  if (i.percent < i.limits.resetBelow) return { run: false, reset: i.state.autoDone }
  const run = i.action === 'auto' && i.percent >= i.at && !i.state.running && !i.state.pickupPending && !i.state.autoDone
  return { run, reset: false }
}

export type RelayDeps = {
  now: () => Promise<number>
  toast: (text: string) => void
  // Runs the handoff as a turn and says whether that turn finished.
  runHandoff: () => Promise<boolean>
  listHandoffs: () => Promise<Entry[]>
  clear: () => Promise<void>
  save: (patch: Partial<RelayState>) => Promise<void>
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Handoff, then proof that the file exists, then clear. Any step that fails stops here, before the clear: the person is never left
// with an empty conversation and no handoff. The pickup is run by the session that starts after the clear (see registerRelay).
export async function runRelay(d: RelayDeps, mode: 'button' | 'auto'): Promise<{ ok: boolean; why: string }> {
  const started = await d.now()
  await d.save({ running: true, mode })
  const stop = async (why: string) => {
    await d.save({ running: false, last: { at: await d.now(), ok: false, mode, why } })
    d.toast(`Cruise: ${why}.`)
    return { ok: false, why }
  }
  d.toast(mode === 'auto' ? 'Cruise: the context is full, so it is doing the handoff, clearing and picking up by itself. Do not type until it ends.' : 'Cruise: handoff, then clear, then pickup. Do not type until it ends.')

  try {
    if (!(await d.runHandoff())) return stop('the handoff did not finish in time, so nothing was cleared')
  } catch (err) {
    return stop(`the handoff could not run: ${reason(err)}`)
  }
  const fresh = freshHandoff(await d.listHandoffs().catch(() => []), started)
  if (!fresh) return stop('no handoff file was written, so nothing was cleared')

  await d.save({ pickupPending: true })
  try {
    await d.clear()
  } catch (err) {
    await d.save({ pickupPending: false })
    return stop(`the clear failed (the handoff is saved): ${reason(err)}`)
  }
  return { ok: true, why: 'handoff saved, context cleared' }
}

// ---- the part that talks to the engine ----

const KEY = 'cruise.relay'
const HANDOFF = 'cruise:handoff'
const PICKUP = 'cruise:pickup'
const HANDOFF_TIMEOUT_MS = 180_000
const EMPTY: RelayState = { running: false, pickupPending: false, autoDone: false, mode: null, last: null }

// The relay's own record lives in $.store, which outlives the clear (verified: the store and the module's variables both survive it).
export async function loadRelay($: EngineInterface): Promise<RelayState> {
  const saved = await $.store.get(KEY).catch(() => undefined)
  return { ...EMPTY, ...((saved ?? {}) as Partial<RelayState>) }
}

async function saveRelay($: EngineInterface, patch: Partial<RelayState>): Promise<void> {
  await $.store.set(KEY, { ...(await loadRelay($)), ...patch })
  $.ui.invalidate('ui.render') // the band reads this record
}

// A new process never has a run in flight: whatever a crashed one left behind is cleared.
export async function resetRelay($: EngineInterface): Promise<void> {
  await saveRelay($, { running: false, pickupPending: false })
}

// The handoff is a turn of its own. It counts as finished at the first turn that completes after one of its steps began,
// so the turn that was already running when the relay was queued cannot be mistaken for it.
let waiting: { resolve: () => void; sawStep: boolean } | undefined

export function relayStep(): void {
  if (waiting) waiting.sawStep = true
}

export function relayTurnDone(e: { agentId?: string }): void {
  if (waiting?.sawStep && e.agentId === undefined) {
    waiting.resolve()
    waiting = undefined
  }
}

function realDeps($: EngineInterface): RelayDeps {
  return {
    now: () => $.clock.now(),
    toast: text => $.ui.toast(text),
    runHandoff: async () => {
      const finished = new Promise<boolean>(resolve => {
        waiting = { sawStep: false, resolve: () => resolve(true) }
      })
      try {
        await $.command.run({ command: HANDOFF })
      } catch (err) {
        waiting = undefined
        throw err
      }
      const ok = await Promise.race([finished, $.clock.sleep(HANDOFF_TIMEOUT_MS).then(() => false)])
      waiting = undefined
      return ok
    },
    listHandoffs: async () => {
      const home = await $.env.get('HOME')
      if (!home) return []
      const entries = await $.fs.list(handoffDir(home, await $.session.cwd()))
      return entries.map(e => ({ name: e.name, kind: e.kind, mtimeMs: e.mtimeMs }))
    },
    clear: async () => {
      await $.command.run({ command: 'clear' })
    },
    save: patch => saveRelay($, patch),
  }
}

// Starts the relay from a button or from automatic mode. `$.command.run` refuses to run inside a hook the turn waits on, so the
// work is handed to a timer that fires after the hook has answered; the engine then queues each command until the session is idle.
export async function startRelay($: EngineInterface, mode: 'button' | 'auto'): Promise<void> {
  if ((await loadRelay($)).running) return
  await saveRelay($, { running: true, mode })
  $.clock.after(300, () => {
    void runRelay(realDeps($), mode).catch(async err => {
      await saveRelay($, { running: false, last: { at: await $.clock.now(), ok: false, mode, why: reason(err) } }).catch(() => undefined)
      $.ui.toast(`Cruise: the relay stopped: ${reason(err)}.`)
    })
  })
}

// Called after each turn: automatic mode starts the relay once the context reaches its point, and the band is re-armed once it falls.
export async function maybeAuto($: EngineInterface, options: PluginOptions, limits: Thresholds): Promise<void> {
  const action = contextAction(options)
  if (action !== 'auto' || options.context === false) return
  const percent = await $.session.usage().then(u => u.context.percent, () => undefined)
  if (percent === undefined) return
  const decision = decideAuto({ percent, action, at: autoThreshold(options, limits), limits, state: await loadRelay($) })
  if (decision.reset) await saveRelay($, { autoDone: false })
  if (decision.run) {
    await saveRelay($, { autoDone: true })
    await startRelay($, 'auto')
  }
}

// After the clear the session is a new one (the engine fires session.end `clear`, then the classic SessionStart `clear`): the pickup runs here.
export function registerRelay(on: import('claude-code').On): void {
  on('classic.SessionStart', async ($, e, next) => {
    const state = await loadRelay($)
    if (e.source === 'clear' && state.pickupPending) {
      await saveRelay($, { pickupPending: false })
      $.clock.after(400, () => {
        void (async () => {
          const mode = state.mode ?? 'button'
          try {
            await $.command.run({ command: PICKUP })
            await saveRelay($, { running: false, last: { at: await $.clock.now(), ok: true, mode, why: 'handoff saved, context cleared, pickup started' } })
          } catch (err) {
            await saveRelay($, { running: false, last: { at: await $.clock.now(), ok: false, mode, why: `cleared, but the pickup failed (${reason(err)}); type /pickup` } })
            $.ui.toast('Cruise: the context was cleared but the pickup did not start. Type /pickup.')
          }
        })()
      })
    }
    return next(e)
  })
}
