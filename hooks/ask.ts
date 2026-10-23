// The latest request as the band and the /cruise dashboard show it: at most two rows when collapsed, all of it when open.
import { cells, fitRuns } from './dash'

export const MORE = '+ more'
export const LESS = '- less'
// What the control takes from the right of the request: "e: + more" (a plain Button draws its hotkey first) and two cells of air.
const CONTROL_COLS = 12

function wrapLine(line: string, width: number): string[] {
  const rows: string[] = []
  let row = ''
  for (const word of line.split(/\s+/).filter(Boolean)) {
    let rest = word
    // A word wider than a row is split at the edge rather than left to overflow.
    while (cells(rest) > width) {
      let head = ''
      for (const ch of rest) {
        if (cells(head + ch) > width) break
        head += ch
      }
      if (row) rows.push(row)
      rows.push(head)
      row = ''
      rest = rest.slice(head.length)
    }
    if (!rest) continue
    if (!row) row = rest
    else if (cells(`${row} ${rest}`) <= width) row = `${row} ${rest}`
    else {
      rows.push(row)
      row = rest
    }
  }
  return row ? [...rows, row] : rows
}

// Paragraphs kept: one blank row between them, none at the start or the end.
export function wrapText(text: string, width: number): string[] {
  const rows = text.split(/\r?\n/).flatMap(line => (line.trim() ? wrapLine(line, width) : ['']))
  const squeezed = rows.filter((row, i) => row !== '' || (rows[i - 1] ?? '') !== '')
  const first = squeezed.findIndex(row => row !== '')
  return first < 0 ? [] : squeezed.slice(first, squeezed.findLastIndex(row => row !== '') + 1)
}

const ellipsize = (row: string, width: number): string => (cells(row) <= width - 1 ? `${row}…` : (fitRuns([{ text: row }], width - 1)[0]?.text ?? '…'))

export type AskView = { rows: string[]; control: 'more' | 'less' | null }

// `width` is what the request block may use, the control's column included. A request that fits `maxRows` rows is shown as it is,
// with no control; a longer one is cut to `maxRows` rows ending in … (the control reads "more"), or shown whole (it reads "less").
export function askView(text: string, width: number, expanded: boolean, maxRows = 2): AskView {
  const flow = text.replace(/\s+/g, ' ').trim()
  const whole = wrapText(flow, width)
  if (whole.length <= maxRows) return { rows: whole, control: null }
  const room = Math.max(8, width - CONTROL_COLS)
  if (expanded) return { rows: wrapText(text, room), control: 'less' }
  const rows = wrapText(flow, room)
  return { rows: [...rows.slice(0, maxRows - 1), ellipsize(rows[maxRows - 1] ?? '', room)], control: 'more' }
}
