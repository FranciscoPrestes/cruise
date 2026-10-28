// The relay: handoff, clear, go-around; automatic mode runs it at the configured threshold.
// The pure decisions are at the top; the part that talks to the engine is at the bottom.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { zone } from './dash'
import type { Run } from './dash'
import type { Thresholds } from './levels'

export type ContextAction = 'button' | 'alert' | 'auto'
export type RelayRecord = { at: number; ok: boolean; mode: 'button' | 'auto'; why: string }
export type RelayState = { running: boolean; pickupPending: boolean; pickupPath?: string; stage?: string; autoDone: boolean; mode: 'button' | 'auto' | null; last: RelayRecord | null }
type Entry = { name: string; kind: string; mtimeMs: number }

export const contextAction = (options: PluginOptions): ContextAction => (options.contextAction === 'alert' || options.contextAction === 'auto' ? options.contextAction : 'button')

// The highest point automatic mode may start at: above it the handoff itself (a turn that writes the file) might not fit.
const AUTO_MAX = 95

// Where automatic mode starts: `autoAt`, or the urgent warning when it is 0 or unset; never before the first warning, never above 95.
export function autoThreshold(options: PluginOptions, limits: Thresholds): number {
  const at = typeof options.autoAt === 'number' && options.autoAt > 0 ? options.autoAt : limits.urgentAt
  return Math.max(Math.min(at, AUTO_MAX), limits.warnAt)
}

// The handoff skill saves under ~/.local/state/handoffs/<working directory with / turned into ->/.
export const handoffDir = (home: string, cwd: string): string => `${home}/.local/state/handoffs/${cwd.replace(/\//g, '-')}`

export function windowLabel(tokens: number | undefined): string | undefined {
  if (!tokens) return undefined
  return tokens >= 1_000_000 ? `${Number((tokens / 1_000_000).toFixed(1))}M` : `${Math.round(tokens / 1000)}K`
}

type RowInput = { percent: number | undefined; window: number | undefined; action: ContextAction; limits: Thresholds; autoAt: number; running: boolean }

// The button is always available in button mode; alert and auto retain their own behavior.
export function contextRow(i: RowInput): { runs: Run[]; button: boolean; severity?: 'normal' | 'recommended' | 'critical' | 'unknown' } | null {
  if (i.action === 'alert') return null
  if (i.running) return { runs: [{ text: 'Handoff in progress…', color: 'yellow' }], button: false }
  if (i.action === 'button') {
    const severity = i.percent === undefined ? 'unknown' : i.percent >= i.limits.urgentAt ? 'critical' : i.percent >= i.limits.warnAt ? 'recommended' : 'normal'
    const label = i.percent === undefined ? 'Context unknown' : i.percent >= i.limits.warnAt ? `Context ${i.percent}%${windowLabel(i.window) ? ` of ${windowLabel(i.window)}` : ''} ${severity === 'critical' ? 'critical' : 'handoff recommended'}` : ''
    return { runs: [{ text: label }, ...(label ? [{ text: ' · ' }] : [])], button: true, severity }
  }
  if (i.percent === undefined || i.percent < i.limits.warnAt) return null
  const size = windowLabel(i.window)
  const head: Run = { text: `Context ${i.percent}%${size ? ` of ${size}` : ''}`, color: zone(i.percent, i.limits), bold: true }
  if (i.action === 'auto') return { runs: [head, { text: ` · automatic at ${i.autoAt}%`, dim: true }], button: false }
  return { runs: [head, { text: ' · ', dim: true }], button: true }
}

type BandInput = RowInput & { effort: Run[] }

