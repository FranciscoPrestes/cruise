import { expect, test } from 'claude-code/testing'

import { askView, wrapText } from './ask'
import { cells } from './dash'

// A huge, multi-paragraph prompt, as the people who use this write them (about 3,000 characters, with blank lines between paragraphs).
const paragraph = 'Please review the billing module of the planning app, check how invoices are rounded, and list every place where the currency conversion could drift. '
const HUGE = Array.from({ length: 5 }, (_, i) => paragraph.repeat(4).trim() + ` (part ${i + 1})`).join('\n\n')
const SHORT = 'fix the login redirect after the session expires'

test('the test prompt really is huge and multi-paragraph', () => {
  expect(HUGE.length).toBeGreaterThan(2900)
  expect(HUGE.split('\n\n').length).toBe(5)
})

for (const columns of [40, 80, 150]) {
  test(`collapsed, a huge prompt takes two rows, ends in an ellipsis and offers "more" (${columns} columns)`, () => {
    const view = askView(HUGE, columns - 2, false)
    expect(view.rows).toHaveLength(2)
    expect(view.control).toBe('more')
    for (const row of view.rows) expect(cells(row)).toBeLessThanOrEqual(columns - 2)
    expect(view.rows[1]?.endsWith('…')).toBe(true)
    // The band is these rows plus its one step / effort / background row: never more than three.
    expect(view.rows.length + 1).toBeLessThanOrEqual(3)
  })

  test(`expanded, the whole prompt is there, wrapped, with "less" (${columns} columns)`, () => {
    const view = askView(HUGE, columns - 2, true)
    expect(view.control).toBe('less')
    expect(view.rows.length).toBeGreaterThan(3)
    for (const row of view.rows) expect(cells(row)).toBeLessThanOrEqual(columns - 2)
    expect(view.rows.join(' ').split(/\s+/).filter(Boolean)).toEqual(HUGE.split(/\s+/).filter(Boolean))
  })
}

test('a short prompt is left alone and has no control', () => {
  expect(askView(SHORT, 78, false)).toEqual({ rows: [SHORT], control: null })
  expect(askView(SHORT, 78, true)).toEqual({ rows: [SHORT], control: null })
})

test('a prompt that needs exactly two rows is not cut', () => {
  const view = askView('word '.repeat(14).trim(), 40, false)
  expect(view.rows).toHaveLength(2)
  expect(view.control).toBeNull()
  expect(view.rows.some(r => r.endsWith('…'))).toBe(false)
})

test('a word wider than the row is split rather than overflowing', () => {
  const rows = wrapText('x'.repeat(100), 30)
  expect(rows.length).toBe(4)
  for (const row of rows) expect(cells(row)).toBeLessThanOrEqual(30)
})

test('wrapping keeps one blank row between paragraphs and drops the ones at the ends', () => {
  expect(wrapText('\n\nfirst\n\n\n\nsecond\n\n', 40)).toEqual(['first', '', 'second'])
})
