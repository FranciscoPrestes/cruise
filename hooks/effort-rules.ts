// Pure rules of the effort judge: no engine calls here, so everything is unit-testable.
// The judge prompts and the "short follow-up keeps the effort" idea are adapted from effortless (MIT), see NOTICE.
import type { Effort, EffortState } from '../types'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const CRITERIA: Readonly<Record<Effort, string>> = {
  low: 'quick answer, no tools, no planning',
  medium: 'normal work: a few tool calls or edits',
  high: 'hard or large multi-step job: many tool calls, costly mistakes',
  xhigh: 'very hard: a long investigation',
  max: 'the hardest research-level work',
}

// Models measured to keep the prompt cache when the effort changes between requests (see the README).
const STEERABLE = /^claude-(opus|sonnet|fable)-5-/
const CACHE_TTL_GUARD_MS = 4 * 60_000
const REWRITE_MIN_TOKENS = 5000
const FOLLOW_UP_MAX_CHARS = 12
const FOLLOW_UP_MAX_WORDS = 2
const UNSURE_BELOW = 0.5

export const isEffort = (value: unknown): value is Effort => EFFORTS.includes(value as Effort)

// Only a model that takes an effort setting, and only a family where changing it keeps the cache.
export const isSteerable = (model: string, appEffort: unknown): appEffort is Effort => isEffort(appEffort) && STEERABLE.test(model)

// The levels the judge may choose: from low up to the effort the person set in the app, never above it.
// A level the app itself uses is one the model accepts, and Cruise can then never cost more than the person's own choice.
export const levelsUpTo = (top: Effort): readonly Effort[] => EFFORTS.slice(0, EFFORTS.indexOf(top) + 1)

export const clampTo = (effort: Effort, top: Effort): Effort => (EFFORTS.indexOf(effort) > EFFORTS.indexOf(top) ? top : effort)

// "yes", "go", "ok": continues the work, so it keeps the effort and asks no judge.
export function isFollowUp(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= FOLLOW_UP_MAX_CHARS && t.split(/\s+/).length <= FOLLOW_UP_MAX_WORDS
}

// A short reply after a question answers it, and the answer can start a small or a big job: it goes to the judge.
export const endsOnQuestion = (reply: string): boolean => reply.trim().slice(-400).includes('?')

export const criteriaFor = (levels: readonly Effort[]): Record<string, string> => Object.fromEntries(levels.map(l => [l, CRITERIA[l]]))

// The band's effort line: the pick, the app's ceiling when different, and a pause notice.
export function effortLine(state: EffortState): string | null {
  if (state.paused) return 'Effort steering paused: the prompt cache did not survive a change'
  if (!state.pick) return null
  const ceiling = state.appSeen && state.appSeen !== state.pick ? ` (app: ${state.appSeen})` : ''
  return `Effort ${state.pick}${ceiling}${state.why ? ` · ${state.why}` : ''}`
}

export function judgeSystem(levels: readonly Effort[]): string {
  const list = levels.map(l => `- ${l}: ${CRITERIA[l]}`).join('\n')
  return `You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the lowest effort that will still do the job well; a wrong answer costs more than the saving.

Levels you may choose:
${list}

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "review the whole repo" or "migrate everything" are big, tool-heavy jobs.
A short follow-up ("yes", "go", "ok", or the same in any language) continues the current work: keep the current level.
If the message answers a question the assistant just asked, judge the work that answer starts. If it corrects or adds to ongoing work, keep at least the current level.
If the person asks for deep thought ("think hard", "be thorough"), pick the highest level you may choose; if they ask for a quick answer, pick low.

Reply with JSON only: {"effort":"<level>","sure":0.0-1.0 how sure you are,"why":"at most 6 words, in the user's language"}`
}

export function judgeQuestion(text: string, top: Effort, current: Effort | null, afterQuestion: boolean): string {
  return [
    `Current level: ${current ?? 'none yet'}`,
    `Highest level allowed: ${top}`,
    `The assistant's last reply ended with a question: ${afterQuestion ? 'yes' : 'no'}`,
    '',
    'Next message:',
    text.slice(0, 2000),
  ].join('\n')
}

export type Verdict = { effort: Effort; sure?: number; why: string }

// Reads {"effort":..., "sure":..., "why":...} out of a reply, or nothing when it holds no allowed level.
export function parseHaiku(text: string, levels: readonly Effort[]): Verdict | undefined {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return undefined
  try {
    const out = JSON.parse(json) as { effort?: unknown; sure?: unknown; why?: unknown }
    if (!isEffort(out.effort) || !levels.includes(out.effort)) return undefined
    return { effort: out.effort, sure: typeof out.sure === 'number' ? out.sure : undefined, why: typeof out.why === 'string' ? out.why.slice(0, 60) : '' }
  } catch {
    return undefined
  }
}

// The Jev wire format (also spoken by a Laya server): answers.effort.choice plus a confidence.
export function parseJev(text: string, levels: readonly Effort[]): Verdict | undefined {
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const answers = (json.answers ?? (json.result as Record<string, unknown> | undefined)?.answers) as
      | Record<string, { choice?: unknown; confidence?: number; probabilities?: Record<string, number> }>
      | undefined
    const choice = answers?.effort?.choice
    if (!isEffort(choice) || !levels.includes(choice)) return undefined
    const sure = answers?.effort?.confidence ?? answers?.effort?.probabilities?.[choice]
    return { effort: choice, sure: typeof sure === 'number' ? sure : undefined, why: typeof sure === 'number' ? `${Math.round(sure * 100)}% sure` : '' }
  } catch {
    return undefined
  }
}

// A judge that is unsure of its own answer leaves the current level alone.
export const settle = (verdict: Verdict, current: Effort | null): Effort => (current && verdict.sure !== undefined && verdict.sure < UNSURE_BELOW ? current : verdict.effort)

export type Sent = { effort: string; at: number }
export type Usage = { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

// The request that followed an effort change wrote most of the prompt afresh: the cache did not survive the change.
// A request more than a few minutes after the last one proves nothing (the cache may simply have expired).
export function cacheRewritten(prev: Sent | null, now: Sent, usage: Usage): boolean {
  if (!prev || prev.effort === now.effort || now.at - prev.at > CACHE_TTL_GUARD_MS) return false
  const read = usage.cache_read_input_tokens ?? 0
  const wrote = usage.cache_creation_input_tokens ?? 0
  return wrote >= REWRITE_MIN_TOKENS && wrote > read
}