// The band fits context, the effort pick and the handoff control into one row.
export function bandRow(i: BandInput): { runs: Run[]; button: boolean; severity?: 'normal' | 'recommended' | 'critical' | 'unknown' } | null {
  const context = contextRow(i)
  if (!context) return i.effort.length > 0 ? { runs: i.effort, button: false } : null
  if (i.running || i.action === 'auto' || i.effort.length === 0) return context
  const [head] = context.runs
  const dot: Run = { text: ' · ', dim: true }
  return { runs: [...(head?.text ? [head, dot] : []), ...i.effort, dot], button: true, severity: context.severity }
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
  handoffPath: (started: number) => Promise<string>
  // Runs the handoff as a turn and says whether that turn finished.
  runHandoff: (path: string) => Promise<boolean>
  listHandoffs: () => Promise<Entry[]>
  clear: () => Promise<void>
  save: (patch: Partial<RelayState>) => Promise<void>
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Handoff, then proof that the file exists, then clear. Any step that fails stops here, before the clear: the person is never left
// with an empty conversation and no handoff. The pickup is run by the session that starts after the clear (see registerRelay).
export async function runRelay(d: RelayDeps, mode: 'button' | 'auto'): Promise<{ ok: boolean; why: string }> {
  const started = await d.now()
  await d.save({ running: true, mode, stage: 'saving handoff' })
  const stop = async (why: string) => {
    await d.save({ running: false, stage: 'aborted', last: { at: await d.now(), ok: false, mode, why } })
    d.toast(`Cruise: ${why}.`)
    return { ok: false, why }
  }
  d.toast(mode === 'auto' ? 'Cruise: the context is full, so it is doing the handoff, clearing and picking up by itself. Do not type until it ends.' : 'Cruise: handoff, then clear, then pickup. Do not type until it ends.')

  let path: string
  try {
    path = await d.handoffPath(started)
    if (!(await d.runHandoff(path))) return stop('the handoff did not finish in time, so nothing was cleared')
  } catch (err) {
    return stop(`the handoff could not run: ${reason(err)}`)
  }
  const name = path.slice(path.lastIndexOf('/') + 1)
  const entries = await d.listHandoffs().catch(() => [])
  if (!entries.some(e => e.name === name && e.kind === 'file' && e.mtimeMs >= started)) return stop('no handoff file was written at the requested path, so nothing was cleared')

  await d.save({ pickupPending: true, pickupPath: path, stage: 'handoff saved' })
  try {
    await d.clear()
  } catch (err) {
    await d.save({ pickupPending: false, pickupPath: undefined })
    return stop(`the clear failed (the handoff is saved): ${reason(err)}`)
  }
  return { ok: true, why: 'handoff saved, context cleared' }
}

// ---- the part that talks to the engine ----

const HANDOFF = 'cruise:handoff'
const PICKUP = 'cruise:go-around'
const HANDOFF_TIMEOUT_MS = 180_000
const EMPTY: RelayState = { running: false, pickupPending: false, autoDone: false, mode: null, last: null }

// Module state survives clear and is isolated from other Claude processes.
let relayState: RelayState = { ...EMPTY }
export async function loadRelay(_$: EngineInterface): Promise<RelayState> { return { ...relayState } }

async function saveRelay($: EngineInterface, patch: Partial<RelayState>): Promise<void> {
  relayState = { ...relayState, ...patch }
  $.ui.invalidate('ui.render') // the band reads this record
}

// A new process never has a run in flight: whatever a crashed one left behind is cleared.
export async function resetRelay($: EngineInterface): Promise<void> {
  await saveRelay($, { running: false, pickupPending: false, pickupPath: undefined })
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
    handoffPath: async started => {
      const home = await $.env.get('HOME')
      if (!home) throw new Error('HOME is unavailable')
      const session = (await $.session.id()).replace(/[^a-zA-Z0-9_-]/g, '-')
      if (!session) throw new Error('session id is unavailable')
      return `${handoffDir(home, await $.session.cwd())}/relay-${started}-${session}.md`
    },
    runHandoff: async path => {
      const finished = new Promise<boolean>(resolve => {
        waiting = { sawStep: false, resolve: () => resolve(true) }
      })
      try {
        await $.command.run({ command: HANDOFF, args: path })
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
  if (relayState.running) return
  relayState = { ...relayState, running: true, mode }
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
      await saveRelay($, { pickupPending: false, pickupPath: undefined, stage: 'context cleared' })
      $.clock.after(400, () => {
        void (async () => {
          const mode = state.mode ?? 'button'
          try {
            if (!state.pickupPath) throw new Error('handoff path unavailable')
            await $.command.run({ command: PICKUP, args: state.pickupPath })
            await saveRelay($, { running: false, stage: 'go-around started', last: { at: await $.clock.now(), ok: true, mode, why: 'handoff saved, context cleared, go-around started' } })
          } catch (err) {
            await saveRelay($, { running: false, last: { at: await $.clock.now(), ok: false, mode, why: `cleared, but go-around failed (${reason(err)}); use /cruise:go-around ${state.pickupPath ?? '<handoff path>'}` } })
            $.ui.toast(`Cruise: context cleared, but go-around failed. Use /cruise:go-around ${state.pickupPath ?? '<handoff path>'}`)
          }
        })()
      })
    }
    return next(e)
  })
}
