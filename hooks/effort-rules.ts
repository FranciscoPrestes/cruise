// Pure rules of the effort judge: no engine calls here, so everything is unit-testable.
// The judge prompts and the "short follow-up keeps the effort" idea are adapted from effortless (MIT), see NOTICE.
import type { Effort, EffortState } from '../types'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const CRITERIA: Readonly<Record<Effort, string>> = {
  low: 'a simple, well-bounded request: a quick answer, a lookup, a one-line or single-file edit; nothing to verify',
  medium: 'well-specified work with clear steps: read a few files, change a function and its tests, explain a module',
  high: 'complex reasoning or hard coding: an unknown cause to debug, a design choice, a large refactor or review, a vague ask to explore, costly mistakes',
  xhigh: 'long-horizon agentic work: an investigation or build of 30 minutes or more across many files or systems',
  max: 'the deepest reasoning: a novel or research-level problem where depth of thought, not length, is the bottleneck; rare',
}

// Models measured to keep the prompt cache when the effort changes between requests (see the README).
// The exact Anthropic ids only (optionally dated or `[1m]`), as Claude Code sends them. Ids with a router label never match: through CCR the same
// Anthropic model lost its whole prompt cache when the effort changed, which plain Claude Code does not (see the README), and a router can name
// another provider's model `claude-sonnet-5-5-high`.
const STEERABLE = /^claude-(opus|sonnet|fable)-5(-\d+)?(-\d{8})?(\[1m\])?$/
const CACHE_TTL_GUARD_MS = 4 * 60_000
const REWRITE_MIN_TOKENS = 5000
const FOLLOW_UP_MAX_CHARS = 12
const FOLLOW_UP_MAX_WORDS = 2
// Below this probability for its own answer a judge counts as unsure. Measured on Laya without training: the
// threshold barely matters up to 0.4 and costs accuracy above it (see eval/judge_eval.py).
const UNSURE_BELOW = 0.4

export const isEffort = (value: unknown): value is Effort => EFFORTS.includes(value as Effort)

// The models of a router that are steered too: an opt-in extra for people who run Claude Code through claude-code-router or the like, off by default.
// Each pattern is a glob: `*` is the only wildcard, the match is anchored and case-sensitive. Measured through one CCR gateway: the effort of an OpenAI
// or Google model changes its behaviour, but changing it cost GPT the whole prompt cache and Gemini part of it, and the same Anthropic model
// lost its whole cache too. DeepSeek through OpenRouter showed no effect.
export const DEFAULT_ROUTER = ''

const patternList = (value: unknown): string[] =>
  (typeof value === 'string' ? value : DEFAULT_ROUTER).split(',').map(p => p.trim()).filter(Boolean)

export const routerPatterns = (value: unknown): readonly RegExp[] =>
  patternList(value).map(p => new RegExp(`^${p.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`))

