// The pure pieces of the /cruise dashboard: coloured runs for the context meter and the effort mix.
import { LEVEL_COLOR } from './levels'
import type { Thresholds } from './levels'

// The Claude orange, the one brand colour of the dashboard (a hex, so it holds in terminals whose theme has no orange).
export const ORANGE = '#D97757'

export type Run = { text: string; color?: string; dim?: boolean; bold?: boolean }

// Cells a glyph takes on screen: 2 for East Asian wide characters and the emoji that default to emoji presentation (⚡ is one), else 1.
const EMOJI_WIDE = new Set([0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615, 0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55])
const glyphCells = (cp: number): number =>
  (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || EMOJI_WIDE.has(cp) ? 2 : 1

export const cells = (text: string): number => [...text].reduce((n, ch) => n + glyphCells(ch.codePointAt(0) ?? 0), 0)

// The runs cut to `max` cells in all, the last one ending in an ellipsis; never wider, whatever the glyphs.
export function fitRuns(runs: readonly Run[], max: number): Run[] {
  if (runs.reduce((n, r) => n + cells(r.text), 0) <= max) return [...runs]
  const out: Run[] = []
  let left = Math.max(0, max - 1)
  for (const run of runs) {
    let text = ''
    for (const ch of run.text) {
      const w = glyphCells(ch.codePointAt(0) ?? 0)
      if (w > left) {
        left = 0
        break
      }
      text += ch
      left -= w
    }
    if (text) out.push({ ...run, text })
    if (text.length < run.text.length) break
  }
  const last = out.at(-1)
  return last ? [...out.slice(0, -1), { ...last, text: `${last.text}…` }] : [{ text: '…' }]
}

export const zone = (percent: number, limits: Thresholds): string => (percent >= limits.urgentAt ? 'red' : percent >= limits.warnAt ? 'yellow' : 'green')

const litCells = (percent: number, width: number): number => Math.max(0, Math.min(width, Math.round((percent / 100) * width)))

// ████░░░░: filled cells coloured by the zone each one is in, then the dim empty rest.
export function meter(percent: number, width: number, limits: Thresholds): Run[] {
  const lit = litCells(percent, width)
  const runs: Run[] = []
  for (let i = 0; i < lit; i++) {
    const color = zone(((i + 1) / width) * 100, limits)
    const last = runs.at(-1)
    if (last?.color === color) runs[runs.length - 1] = { text: `${last.text}█`, color }
    else runs.push({ text: '█', color })
  }
  if (lit < width) runs.push({ text: '░'.repeat(width - lit), dim: true })
  return runs
}

// A row under the meter that names the two warning points where the bar crosses them.
export function tickRow(width: number, limits: Thresholds): string {
  const row = Array.from({ length: width }, () => ' ')
  for (const at of [limits.warnAt, limits.urgentAt]) {
    const label = String(at)
    const start = Math.min(width - label.length, litCells(at, width))
    label.split('').forEach((ch, i) => {
      row[start + i] = ch
    })
  }
  return row.join('')
}

// » high (app medium): the effort the judge picked, in its level colour, with the app's own effort dim beside it.
// » is one cell wide in every terminal (⚡ is two in some and one in others, which shifted whatever came after it).
export const effortToken = (pick: string, app: string | null): Run[] => [{ text: `» ${pick}`, color: LEVEL_COLOR[pick], bold: true }, ...(app ? [{ text: ` (app ${app})`, dim: true }] : [])]

const ORDER = ['low', 'medium', 'high', 'xhigh', 'max']

// One bar split between the efforts picked so far, in proportion, every pick at least one cell wide.
export function mix(picks: Readonly<Record<string, number>>, width: number): Run[] {
  const present = ORDER.filter(k => (picks[k] ?? 0) > 0)
  const total = present.reduce((sum, k) => sum + (picks[k] ?? 0), 0)
  if (total === 0 || width < present.length) return []
  const exact = present.map(k => ((picks[k] ?? 0) / total) * (width - present.length))
  const sizes = exact.map(x => 1 + Math.floor(x))
  const byRemainder = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  const missing = width - sizes.reduce((a, b) => a + b, 0)
  for (let j = 0; j < missing; j++) sizes[byRemainder[j % byRemainder.length]![1]]! += 1
  return present.map((k, i) => ({ text: '▇'.repeat(sizes[i]!), color: LEVEL_COLOR[k] }))
}
