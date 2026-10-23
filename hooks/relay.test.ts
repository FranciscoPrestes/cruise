import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from './levels'
import { effortToken } from './dash'
import { autoThreshold, bandRow, contextAction, contextRow, decideAuto, freshHandoff, handoffDir, runRelay, windowLabel } from './relay'
import type { RelayDeps, RelayState } from './relay'

const idle: RelayState = { running: false, pickupPending: false, autoDone: false, mode: null, last: null }

test('the action is the button unless the settings say otherwise', () => {
  expect(contextAction({})).toBe('button')
  expect(contextAction({ contextAction: 'alert' })).toBe('alert')
  expect(contextAction({ contextAction: 'auto' })).toBe('auto')
  expect(contextAction({ contextAction: 'whatever' })).toBe('button')
})

test('the automatic point follows the urgent warning unless it is set', () => {
  expect(autoThreshold({}, DEFAULTS)).toBe(80)
  expect(autoThreshold({ autoAt: 0 }, DEFAULTS)).toBe(80)
  expect(autoThreshold({ autoAt: 90 }, DEFAULTS)).toBe(90)
  expect(autoThreshold({ autoAt: 5 }, DEFAULTS)).toBe(60)
  // Clamped to what leaves room for the handoff itself: never above 95, whatever was typed or the urgent warning is.
  expect(autoThreshold({ autoAt: 99 }, DEFAULTS)).toBe(95)
  expect(autoThreshold({}, { ...DEFAULTS, urgentAt: 99 })).toBe(95)
  expect(autoThreshold({ autoAt: 'x' }, DEFAULTS)).toBe(80)
  expect(autoThreshold({ autoAt: 70 }, { ...DEFAULTS, warnAt: 75, urgentAt: 85 })).toBe(75)
})

test('the handoff folder is the working directory with / turned into -', () => {
  expect(handoffDir('/home/ana', '/work/demo-app')).toBe('/home/ana/.local/state/handoffs/-work-demo-app')
})

test('only a markdown file written since the start counts as the handoff', () => {
  const entries = [
    { name: '2026-10-22-1000.md', kind: 'file', mtimeMs: 1_000 },
    { name: 'notes.txt', kind: 'file', mtimeMs: 9_000 },
    { name: '2026-10-23-1200.md', kind: 'file', mtimeMs: 5_000 },
    { name: 'sub', kind: 'directory', mtimeMs: 0 },
  ]
  expect(freshHandoff(entries, 4_000)).toBe('2026-10-23-1200.md')
  expect(freshHandoff(entries, 6_000)).toBeUndefined()
  expect(freshHandoff([], 0)).toBeUndefined()
})

test('the window is named the way people say it', () => {
  expect(windowLabel(200_000)).toBe('200K')
  expect(windowLabel(1_000_000)).toBe('1M')
  expect(windowLabel(undefined)).toBeUndefined()
})

test('the context row appears only from the first warning, and only when the action wants one', () => {
  const row = (percent: number | undefined, action: 'button' | 'alert' | 'auto', running = false) => contextRow({ percent, window: 200_000, action, limits: DEFAULTS, autoAt: 80, running })
  expect(row(40, 'button')).toBeNull()
  expect(row(undefined, 'button')).toBeNull()
  expect(row(72, 'alert')).toBeNull()
  const button = row(72, 'button')
  expect(button?.button).toBe(true)
  expect(button?.runs.map(r => r.text).join('')).toContain('Context 72% of 200K')
  const auto = row(72, 'auto')
  expect(auto?.button).toBe(false)
  expect(auto?.runs.map(r => r.text).join('')).toContain('automatic at 80%')
  const busy = row(90, 'button', true)
  expect(busy?.button).toBe(false)
  expect(busy?.runs.map(r => r.text).join('')).toContain('handing off')
})

const PICK = effortToken('high', 'medium')

test('the band is one row: the effort pick alone below the warning, context then pick then the button above it', () => {
  const row = (percent: number | undefined, action: 'button' | 'alert' | 'auto', over: { effort?: typeof PICK; running?: boolean } = {}) =>
    bandRow({ percent, window: 200_000, action, limits: DEFAULTS, autoAt: 80, running: over.running ?? false, effort: over.effort ?? [] })
  const text = (r: ReturnType<typeof row>) => r?.runs.map(x => x.text).join('')
  expect(row(40, 'button')).toBeNull()
  expect(row(undefined, 'button')).toBeNull()
  expect(text(row(40, 'button', { effort: PICK }))).toBe('» high (app medium)')
  expect(row(40, 'button', { effort: PICK })?.button).toBe(false)
  expect(text(row(72, 'button', { effort: PICK }))).toBe('Context 72% of 200K · » high (app medium) · ')
  expect(row(72, 'button', { effort: PICK })?.button).toBe(true)
  expect(text(row(72, 'button'))).toBe('Context 72% of 200K · ')
  // Alert mode adds no context row, but the pick is still worth a token.
  expect(text(row(95, 'alert', { effort: PICK }))).toBe('» high (app medium)')
  expect(row(95, 'alert')).toBeNull()
})