// What the dashboard says is steered: Anthropic always, then the routed families (the label before `(Login)/` or `/`), once each.
export function routedFamilies(value: unknown): string {
  const labels = patternList(value).map(p => (p.split(/ \(Login\)\/|\//)[0] ?? p).trim() || p)
  const routed = [...new Set(labels)]
  return routed.length === 0 ? 'Anthropic' : `Anthropic, ${routed.join(', ')} (via router)`
}

// Only a model that takes an effort setting, and only a family where changing it keeps the cache. Plain Claude Code ids never carry a
// router label, so with or without `routers` they are judged by the Anthropic rule alone.
export const isSteerable = (model: string, appEffort: unknown, routers: readonly RegExp[] = []): appEffort is Effort =>
  isEffort(appEffort) && (STEERABLE.test(model) || routers.some(r => r.test(model)))

// How far the judge may move the effort: `both` up and down from the app's effort, `down` only lower.
export type Steer = 'both' | 'down'
export const DEFAULT_REACH: Effort = 'xhigh'

export const steerFrom = (value: unknown): Steer => (value === 'down' ? 'down' : 'both')
export const reachFrom = (value: unknown): Effort => (isEffort(value) ? value : DEFAULT_REACH)

// The highest level the judge may pick. Going down only: the app's own effort. Going both ways: the higher of the app's
// effort and `reach` (the person's "top level" setting), so a hard prompt can be lifted above a medium default.
export function allowedTop(app: Effort, steer: Steer, reach: Effort): Effort {
  if (steer === 'down') return app
  return EFFORTS.indexOf(reach) > EFFORTS.indexOf(app) ? reach : app
}

// The levels the judge may choose, from low up to `top`.
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

// The band's effort line: the pick, the app's own effort when different, and a pause notice.
export function effortLine(state: EffortState): string | null {
  if (state.paused) return 'Effort steering paused: the prompt cache did not survive a change'
  if (!state.pick) return null
  const ceiling = state.appSeen && state.appSeen !== state.pick ? ` (app: ${state.appSeen})` : ''
  return `Effort ${state.pick}${ceiling}${state.why ? ` · ${state.why}` : ''}`
}

// Made-up examples (none comes from anyone's sessions) that anchor the levels. Keep in step with EXAMPLES in train/levels.py.
const EXAMPLES: readonly (readonly [Effort, string])[] = [
  ['low', 'rename the variable foo to count in utils.ts'],
  ['low', 'what does git rebase do?'],
  ['low', 'muda a cor do botão de salvar para azul'],
  ['medium', 'add a retry with backoff to the upload function and update its tests'],
  ['medium', 'explain how the auth middleware works and where tokens are validated'],
  ['medium', 'cria um endpoint para listar pedidos com paginação'],
  ['high', 'the nightly export corrupts rows when two workers overlap: find the cause and fix it'],
  ['high', 'review this whole repo for security problems and give me a prioritised list'],
  ['high', 'migra o módulo de cobrança de REST para GraphQL sem quebrar os clientes'],
  ['xhigh', 'design and build a multi-tenant permission system across the API, the web app and the mobile app, with a migration plan'],
  ['xhigh', "p99 latency doubled after last week's release across a dozen services and nobody knows why: investigate end to end"],
  ['max', 'prove or refute that this lock-free queue is linearizable, then fix the implementation if it is not'],
  ['max', 'port the entire compiler backend to a new intermediate representation while every existing test keeps passing'],
]

export function judgeSystem(levels: readonly Effort[]): string {
  const list = levels.map(l => `- ${l}: ${CRITERIA[l]}`).join('\n')
  const examples = EXAMPLES.filter(([level]) => levels.includes(level)).map(([level, text]) => `- "${text}" -> ${level}`).join('\n')
  return `You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Effort sets how much the assistant thinks and how many tool calls it makes. At a lower effort it acts with fewer, terser steps and may skip a search or a verification; at a higher one it explores, plans and checks more, and spends more tokens. Pick the lowest effort that will still do the job well, and a higher one when the job is hard or a mistake would be costly. A level too low costs more than the saving.

Levels you may choose:
${list}

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "review the whole repo" or "migrate everything" are big, tool-heavy jobs. A vague or open-ended ask needs more effort than a precise one of the same size.
A short follow-up ("yes", "go", "ok", or the same in any language) continues the current work: keep the current level.
If the message answers a question the assistant just asked, judge the work that answer starts. If it corrects or adds to ongoing work, keep at least the current level.
If the person asks for deep thought ("think hard", "be thorough"), pick at least high (more if the job is bigger); if they ask for a quick answer, pick low.

Examples of the right level (the real messages are different, judge their scope the same way):
${examples}

Reply with JSON only: {"effort":"<level>","sure":0.0-1.0 how sure you are,"why":"at most 6 words, in the user's language","summary":"short description of the user's requested task in their language"}`
}

export function judgeQuestion(text: string, top: Effort, current: Effort | null, afterQuestion: boolean, app?: Effort): string {
  return [
    `Current level: ${current ?? 'none yet'}`,
    ...(app ? [`Level the app uses by default: ${app}`] : []),
    `Highest level allowed: ${top}`,
    `The assistant's last reply ended with a question: ${afterQuestion ? 'yes' : 'no'}`,
    '',
    'Next message:',
    text.slice(0, 2000),
  ].join('\n')
}

// What a Laya head is trained on: train/build_dataset.py writes exactly these two lines for every training row, so
// the text sent at inference matches the text the head learned from.
export const layaState = (text: string, afterQuestion: boolean): string =>
  `last reply asked a question: ${afterQuestion ? 'yes' : 'no'}\nmessage: ${text.slice(0, 2000)}`

export type Verdict = { effort: Effort; sure?: number; why: string; summary?: string; probs?: Readonly<Record<string, number>> }

// Reads {"effort":..., "sure":..., "why":...} out of a reply, or nothing when it holds no allowed level.
// Haiku sometimes closes the object badly (`"why":"...","}`), which JSON.parse rejects: on real prompts that lost about
// one verdict in five. So the fields are read one by one, and a malformed tail does not matter.
export function parseHaiku(text: string, levels: readonly Effort[]): Verdict | undefined {
  const effort = /"effort"\s*:\s*"([a-z]+)"/.exec(text)?.[1]
  if (!isEffort(effort) || !levels.includes(effort)) return undefined
  const sure = /"sure"\s*:\s*([0-9]*\.?[0-9]+)/.exec(text)?.[1]
  const why = /"why"\s*:\s*"([^"]*)/.exec(text)?.[1]
  const summary = /"summary"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text)?.[1]
  let task: string | undefined
  try { if (summary) task = JSON.parse(`"${summary}"`).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120) } catch { /* Ignore malformed summaries. */ }
  return { effort, sure: sure === undefined ? undefined : Number(sure), why: (why ?? '').slice(0, 60), ...(task ? { summary: task } : {}) }
}

