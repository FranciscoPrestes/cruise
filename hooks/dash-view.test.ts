import { expect, test } from 'claude-code/testing'

import { cells } from './dash'
import { chrome, rows } from './dash-view'
import { detailPages } from './dash-view'
import type { Snapshot } from './dash-view'
import { DEFAULTS } from './levels'

const HUGE_ASK = Array.from({ length: 6 }, (_, i) => `Review the billing module and list every place where currency conversion could drift (part ${i + 1}). `.repeat(8)).join('\n\n')
const long = 'a very long reason the judge gave for this pick, far wider than any card could hold'
const full: Snapshot = {
  workspace: { cwd: '/Users/ana/work/a-very-long project  directory/checkout', branch: 'feature/testing', worktree: 'linked worktree' },
  limits: DEFAULTS,
  context: { on: true, percent: 99 },
  progress: { facts: { ask: { text: HUGE_ASK, at: 0 }, now: 12 * 60_000, expanded: false, step: { n: 3, total: 12, done: 2, title: long, complete: false }, background: '2 agents, 1 command' } },
  effort: { on: true, mode: 'jev (a-long-model-name)', way: "up or down from your app's, up to max", pick: 'xhigh', app: 'medium', why: long, paused: null, idle: null, idleWhy: null, families: 'Anthropic, OpenAI, Google (via router)', picks: { low: 40, medium: 30, high: 20, xhigh: 7, max: 3 }, counts: '100 judged · 70 steered · 12 failed · 123456 judge tokens' },
  update: { line: '9.9.9 is available (you have 1.5.0) · type /cruise:update', available: true },
  relay: { action: 'auto', autoAt: 85, running: false, now: 600_000, last: { at: 0, ok: false, mode: 'auto', why: 'no handoff file was written, so nothing was cleared and this sentence is long on purpose' } },
}
const open: Snapshot = { ...full, progress: { facts: { ...full.progress.facts!, expanded: true } } }
const noPlan: Snapshot = { ...full, progress: { facts: { ...full.progress.facts!, ask: { text: 'fix the login redirect after the session expires', at: 0 }, step: null, background: null } } }
const running: Snapshot = { ...full, relay: { ...full.relay, action: 'button', running: true } }
const alertOnly: Snapshot = { ...full, relay: { ...full.relay, action: 'alert', last: null } }
const paused: Snapshot = { ...full, effort: { ...full.effort, paused: 'the prompt cache was rewritten after an effort change' }, context: { on: true, percent: undefined } }

test('detail pages preserve every item across narrow pages', () => {
  const snap: Snapshot = { ...full, workspace: { ...full.workspace, files: Array.from({ length: 12 }, (_, n) => ({ path: `file-${n}`, staged: 'M', unstaged: ' ' })) } }
  const pages = detailPages(snap, 30)
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.flat().join(' ')).toContain('file-11')
})

test('detail pages retain Git state, exact spaces and the full model name', () => {
  const snap: Snapshot = { ...full, session: { model: 'model-with-a-long-identifier', now: 1, started: 0, activity: 0 }, workspace: { ...full.workspace, files: [{ path: 'two  spaces', staged: ' ', unstaged: 'M' }] } }
  const text = detailPages(snap, 80).flat().join('\n')
  expect(text).toContain('staged=- unstaged=M two  spaces')
  expect(text).toContain('model-with-a-long-identifier')
})

