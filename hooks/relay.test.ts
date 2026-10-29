import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from './levels'
import { effortToken } from './dash'
import { autoThreshold, bandRow, contextAction, contextRow, decideAuto, handoffDir, runRelay, windowLabel, registerRelay, startRelay, relayStep, relayTurnDone, resetRelay } from './relay'
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

test('the window is named the way people say it', () => {
  expect(windowLabel(200_000)).toBe('200K')
  expect(windowLabel(1_000_000)).toBe('1M')
  expect(windowLabel(undefined)).toBeUndefined()
})

test('the context row appears only from the first warning, and only when the action wants one', () => {
  const row = (percent: number | undefined, action: 'button' | 'alert' | 'auto', running = false) => contextRow({ percent, window: 200_000, action, limits: DEFAULTS, autoAt: 80, running })
  expect(row(40, 'button')?.button).toBe(true)
  expect(row(undefined, 'button')?.button).toBe(true)
  expect(row(72, 'alert')).toBeNull()
  const button = row(72, 'button')
  expect(button?.button).toBe(true)
  expect(button?.runs.map(r => r.text).join('')).toContain('Context 72% of 200K')
  const auto = row(72, 'auto')
  expect(auto?.button).toBe(false)
  expect(auto?.runs.map(r => r.text).join('')).toContain('automatic at 80%')
  const busy = row(90, 'button', true)
  expect(busy?.button).toBe(false)
  expect(busy?.runs.map(r => r.text).join('')).toContain('Handoff in progress')
})

const PICK = effortToken('high', 'medium')

test('the band is one row: the effort pick alone below the warning, context then pick then the button above it', () => {
  const row = (percent: number | undefined, action: 'button' | 'alert' | 'auto', over: { effort?: typeof PICK; running?: boolean } = {}) =>
    bandRow({ percent, window: 200_000, action, limits: DEFAULTS, autoAt: 80, running: over.running ?? false, effort: over.effort ?? [] })
  const text = (r: ReturnType<typeof row>) => r?.runs.map(x => x.text).join('')
  expect(row(40, 'button')?.button).toBe(true)
  expect(row(undefined, 'button')?.button).toBe(true)
  expect(text(row(40, 'button', { effort: PICK }))).toContain('» high')
  expect(row(40, 'button', { effort: PICK })?.button).toBe(true)
  expect(text(row(72, 'button', { effort: PICK }))).toBe('Context 72% of 200K handoff recommended · » high (app medium) · ')
  expect(row(72, 'button', { effort: PICK })?.button).toBe(true)
  expect(text(row(72, 'button'))).toBe('Context 72% of 200K handoff recommended · ')
  // The label follows the button colour: orange at the warning, bold red when urgent, plain below it.
  expect(row(72, 'button')?.runs[0]).toMatchObject({ color: '#D97757' })
  expect(row(90, 'button')?.runs[0]).toMatchObject({ color: 'red', bold: true })
  expect(row(40, 'button')?.runs[0]?.color).toBeUndefined()
  // Alert mode adds no context row, but the pick is still worth a token.
  expect(text(row(95, 'alert', { effort: PICK }))).toBe('» high (app medium)')
  expect(row(95, 'alert')).toBeNull()
})

test('the automatic and running texts do not carry the pick', () => {
  const base = { percent: 72, window: 200_000, limits: DEFAULTS, autoAt: 80, effort: PICK }
  expect(bandRow({ ...base, action: 'auto', running: false })?.runs.map(r => r.text).join('')).toBe('Context 72% of 200K · automatic at 80%')
  expect(bandRow({ ...base, action: 'button', running: true })?.runs.map(r => r.text).join('')).toContain('Handoff in progress')
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
    handoffPath: async () => '/tmp/relay-10000-session.md',
    runHandoff: async path => {
      log.push(`handoff:${path}`)
      return true
    },
    listHandoffs: async () => {
      log.push('list')
      return [{ name: 'relay-10000-session.md', kind: 'file', mtimeMs: 10_500 }]
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
  expect(log.filter(l => !l.startsWith('toast'))).toEqual(['handoff:/tmp/relay-10000-session.md', 'list', 'clear'])
  expect(state.find(s => s.pickupPending)?.pickupPath).toBe('/tmp/relay-10000-session.md')
})

test('a newer concurrent handoff cannot replace the requested file', async () => {
  const other = { name: 'relay-10000-other.md', kind: 'file', mtimeMs: 10_900 }
  const missing = stubs({ listHandoffs: async () => [other] })
  expect((await runRelay(missing.deps, 'button')).ok).toBe(false)
  expect(missing.log).not.toContain('clear')
  const both = stubs({ listHandoffs: async () => [other, { name: 'relay-10000-session.md', kind: 'file', mtimeMs: 10_500 }] })
  expect((await runRelay(both.deps, 'button')).ok).toBe(true)
  expect(both.state.find(s => s.pickupPending)?.pickupPath).toBe('/tmp/relay-10000-session.md')
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

test('an aborted relay no longer claims it is saving', async () => {
  const run = stubs({ runHandoff: async () => false })
  await runRelay(run.deps, 'button')
  expect(run.state.at(-1)?.stage).toBe('aborted')
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

test('button severity follows configured thresholds even without usage', () => {
  const row = (percent: number | undefined) => contextRow({ percent, window: 200_000, action: 'button', limits: DEFAULTS, autoAt: 80, running: false })
  expect(row(59)?.severity).toBe('normal')
  expect(row(60)?.severity).toBe('recommended')
  expect(row(80)?.severity).toBe('critical')
  expect(row(undefined)?.severity).toBe('unknown')
})

 test('custom thresholds determine severity at exact boundaries', () => {
  const limits = { ...DEFAULTS, warnAt: 50, urgentAt: 75 }
  const row = (percent: number) => contextRow({ percent, window: 200000, action: 'button', limits, autoAt: 80, running: false })
  expect(row(49)?.severity).toBe('normal')
  expect(row(50)?.severity).toBe('recommended')
  expect(row(74)?.severity).toBe('recommended')
  expect(row(75)?.severity).toBe('critical')
})

test('relay resumes the exact handoff once after clear', async () => {
  const scheduled: (() => void)[] = []
  const commands: { command: string; args?: string }[] = []
  let handler: any
  registerRelay(((name: string, fn: any) => { if (name === 'classic.SessionStart') handler = fn }) as never)
  const $: any = {
    ui: { invalidate: () => {}, toast: () => {} },
    clock: { now: async () => 1000, after: (_: number, fn: () => void) => scheduled.push(fn), sleep: () => new Promise(() => {}) },
    env: { get: async () => '/tmp' }, session: { cwd: async () => '/work with spaces', id: async () => 'abc' },
    fs: { list: async () => [{ name: 'relay-1000-abc.md', kind: 'file', mtimeMs: 1000 }] },
    command: { run: async (e: any) => { commands.push(e); if (e.command === 'cruise:handoff') { relayStep(); relayTurnDone({}) } } },
  }
  await resetRelay($)
  await Promise.all([startRelay($, 'button'), startRelay($, 'button')])
  scheduled.shift()!()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(commands.filter(e => e.command === 'clear')).toHaveLength(1)
  await handler($, { source: 'clear' }, async () => ({}))
  await handler($, { source: 'clear' }, async () => ({}))
  scheduled.shift()!()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(commands.filter(e => e.command === 'cruise:go-around')).toEqual([{ command: 'cruise:go-around', args: '/tmp/.local/state/handoffs/-work with spaces/relay-1000-abc.md' }])
  expect(commands.filter(e => e.command === 'cruise:pickup')).toHaveLength(0)
})
