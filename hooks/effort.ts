// Effort steering: a small judge picks the reasoning effort for each prompt, and the pick is applied to the
// model requests of that work. It moves up or down from the effort the person set in the app (or only down, if
// they ask), and it stops by itself if a change ever makes the prompt cache be rewritten.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions } from 'claude-code'

import type { Effort, EffortState } from '../types'
import {
  cacheRewritten,
  HTTP_TOP,
  clampTo,
  cautiousPick,
  criteriaFor,
  effortLine,
  endsOnQuestion,
  isFollowUp,
  isSteerable,
  allowedTop,
  judgeQuestion,
  judgeSystem,
  layaState,
  levelsUpTo,
  liftHighest,
  parseHaiku,
  parseJev,
  reachFrom,
  settle,
  steerFrom,
} from './effort-rules'
import type { Steer, Usage, Verdict } from './effort-rules'

export type JudgeMode = 'off' | 'haiku' | 'jev' | 'laya'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const LAYA_URL = 'http://127.0.0.1:18787/v1/systemone'
// Haiku 5.5 by name: a Claude Code build that predates it maps the plain "haiku" alias to Haiku 4.5, at ten times the price.
const HAIKU_MODEL = 'claude-haiku-5-5'
const HAIKU_TIMEOUT_MS = 6000
const HTTP_TIMEOUT_MS = 3000
const JUDGE_MAX_TOKENS = 160

const INITIAL: EffortState = {
  pending: null,
  pick: null,
  paused: null,
  appSeen: null,
  judged: 0,
  kept: 0,
  failed: 0,
  judgeTokens: 0,
  steered: 0,
  picks: {},
  lastSent: null,
  why: '',
}

export const effortState = atom({ plugin: 'cruise', key: 'effort' } as const, INITIAL)

// On with the Haiku judge unless the person chose otherwise (the setting's own default is `haiku` too).
export function judgeMode(options: PluginOptions): JudgeMode {
  const mode = options.effort
  return mode === 'off' || mode === 'jev' || mode === 'laya' ? mode : 'haiku'
}

export type Judge = { mode: JudgeMode; url: string; key: string; model: string; steer: Steer; reach: Effort }

export function judgeFrom(options: PluginOptions): Judge {
  const mode = judgeMode(options)
  const url = typeof options.judgeUrl === 'string' && options.judgeUrl.trim() ? options.judgeUrl.trim() : mode === 'laya' ? LAYA_URL : JEV_URL
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  return { mode, url, key: text(options.judgeKey), model: text(options.judgeModel), steer: steerFrom(options.steer), reach: reachFrom(options.topLevel) }
}

// A prompt the person typed is judged on the next main-loop request. Commands and system notes are not prompts.
export async function notePrompt($: EngineInterface, e: { text: string; command?: unknown; isMeta?: true }): Promise<void> {
  if (e.command || e.isMeta || !e.text.trim()) return
  const afterQuestion = await lastReplyAsked($)
  await update($, effortState, s => ({ ...s, pending: { text: e.text, afterQuestion } }))
}

async function lastReplyAsked($: EngineInterface): Promise<boolean> {
  const messages = await $.session.messages().catch(() => [])
  const reply = [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())?.text ?? ''
  return endsOnQuestion(reply)
}

type Judged = { verdict?: Verdict; tokens: number }

async function askHaiku($: EngineInterface, judge: Judge, text: string, top: Effort, app: Effort, current: Effort | null, afterQuestion: boolean): Promise<Judged> {
  const levels = levelsUpTo(top)
  const r = await $.model.complete({
    model: judge.model || HAIKU_MODEL,
    system: judgeSystem(levels),
    prompt: judgeQuestion(text, top, current, afterQuestion, app),
    maxTokens: JUDGE_MAX_TOKENS,
    effort: 'low',
    timeoutMs: HAIKU_TIMEOUT_MS,
  })
  if (!r.isAnswered) return { tokens: 0 }
  return { verdict: parseHaiku(r.text, levels), tokens: r.usage.input_tokens + r.usage.output_tokens }
}

