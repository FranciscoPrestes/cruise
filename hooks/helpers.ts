import type { Plan, Step } from '../types'

export const DEFAULT_MIN_ASK_CHARS = 25
const MINUTE = 60_000
const HOUR = 60 * MINUTE

// A real request; "go ahead", commands and system notices do not replace the current one.
export function isRealAsk(text: string, minChars: number = DEFAULT_MIN_ASK_CHARS): boolean {
  const t = text.trim()
  return t.length >= minChars && !t.startsWith('/') && !t.startsWith('<')
}

export function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`
}

export function age(ms: number): string {
  if (ms < MINUTE) return 'now'
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min ago`
  return `${Math.floor(ms / HOUR)} h ${Math.round((ms % HOUR) / MINUTE)} min ago`
}

export function planFromTodos(todos: readonly { content: string; activeForm: string; status: Step['status'] }[]): Plan {
  return Object.fromEntries(
    todos.map((t, i) => [String(i), { title: t.status === 'in_progress' ? t.activeForm || t.content : t.content, status: t.status }]),
  )
}

export function planSummary(plan: Plan): string | null {
  const steps = Object.values(plan)
  if (steps.length === 0) return null
  const done = steps.filter(s => s.status === 'completed').length
  if (done === steps.length) return `Plan complete: ${steps.length} of ${steps.length}`
  const current = steps.find(s => s.status === 'in_progress') ?? steps.find(s => s.status === 'pending')
  const n = steps.indexOf(current as Step) + 1
  return `Step ${n} of ${steps.length}: ${current?.title ?? ''}`
}

const LABELS: Readonly<Record<string, [string, string]>> = {
  subagent: ['agent', 'agents'],
  shell: ['command', 'commands'],
  monitor: ['monitor', 'monitors'],
  workflow: ['workflow', 'workflows'],
  schedule: ['schedule', 'schedules'],
}

export function backgroundSummary(types: readonly string[]): string | null {
  if (types.length === 0) return null
  const counts = types.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {})
  return Object.entries(counts)
    .map(([t, n]) => {
      const [one, many] = LABELS[t] ?? [t, t]
      return `${n} ${n === 1 ? one : many}`
    })
    .join(', ')
}