test('details open and close with keyboard-accessible controls', async $ => {
  const ui = await mountPane($, 80)
  await $.ui.press({ plugin: 'cruise', key: 'details-open' })
  expect(await ui.findAll({ text: /Details 1\// })).not.toHaveLength(0)
  await $.ui.press({ plugin: 'cruise', key: 'details-next' })
  expect(await ui.findAll({ text: /Details 2\// })).not.toHaveLength(0)
  await $.ui.press({ plugin: 'cruise', key: 'details-close' })
  expect(await ui.findAll({ text: /Workspace/ })).not.toHaveLength(0)
})

// Every drawn line (label column and content) must fit in the card's inner width, at any pane width and in both layouts.
for (const columns of [40, 60, 80, 150]) {
  for (const framed of [true, false]) {
    test(`every line fits the card (${columns} columns, ${framed ? 'framed' : 'inline'})`, () => {
      const inner = Math.max(20, columns - (framed ? 4 : 2))
      const body = Math.max(8, inner - 11)
      for (const snap of [full, open, noPlan, paused, running, alertOnly]) {
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
  test(`the dashboard names every feature (${columns} columns)`, async ($, on) => {
    on('clock.now', async () => ({ value: 1_000 }) as never)
    on('prompt.submit', async () => ({ text: 'ok' }) as never)
    on('tool.call', async () => ({ result: {} }) as never)
    await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
    await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Read', activeForm: 'Reading the backend', status: 'in_progress' }] } as never)
    const ui = await mountPane($, columns)
    for (const word of [/CRUISE/, /Workspace/, /Context/, /Effort/, /Progress/, /Updates/, /1\/1/]) expect(await ui.findAll({ text: word })).not.toHaveLength(0)
  })
}

test('above the prompt the dashboard drops its own frame and still names every feature', async $ => {
  const ui = await $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'Pane', requestId: 'cruise', props: { bodyColumns: 76, placement: 'inline' } as never })
  for (const word of [/CRUISE/, /Context/, /Effort/, /Progress/, /Updates/, /\/cruise:configure/]) expect(await ui.findAll({ text: word })).not.toHaveLength(0)
})

test('the dashboard reads and displays the current checkout', async ($, on) => {
  on('session.cwd', () => ({ value: '/work/project' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/project\n/work/main/.git/worktrees/project\n/work/main/.git\nfeature\n', stderr: '' } }))
  const ui = await mountPane($, 100)
  for (const word of [/\/work\/project/, /feature/, /linked worktree/]) expect(await ui.findAll({ text: word })).not.toHaveLength(0)
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
  expect(lines.join('\n')).toContain('◆ 2 agents, 1 command')
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

test('the Handoff row says what the context warning offers and how the last run ended', () => {
  const handoff = (snap: Snapshot) => rows(snap, 60, true).find(r => r.label === 'Handoff')!.lines.map(l => l.map(r => r.text).join('')).join('\n')
  expect(handoff(full)).toContain('auto at 85% · clears your conversation')
  expect(handoff(full)).toContain('aborted')
  expect(handoff(running)).toContain('running')
  expect(handoff(alertOnly)).toContain('alert only')
  expect(handoff({ ...full, relay: { ...full.relay, action: 'button', last: { at: 0, ok: true, mode: 'button', why: 'handoff saved, context cleared, pickup started' } } })).toContain('ok')
})

test('the workspace row retains the entire path and identifies branch and worktree', () => {
  const lines = rows(full, 25, true).find(r => r.label === 'Workspace')!.lines.map(line => line.map(r => r.text).join(''))
  expect(lines.join('')).toContain(full.workspace.cwd)
  expect(lines.join(' ')).toContain('feature/testing · linked worktree')
})

test('the Context row shows the automatic point when auto is on, and the /handoff hint otherwise', () => {
  const context = (snap: Snapshot) => rows(snap, 60, true).find(r => r.label === 'Context')!.lines.map(l => l.map(r => r.text).join('')).join('\n')
  expect(context(full)).toContain('auto at 85%')
  expect(context(full)).not.toContain('then type /handoff')
  expect(context({ ...full, relay: { ...full.relay, action: 'button' } })).toContain('then type /handoff')
  expect(context({ ...full, relay: { ...full.relay, action: 'alert' } })).not.toContain('auto at')
})

test('the Effort row names the families steered, and the model that is left alone', () => {
  const effort = (snap: Snapshot) => rows(snap, 70, true).find(r => r.label === 'Effort')!.lines.map(l => l.map(r => r.text).join('')).join('\n')
  expect(effort(full)).toContain('steers Anthropic, OpenAI, Google (via router)')
  const idle = effort({ ...full, effort: { ...full.effort, idle: 'OpenRouter/~deepseek/deepseek-pro-latest', idleWhy: 'Cruise steers Anthropic, OpenAI, Google (via router)' } })
  expect(idle).toContain('resting · OpenRouter/~deepseek/deepseek-pro-latest is left alone')
  expect(idle).toContain('Cruise steers Anthropic, OpenAI, Google (via router)')
})


test('the dashboard puts the active task and context before workspace details', () => {
  const labels = rows(full, 60, true).map(row => row.label)
  expect(labels.slice(0, 2)).toEqual(['Progress', 'Context'])
  expect(labels.indexOf('Workspace')).toBeGreaterThan(labels.indexOf('Handoff'))
})
