import { expect, test } from 'claude-code/testing'

import { cells, fitRuns, mix, meter, tickRow, zone } from './dash'
import { DEFAULTS } from './levels'

const text = (runs: readonly { text: string }[]) => runs.map(r => r.text).join('')

test('the meter fills in proportion and colours each cell by its zone', () => {
  const runs = meter(50, 20, DEFAULTS)
  expect(text(runs)).toBe('██████████░░░░░░░░░░')
  expect(runs[0]).toEqual({ text: '██████████', color: 'green' })
})

test('the meter turns amber and red past the warnings and never overflows', () => {
  expect(meter(70, 10, DEFAULTS).map(r => r.color)).toEqual(['green', 'yellow', undefined])
  expect(text(meter(150, 10, DEFAULTS))).toBe('██████████')
  expect(meter(95, 10, DEFAULTS).at(-1)?.color).toBe('red')
  expect(text(meter(-5, 10, DEFAULTS))).toBe('░░░░░░░░░░')
})

test('the zone follows the two thresholds', () => {
  expect([zone(10, DEFAULTS), zone(60, DEFAULTS), zone(80, DEFAULTS)]).toEqual(['green', 'yellow', 'red'])
})

test('the tick row marks both warnings at the bar position', () => {
  const row = tickRow(20, DEFAULTS)
  expect(row.length).toBe(20)
  expect(row.indexOf('60')).toBe(12)
  expect(row.indexOf('80')).toBe(16)
})

test('the mix fills the width, keeps order and gives every pick a cell', () => {
  const runs = mix({ low: 6, medium: 1, max: 1 }, 20)
  expect(text(runs).length).toBe(20)
  expect(runs.map(r => r.color)).toEqual(['green', 'cyan', 'red'])
  expect(runs.every(r => r.text.length >= 1)).toBe(true)
})

test('wide glyphs count two cells and plain ones one', () => {
  expect(cells('abc')).toBe(3)
  expect(cells('⚡')).toBe(2)
  expect(cells('日本')).toBe(4)
  expect(cells('◐●▰»')).toBe(4)
})

test('fitRuns never exceeds the width, ends in an ellipsis and keeps each run its colour', () => {
  const runs = [{ text: '» high', color: 'yellow' }, { text: ' · a very long reason that does not fit', dim: true }]
  for (const max of [1, 2, 8, 10, 20, 100]) {
    const fitted = fitRuns(runs, max)
    expect(fitted.reduce((n, r) => n + cells(r.text), 0)).toBeLessThanOrEqual(max)
  }
  const cut = fitRuns(runs, 12)
  expect(cut.map(r => r.text).join('').endsWith('…')).toBe(true)
  expect(cut[0]?.color).toBe('yellow')
  expect(fitRuns(runs, 100)).toEqual(runs)
  expect(fitRuns([{ text: '⚡⚡⚡' }], 4).reduce((n, r) => n + cells(r.text), 0)).toBeLessThanOrEqual(4)
})

test('an empty mix is empty', () => {
  expect(mix({}, 20)).toEqual([])
})