// The Jev wire format (also spoken by a Laya server): answers.effort.choice plus a confidence.
export function parseJev(text: string, levels: readonly Effort[]): Verdict | undefined {
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const answers = (json.answers ?? (json.result as Record<string, unknown> | undefined)?.answers) as
      | Record<string, { choice?: unknown; confidence?: number; answer_confidence?: number; probabilities?: Record<string, number> }>
      | undefined
    const choice = answers?.effort?.choice
    if (!isEffort(choice) || !levels.includes(choice)) return undefined
    // A probability, whichever field carries it: `confidence` means different things in Jev and Laya (Laya's is how
    // concentrated the distribution is, so a clear 51% pick reads 0.23 there).
    const sure = answers?.effort?.answer_confidence ?? answers?.effort?.probabilities?.[choice] ?? answers?.effort?.confidence
    const probs = answers?.effort?.probabilities
    return { effort: choice, sure: typeof sure === 'number' ? sure : undefined, why: typeof sure === 'number' ? `${Math.round(sure * 100)}% sure` : '', probs }
  } catch {
    return undefined
  }
}

// How careful the Jev and Laya judges are. They return a probability for every level they were offered. A level that
// is too low costs more than one that is too high, so the pick is not the likeliest level but the lowest one whose
// cumulative probability reaches QUANTILE: at 0.5 it is the median of the judge's belief, higher is more careful.
// 0.5 is where a Laya trained on our own sessions picked as many levels as the labels held; every step up made it ask for
// more effort than the work needed (see the README and train/compare.py).
export const QUANTILE = 0.5

export function quantilePick(probs: Readonly<Record<string, number>>, levels: readonly Effort[], tau: number = QUANTILE): Effort {
  const known = levels.reduce((sum, level) => sum + (probs[level] ?? 0), 0)
  const top = levels[levels.length - 1] ?? 'low'
  if (known <= 0) return top
  let total = 0
  for (const level of levels) {
    total += (probs[level] ?? 0) / known
    if (total >= tau - 1e-9) return level
  }
  return top
}

// A judge that is unsure of its own answer leaves the current level alone.
export const settle = (verdict: Verdict, current: Effort | null): Effort => (current && verdict.sure !== undefined && verdict.sure < UNSURE_BELOW ? current : verdict.effort)

export type Sent = { effort: string; at: number; model?: string; cacheRead?: number }
export type Usage = { input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

const viaRouter = (model: string | undefined): boolean => model !== undefined && model.includes('/')

// The request that followed an effort change wrote most of the prompt afresh: the cache did not survive the change.
// A request more than a few minutes after the last one proves nothing (the cache may simply have expired).
// Through a router (a model id with a `/`) a change of model rewrites the cache by itself, so the guard does not judge that request.
// Plain Claude Code reports a write as `cache_creation_input_tokens`. The CCR gateway never does: it reports what it read as
// `cache_read_input_tokens` and everything else as `input_tokens`, so through a router the uncached input is the write, and only a provider
// that showed a cache before (a read on the previous request) can trip the guard: one that never reports a cache never does.
export function cacheRewritten(prev: Sent | null, now: Sent, usage: Usage): boolean {
  if (!prev || prev.effort === now.effort || now.at - prev.at > CACHE_TTL_GUARD_MS) return false
  if (prev.model !== now.model && prev.model !== undefined && now.model !== undefined && (viaRouter(prev.model) || viaRouter(now.model))) return false
  const read = usage.cache_read_input_tokens ?? 0
  const wrote = usage.cache_creation_input_tokens ?? 0
  if (viaRouter(now.model)) {
    const fresh = Math.max(wrote, usage.input_tokens ?? 0)
    return (prev.cacheRead ?? 0) > 0 && fresh >= REWRITE_MIN_TOKENS && fresh > read
  }
  return wrote >= REWRITE_MIN_TOKENS && wrote > read
}

// Measured under `ccr code`: a mod's `$.model.complete` call for Haiku (bare or with the router label) came back from the Anthropic login with a
// 429 and CCR's failure fallback answered it with gpt-6.1-sol; a call naming another router model (a Gemini, GPT) was served by that model.
// The result does not say which model answered, so behind a router the Haiku judge is not used unless the person names a judge model that
// their router serves (their choice of where the next message goes).
export const routedJudgeBlocked = (judge: { mode: string; model: string }, model: string): boolean => judge.mode === 'haiku' && judge.model === '' && viaRouter(model)

// Why a model is left alone, in words for the dashboard. Only called for a model that is being left alone.
export function idleReason(model: string, judge: { mode: string; model: string }, routersText: unknown): string {
  const patterns = routerPatterns(routersText)
  if (!viaRouter(model)) return 'Cruise steers Anthropic Opus, Sonnet and Fable 5'
  if (isSteerable(model, 'high', patterns)) {
    return routedJudgeBlocked(judge, model)
      ? 'through a router the Haiku judge is not used: set judgeModel to a model your router serves, or use the jev or laya judge'
      : `Cruise steers ${routedFamilies(routersText)}`
  }
  if (/^Anthropic \(Login\)\/claude-(opus|sonnet|fable)-5/.test(model)) return 'through a router the same Anthropic model lost its prompt cache when the effort changed (measured), so it is left alone; name it in routerModels to steer it anyway'
  return patterns.length === 0 ? 'routed models are off by default: name one in routerModels to steer it' : `it is not in routerModels (Cruise steers ${routedFamilies(routersText)})`
}