async function askHttp($: EngineInterface, judge: Judge, text: string, top: Effort, current: Effort | null, afterQuestion: boolean): Promise<Judged> {
  const levels = levelsUpTo(clampTo(top, HTTP_TOP))
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (judge.key) headers.authorization = `Bearer ${judge.key}`
  // Only the next message and two small facts leave the machine: never the conversation.
  const body = JSON.stringify({
    model: judge.model || (judge.mode === 'laya' ? 'jev-1' : 'jev-latest'),
    state:
      judge.mode === 'laya'
        ? layaState(text, afterQuestion)
        : {
            task: 'Choose the lowest reasoning effort an agentic assistant needs for the next user message. Judge scope and amount of work. A short follow-up keeps the current effort.',
            current_effort: current,
            last_reply_ended_with_question: afterQuestion,
            next_message: text.slice(0, 2000),
          },
    questions: { effort: { type: 'choice', instructions: 'Which effort fits the next message?', criteria: criteriaFor(levels) } },
  })
  const res = await Promise.race([
    $.http.fetch(judge.url, { method: 'POST', headers, body }),
    $.clock.sleep(HTTP_TIMEOUT_MS).then(() => {
      throw new Error('judge timeout')
    }),
  ])
  if (!res.ok) return { tokens: 0 }
  let tokens = 0
  try {
    const usage = (JSON.parse(res.text) as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
    tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
  } catch {
    // No usage in the reply: counted as 0.
  }
  const parsed = parseJev(res.text, levels)
  if (!parsed) return { tokens }
  // With the full distribution, decide cautiously (and the pick is final: no separate "unsure" gate). Without it, the answer's own choice.
  const effort = parsed.probs ? cautiousPick(parsed.probs, levels) : parsed.effort
  return { verdict: { effort: liftHighest(effort, top), why: parsed.why, sure: parsed.probs ? undefined : parsed.sure }, tokens }
}

async function ask($: EngineInterface, judge: Judge, text: string, top: Effort, app: Effort, current: Effort | null, afterQuestion: boolean): Promise<Judged> {
  try {
    return judge.mode === 'haiku' ? await askHaiku($, judge, text, top, app, current, afterQuestion) : await askHttp($, judge, text, top, current, afterQuestion)
  } catch {
    // A judge that fails or is slow never holds the prompt: the request goes out at the app's effort.
    return { tokens: 0 }
  }
}

// Settles the pending prompt into a pick (once: it is cleared before the judge is asked): a short follow-up keeps the pick, anything else asks the judge.
async function decide($: EngineInterface, judge: Judge, top: Effort, app: Effort): Promise<void> {
  const state = await read($, effortState)
  const pending = state.pending
  if (!pending) return
  await update($, effortState, s => ({ ...s, pending: null }))

  if (state.pick && isFollowUp(pending.text) && !pending.afterQuestion) {
    await update($, effortState, s => ({ ...s, kept: s.kept + 1 }))
    return
  }
  const got = await ask($, judge, pending.text, top, app, state.pick, pending.afterQuestion)
  if (!got.verdict) {
    await update($, effortState, s => ({ ...s, failed: s.failed + 1, judgeTokens: s.judgeTokens + got.tokens }))
    return
  }
  const verdict = got.verdict
  const effort = settle(verdict, state.pick)
  await update($, effortState, s => ({
    ...s,
    pick: effort,
    why: verdict.why,
    judged: s.judged + 1,
    judgeTokens: s.judgeTokens + got.tokens,
    picks: { ...s.picks, [effort]: (s.picks[effort] ?? 0) + 1 },
  }))
}

// The effort to send on this model request, or nothing to let the app's own effort go out unchanged.
export async function effortFor($: EngineInterface, e: { model: string; effort?: unknown }, judge: Judge): Promise<Effort | undefined> {
  if (!isSteerable(e.model, e.effort)) return undefined
  const app = e.effort
  const before = await read($, effortState)
  if (before.paused) return undefined
  if (before.appSeen !== app) await update($, effortState, s => ({ ...s, appSeen: app }))
  const top = allowedTop(app, judge.steer, judge.reach)
  await decide($, judge, top, app)
  const { pick } = await read($, effortState)
  if (!pick) return undefined
  const effort = clampTo(pick, top)
  return effort === app ? undefined : effort
}

// After the request: the cache guard and the counters. `sent` is the effort that went out (the app's own if unchanged).
export async function afterRequest(
  $: EngineInterface,
  e: { model: string; effort?: unknown },
  sent: Effort | undefined,
  usage: Usage | undefined,
): Promise<void> {
  if (!isSteerable(e.model, e.effort)) return
  const now = { effort: sent ?? String(e.effort), at: await $.clock.now() }
  const prev = (await read($, effortState)).lastSent
  const broke = usage !== undefined && cacheRewritten(prev, now, usage)
  await update($, effortState, s => ({
    ...s,
    lastSent: now,
    steered: s.steered + (sent ? 1 : 0),
    paused: broke ? 'the prompt cache was rewritten after an effort change' : s.paused,
  }))
  if (broke) $.ui.toast('Cruise: the prompt cache was rewritten after an effort change, so effort steering is off for this session.')
}

// The band's effort line (the band lives in another file and cannot read this file's state itself).
export async function effortBand($: EngineInterface): Promise<string | null> {
  return effortLine(await read($, effortState))
}

// The effort part of the /cruise panel.
export async function report($: EngineInterface, options: PluginOptions): Promise<string> {
  const judge = judgeFrom(options)
  const s = await read($, effortState)
  if (judge.mode === 'off') return 'Effort steering: off (setting "effort")'
  const picks = Object.entries(s.picks).map(([k, n]) => `${k} ${n}`).join(', ') || 'none yet'
  const way = judge.steer === 'down' ? 'only lower than your app\'s effort' : `up or down from your app's effort (up to ${judge.reach})`
  return [
    `Effort steering: judge ${judge.mode}${judge.model ? ` (${judge.model})` : ''}, ${way}${s.paused ? `  ·  PAUSED: ${s.paused}` : ''}`,
    `  App effort: ${s.appSeen ?? 'not seen yet'}  ·  current pick: ${s.pick ?? 'none yet'}${s.why ? ` (${s.why})` : ''}`,
    `  Verdicts: ${s.judged}  ·  follow-ups that kept the pick: ${s.kept}  ·  judge failures: ${s.failed}`,
    `  Picked: ${picks}`,
    `  Requests sent at a different effort than the app's: ${s.steered}`,
    `  Judge tokens: ${s.judgeTokens}${judge.mode === 'haiku' ? ' (billed to your Claude account)' : ''}`,
  ].join('\n')
}