test('the automatic and running texts do not carry the pick', () => {
  const base = { percent: 72, window: 200_000, limits: DEFAULTS, autoAt: 80, effort: PICK }
  expect(bandRow({ ...base, action: 'auto', running: false })?.runs.map(r => r.text).join('')).toBe('Context 72% of 200K · automatic at 80%')
  expect(bandRow({ ...base, action: 'button', running: true })?.runs.map(r => r.text).join('')).toContain('handing off')
})

test('auto runs once at its point, between turns, and again only after the context fell', () => {
  const at = (percent: number, state: RelayState = idle, action: 'auto' | 'button' = 'auto') => decideAuto({ percent, action, at: 80, limits: DEFAULTS, state })
  expect(at(79)).toEqual({ run: false, reset: false })
  expect(at(80)).toEqual({ run: true, reset: false })
  expect(at(95, { ...idle, autoDone: true })).toEqual({ run: false, reset: false })
  expect(at(95, { ...idle, running: true })).toEqual({ run: false, reset: false })
  expect(at(95, { ...idle, pickupPending: true })).toEqual({ run: false, reset: false })
  expect(at(95, idle, 'button')).toEqual({ run: false, reset: false })
  expect(at(20, { ...idle, autoDone: true })).toEqual({ run: false, reset: true })
})

// A relay with every step stubbed: the log shows which steps ran, in order.
function stubs(over: Partial<RelayDeps> = {}): { deps: RelayDeps; log: string[]; state: RelayState[] } {
  const log: string[] = []
  const state: RelayState[] = []
  const deps: RelayDeps = {
    now: async () => 10_000,
    toast: text => void log.push(`toast:${text.slice(0, 20)}`),
    runHandoff: async () => {
      log.push('handoff')
      return true
    },
    listHandoffs: async () => {
      log.push('list')
      return [{ name: '2026-10-23-1200.md', kind: 'file', mtimeMs: 10_500 }]
    },
    clear: async () => void log.push('clear'),
    save: async patch => void state.push({ ...idle, ...patch }),
    ...over,
  }
  return { deps, log, state }
}

test('the relay does the handoff, checks the file, then clears', async () => {
  const { deps, log, state } = stubs()
  const done = await runRelay(deps, 'button')
  expect(done).toEqual({ ok: true, why: 'handoff saved, context cleared' })
  expect(log.filter(l => !l.startsWith('toast'))).toEqual(['handoff', 'list', 'clear'])
  expect(state.some(s => s.pickupPending)).toBe(true)
})

test('without a fresh handoff file nothing is cleared', async () => {
  const stale = stubs({ listHandoffs: async () => [{ name: 'old.md', kind: 'file', mtimeMs: 1 }] })
  const result = await runRelay(stale.deps, 'auto')
  expect(result.ok).toBe(false)
  expect(result.why).toContain('no handoff')
  expect(stale.log).not.toContain('clear')
  const missing = stubs({ listHandoffs: async () => [] })
  expect((await runRelay(missing.deps, 'auto')).ok).toBe(false)
  expect(missing.log).not.toContain('clear')
})

test('a handoff turn that never finishes aborts before anything is cleared', async () => {
  const { deps, log } = stubs({ runHandoff: async () => false })
  const result = await runRelay(deps, 'button')
  expect(result.ok).toBe(false)
  expect(log).not.toContain('clear')
  expect(log).not.toContain('list')
})

test('a handoff that throws aborts and says why', async () => {
  const { deps, log } = stubs({
    runHandoff: async () => {
      throw new Error('queue full')
    },
  })
  const result = await runRelay(deps, 'button')
  expect(result).toEqual({ ok: false, why: 'the handoff could not run: queue full' })
  expect(log).not.toContain('clear')
})

test('a clear that fails leaves the handoff saved and no pickup waiting', async () => {
  const { deps, state } = stubs({
    clear: async () => {
      throw new Error('refused')
    },
  })
  const result = await runRelay(deps, 'button')
  expect(result.ok).toBe(false)
  expect(result.why).toContain('handoff is saved')
  expect(state.at(-1)?.pickupPending).toBe(false)
})
