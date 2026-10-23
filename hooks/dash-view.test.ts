import { expect, test } from 'claude-code/testing'

import { cells } from './dash'
import { chrome, rows } from './dash-view'
import type { Snapshot } from './dash-view'
import { DEFAULTS } from './levels'

const HUGE_ASK = Array.from({ length: 6 }, (_, i) => `Review the billing module and list every place where currency conversion could drift (part ${i + 1}). `.repeat(8)).join('\n\n')
const long = 'a very long reason the judge gave for this pick, far wider than any card could hold'
const full: Snapshot = {
  limits: DEFAULTS,
  context: { on: true, percent: 99 },
  progress: { on: true, facts: { ask: { text: HUGE_ASK, at: 0 }, now: 12 * 60_000, expanded: false, step: { n: 3, total: 12, done: 2, title: long, complete: false }, background: '2 agents, 1 command' } },
  effort: { on: true, mode: 'jev (a-long-model-name)', way: "up or down from your app's, up to max", pick: 'xhigh', app: 'medium', why: long, paused: null, picks: { low: 40, medium: 30, high: 20, xhigh: 7, max: 3 }, counts: '100 judged · 70 steered · 12 failed · 123456 judge tokens' },
  update: { line: '9.9.9 is available (you have 1.5.0) · type /cruise:update', available: true },
}
const open: Snapshot = { ...full, progress: { on: true, facts: { ...full.progress.facts!, expanded: true } } }
const noPlan: Snapshot = { ...full, progress: { on: true, facts: { ...full.progress.facts!, ask: { text: 'fix the login redirect after the session expires', at: 0 }, step: null, background: null } } }
const paused: Snapshot = { ...full, effort: { ...full.effort, paused: 'the prompt cache was rewritten after an effort change' }, context: { on: true, percent: undefined } }

// Every drawn line (label column and content) must fit in the card's inner width, at any pane width and in both layouts.
for (const columns of [40, 60, 80, 150]) {
  for (const framed of [true, false]) {
    test(`every line fits the card (${columns} columns, ${framed ? 'framed' : 'inline'})`, () => {
      const inner = Math.max(20, columns - (framed ? 4 : 2))
      const body = Math.max(8, inner - 11)
      for (const snap of [full, open, noPlan, paused]) {
        for (const row of rows(snap, body, framed)) {
          for (const line of row.lines) expect(11 + line.reduce((n, r) => n + cells(r.text), 0)).toBeLessThanOrEqual(inner)
          // The request block: its widest row, plus the control (2 cells of air and "e: + more") when there is one.
          if (row.ask) expect(11 + 2 + Math.max(...row.ask.rows.map(cells)) + (row.ask.control ? 2 + 9 : 0)).toBeLessThanOrEqual(inner)
        }
      }
      const top = chrome(inner)
      for (const runs of [top.title, top.footer]) expect(runs.reduce((n, r) => n + cells(r.text), 0)).toBeLessThanOrEqual(inner)
      expect(cells(top.rule)).toBe(inner)
    })
  }
}

const mountPane = ($: Parameters<Parameters<typeof test>[2]>[0], columns: number) =>
  $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'Pane', requestId: 'cruise', props: { bodyColumns: columns } as never })

for (const columns of [100, 40]) {
  test(`the dashboard names every feature (${columns} columns)`, { options: { progress: true } }, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
    await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Read', activeForm: 'Reading the backend', status: 'in_progress' }] } as never)
    const ui = await mountPane($, columns)
    for (const word of [/Cruise/, /Context/, /Effort/, /Progress/, /Updates/, /1\/1/]) expect(await ui.findAll({ text: word })).not.toHaveLength(0)
  })
}

test('above the prompt the dashboard drops its own frame and still names every feature', async $ => {
  const ui = await $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'Pane', requestId: 'cruise', props: { bodyColumns: 76, placement: 'inline' } as never })
  for (const word of [/Cruise/, /Context/, /Effort/, /Progress/, /Updates/, /\/cruise:configure/]) expect(await ui.findAll({ text: word })).not.toHaveLength(0)
})

test('a feature that is off says how to turn it on', { options: { context: false, effort: 'off' } }, async ($) => {
  const ui = await mountPane($, 100)
  expect(await ui.findAll({ text: /off · turn on with \/cruise:configure/ })).not.toHaveLength(0)
})

const text = (snap: Snapshot, framed = true) => {
  const progress = rows(snap, 60, framed).find(r => r.label === 'Progress')!
  return { ask: progress.ask, lines: progress.lines.map(l => l.map(r => r.text).join('')) }
}

test('the Progress section shows the request cut to two rows, the age, the step and the background work', () => {
  const { ask, lines } = text(full)
  expect(ask?.rows).toHaveLength(2)
  expect(ask?.rows[1]?.endsWith('…')).toBe(true)
  expect(ask?.control).toBe('more')
  expect(lines.join('\n')).toContain('3/12')
  expect(lines.join('\n')).toContain('12 min ago')
  expect(lines.join('\n')).toContain('⚙ 2 agents, 1 command')
})

test('opened, the Progress section shows the whole request and offers to close it', () => {
  const { ask } = text(open)
  expect(ask?.control).toBe('less')
  expect(ask?.rows.length).toBeGreaterThan(3)
})

test('without a plan the Progress section says so quietly', () => {
  const { ask, lines } = text(noPlan)
  expect(ask?.control).toBeNull()
  expect(lines.join('\n')).toContain('no plan yet · steps appear when Claude keeps a task list')
})

test('with progress off the Progress section only says how to turn it on', () => {
  const { ask, lines } = text({ ...full, progress: { on: false, facts: null } })
  expect(ask).toBeUndefined()
  expect(lines).toEqual(['off · turn on with /cruise:configure'])
})
