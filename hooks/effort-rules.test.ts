import { expect, test } from 'claude-code/testing'

import {
  cacheRewritten,
  idleReason,
  clampTo,
  effortLine,
  endsOnQuestion,
  isFollowUp,
  DEFAULT_ROUTER,
  isSteerable,
  judgeSystem,
  routedFamilies,
  routerPatterns,
  levelsUpTo,
  parseHaiku,
  parseJev,
  quantilePick,
  settle,
} from './effort-rules'
import type { EffortState } from '../types'

test('only models measured to keep the cache are steered, and only when they take an effort', () => {
  expect(isSteerable('claude-opus-5-5', 'high')).toBe(true)
  expect(isSteerable('claude-sonnet-5-5', 'medium')).toBe(true)
  expect(isSteerable('claude-fable-5-1', 'xhigh')).toBe(true)
  expect(isSteerable('claude-haiku-5-5', undefined)).toBe(false)
  expect(isSteerable('claude-opus-4-1', 'high')).toBe(false)
  expect(isSteerable('claude-opus-5-5', undefined)).toBe(false)
  expect(isSteerable('claude-sonnet-5-5[1m]', 'high')).toBe(true)
  expect(isSteerable('claude-sonnet-5-5-high', 'high')).toBe(false)
  expect(isSteerable('gpt-6.1-sol', 'high')).toBe(false)
  expect(isSteerable('gemini-4-argon-high', 'high')).toBe(false)
  expect(isSteerable('claude-opus-5-5', 12000)).toBe(false)
})

// Plain Claude Code: every id it can produce behaves exactly as before the router extra existed, whatever `routerModels` says.
// What a person who opts in to routed models might write; nothing routed is steered unless it is named.
const EXAMPLE = 'OpenAI (Login)/gpt-*,Google (Login)/gemini-*,Google (Login)/claude-sonnet-5-5-high'

const PLAIN = [
  ['claude-opus-5-5', 'high', true],
  ['claude-sonnet-5-5', 'medium', true],
  ['claude-fable-5-1', 'xhigh', true],
  ['claude-opus-5-5-20260301', 'low', true],
  ['claude-sonnet-5-5[1m]', 'high', true],
  ['claude-haiku-5-5', undefined, false],
  ['claude-haiku-5-5', 'high', false],
  ['claude-opus-4-1', 'high', false],
  ['claude-opus-5-5', undefined, false],
  ['claude-opus-5-5', 12000, false],
  ['claude-sonnet-5-5-high', 'high', false],
  ['gpt-6.1-sol', 'high', false],
  ['gemini-4-argon-high', 'high', false],
] as const

for (const [label, routers] of [
  ['no router patterns', undefined],
  ['the default router setting (empty)', routerPatterns(DEFAULT_ROUTER)],
  ['the example opt-in patterns', routerPatterns(EXAMPLE)],
  ['an empty router setting', routerPatterns('')],
  ['an unrelated custom pattern', routerPatterns('my-model-*')],
] as const) {
  test(`plain Claude Code ids behave as before with ${label}`, () => {
    for (const [model, effort, steerable] of PLAIN) expect(isSteerable(model, effort, routers)).toBe(steerable)
  })
}

// Measured through CCR on the same Anthropic model: an effort change lost the whole prompt cache (and not in plain Claude Code), so ids with a
// router label are not steered by default, Anthropic's included.
test('a router label never makes a model steerable by itself, Anthropic ids included; only a pattern the person writes does', () => {
  for (const model of ['Anthropic (Login)/claude-sonnet-5-5[1m]', 'Anthropic (Login)/claude-opus-5-5', 'Anthropic (Login)/claude-fable-5-1-20260301', 'Google (Login)/claude-sonnet-5-5-high', 'OpenAI (Login)/gpt-6.1-sol']) {
    expect(isSteerable(model, 'high')).toBe(false)
    expect(isSteerable(model, 'high', routerPatterns(DEFAULT_ROUTER))).toBe(false)
  }
  const anthropic = routerPatterns('Anthropic (Login)/claude-*')
  expect(isSteerable('Anthropic (Login)/claude-sonnet-5-5[1m]', 'high', anthropic)).toBe(true)
  expect(isSteerable('Anthropic (Login)/claude-sonnet-5-5[1m]', undefined, anthropic)).toBe(false)
  expect(isSteerable('claude-sonnet-5-5-high', 'high', anthropic)).toBe(false)
  expect(isSteerable('Google (Login)/claude-sonnet-5-5', 'high', anthropic)).toBe(false)
})

test('router patterns: comma-separated globs with * as the only wildcard, anchored and case-sensitive', () => {
  const routed = routerPatterns(EXAMPLE)
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol', 'medium', routed)).toBe(true)
  expect(isSteerable('Google (Login)/gemini-3.8-flash-high', 'low', routed)).toBe(true)
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol', undefined, routed)).toBe(false)
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol', 'medium')).toBe(false)
  expect(isSteerable('OpenRouter/~deepseek/deepseek-pro-latest', 'xhigh', routed)).toBe(false)
  expect(isSteerable('gpt-6.1-sol', 'medium', routed)).toBe(false)
  expect(isSteerable('openai (login)/gpt-6.1-sol', 'medium', routed)).toBe(false)
  expect(isSteerable('xOpenAI (Login)/gpt-6.1-sol', 'medium', routed)).toBe(false)
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol-extra', 'medium', routerPatterns('OpenAI (Login)/gpt-6.1-sol'))).toBe(false)
  expect(isSteerable('OpenAI (Login)/o3', 'medium', routed)).toBe(false)
  // Regex characters in a pattern are plain text.
  const dots = routerPatterns('X (Login)/gpt-5.6')
  expect(isSteerable('X (Login)/gpt-5.6', 'low', dots)).toBe(true)
  expect(isSteerable('X (Login)/gpt-5x6', 'low', dots)).toBe(false)
  // A person adds DeepSeek by naming it; spaces around commas and empty items are ignored.
  const more = routerPatterns(' OpenAI (Login)/gpt-* , ,OpenRouter/~deepseek/* ')
  expect(isSteerable('OpenRouter/~deepseek/deepseek-pro-latest', 'high', more)).toBe(true)
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol', 'high', more)).toBe(true)
})

test('an opt-in pattern can name the Claude model that Google serves by its exact id; the bare id stays out', () => {
  const routed = routerPatterns(EXAMPLE)
  expect(isSteerable('Google (Login)/claude-sonnet-5-5-high', 'high', routed)).toBe(true)
  expect(isSteerable('Google (Login)/claude-opus-5-5-high', 'high', routed)).toBe(false)
  expect(isSteerable('Google (Login)/claude-sonnet-5-5', 'high', routed)).toBe(false)
  expect(isSteerable('claude-sonnet-5-5-high', 'high', routed)).toBe(false)
  expect(isSteerable('Google (Login)/claude-sonnet-5-5-high', 'high')).toBe(false)
  expect(isSteerable('xGoogle (Login)/claude-sonnet-5-5-high', 'high', routed)).toBe(false)
})

test('the router setting is off by default: empty, missing or not a string steers nothing routed', () => {
  expect(DEFAULT_ROUTER).toBe('')
  expect(routerPatterns('')).toEqual([])
  expect(routerPatterns('  , ')).toEqual([])
  expect(routerPatterns(undefined)).toEqual([])
  expect(routerPatterns(42)).toEqual([])
  expect(isSteerable('OpenAI (Login)/gpt-6.1-sol', 'high', routerPatterns(''))).toBe(false)
})

test('the families steered are named for the dashboard', () => {
  expect(routedFamilies(EXAMPLE)).toBe('Anthropic, OpenAI, Google (via router)')
  expect(routedFamilies(DEFAULT_ROUTER)).toBe('Anthropic')
  expect(routedFamilies('')).toBe('Anthropic')
  expect(routedFamilies(undefined)).toBe('Anthropic')
  expect(routedFamilies('OpenAI (Login)/gpt-*,OpenAI (Login)/o*,OpenRouter/~deepseek/*')).toBe('Anthropic, OpenAI, OpenRouter (via router)')
  expect(routedFamilies('my-model-*')).toBe('Anthropic, my-model-* (via router)')
})

test('the judge may only choose up to the effort the app set', () => {
  expect(levelsUpTo('high')).toEqual(['low', 'medium', 'high'])
  expect(levelsUpTo('low')).toEqual(['low'])
  expect(clampTo('max', 'high')).toBe('high')
  expect(clampTo('low', 'high')).toBe('low')
})

test('short follow-ups are recognised, long ones are not', () => {
  expect(isFollowUp('ok')).toBe(true)
  expect(isFollowUp('go ahead')).toBe(true)
  expect(isFollowUp('fix the login bug')).toBe(false)
  expect(isFollowUp('   ')).toBe(false)
})

test('a reply that ended on a question is detected', () => {
  expect(endsOnQuestion('Done. Should I archive it?')).toBe(true)
  expect(endsOnQuestion('Done.')).toBe(false)
})

test('a Haiku reply is read, even inside prose', () => {
  const levels = levelsUpTo('high')
  expect(parseHaiku('{"effort":"low","sure":0.9,"why":"tiny edit"}', levels)).toEqual({ effort: 'low', sure: 0.9, why: 'tiny edit' })
  expect(parseHaiku('Sure! {"effort":"medium","why":"x"} hope that helps', levels)?.effort).toBe('medium')
})

test('a Haiku verdict can include a short task summary', () => {
  expect(parseHaiku('{"effort":"xhigh","sure":0.9,"why":"long task","summary":"Migrar API e testes"}', levelsUpTo('max'))?.summary).toBe('Migrar API e testes')
})

test('a reply Haiku closed badly is still read (it lost one verdict in five on real prompts)', () => {
  const levels = levelsUpTo('high')
  expect(parseHaiku('{"effort":"medium","sure":0.6,"why":"Scoped git log review, several tool calls","}', levels)).toEqual({
    effort: 'medium',
    sure: 0.6,
    why: 'Scoped git log review, several tool calls',
  })
  expect(parseHaiku('```json\n{"effort":"low","sure":.8}\n```', levels)?.effort).toBe('low')
})

test('a level above the ceiling or garbage is refused', () => {
  const levels = levelsUpTo('high')
  expect(parseHaiku('{"effort":"xhigh"}', levels)).toBe(undefined)
  expect(parseHaiku('no json here', levels)).toBe(undefined)
  expect(parseHaiku('{"effort":', levels)).toBe(undefined)
})

test('a Jev / Laya answer is read from answers.effort', () => {
  const levels = levelsUpTo('high')
  const body = JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.8 } } })
  expect(parseJev(body, levels)).toEqual({ effort: 'low', sure: 0.8, why: '80% sure' })
  expect(parseJev(JSON.stringify({ answers: { effort: { choice: 'max' } } }), levels)).toBe(undefined)
  expect(parseJev('<html>', levels)).toBe(undefined)
})

test('Laya\'s probability is used, not its concentration score', () => {
  const levels = levelsUpTo('high')
  const body = JSON.stringify({ answers: { effort: { choice: 'low', confidence: 0.23, answer_confidence: 0.51, probabilities: { low: 0.51, medium: 0.45, high: 0.04 } } } })
  expect(parseJev(body, levels)?.sure).toBe(0.51)
})

test('an unsure judge leaves the current effort alone', () => {
  expect(settle({ effort: 'low', sure: 0.3, why: '' }, 'high')).toBe('high')
  expect(settle({ effort: 'low', sure: 0.9, why: '' }, 'high')).toBe('low')
  expect(settle({ effort: 'low', sure: 0.3, why: '' }, null)).toBe('low')
})

test('the cache guard trips only when an effort change was followed by a rewrite', () => {
  const prev = { effort: 'low', at: 0 }
  const rewrite = { cache_read_input_tokens: 0, cache_creation_input_tokens: 40_000 }
  const healthy = { cache_read_input_tokens: 45_000, cache_creation_input_tokens: 600 }
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, rewrite)).toBe(true)
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, healthy)).toBe(false)
  expect(cacheRewritten(prev, { effort: 'low', at: 60_000 }, rewrite)).toBe(false)
  expect(cacheRewritten(null, { effort: 'high', at: 60_000 }, rewrite)).toBe(false)
  expect(cacheRewritten(prev, { effort: 'high', at: 10 * 60_000 }, rewrite)).toBe(false)
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, { cache_creation_input_tokens: 800 })).toBe(false)
})

test('the cache guard stays harmless when a provider reports no cache numbers', () => {
  const prev = { effort: 'low', at: 0 }
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, {})).toBe(false)
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(false)
  expect(cacheRewritten(prev, { effort: 'high', at: 60_000 }, { input_tokens: 40_000, output_tokens: 10 } as never)).toBe(false)
})

test('a change of model through a router is not mistaken for a broken cache; in plain Claude Code the guard is as before', () => {
  const rewrite = { cache_read_input_tokens: 0, cache_creation_input_tokens: 40_000 }
  const gpt = { effort: 'low', at: 0, model: 'OpenAI (Login)/gpt-6.1-sol', cacheRead: 23_040 }
  const gemini = { effort: 'high', at: 60_000, model: 'Google (Login)/gemini-3.8-flash-high' }
  expect(cacheRewritten(gpt, gemini, rewrite)).toBe(false)
  expect(cacheRewritten({ effort: 'low', at: 0, model: 'claude-opus-5-5' }, { effort: 'high', at: 60_000, model: 'Anthropic (Login)/claude-opus-5-5' }, rewrite)).toBe(false)
  // Plain ids, with or without the model recorded: exactly the old behaviour, even across a model switch.
  expect(cacheRewritten({ effort: 'low', at: 0, model: 'claude-opus-5-5' }, { effort: 'high', at: 60_000, model: 'claude-sonnet-5-5' }, rewrite)).toBe(true)
  expect(cacheRewritten({ effort: 'low', at: 0 }, { effort: 'high', at: 60_000 }, rewrite)).toBe(true)
})

// Measured through the CCR gateway: it reports `cache_read_input_tokens` but never `cache_creation_input_tokens`; what was not read
// from the cache is in `input_tokens`. GPT lost the whole cache on an effort change (23,040 read, then 0 read and 23,485 uncached);
// Gemini lost part of it (23,166 read, then 16,080 read and 9,140 uncached).
test('through a router the guard reads the uncached input, and only where the provider has shown that it reports a cache', () => {
  const gptBefore = { effort: 'xhigh', at: 0, model: 'OpenAI (Login)/gpt-6.1-sol', cacheRead: 23_040 }
  const gptNow = { effort: 'low', at: 60_000, model: 'OpenAI (Login)/gpt-6.1-sol' }
  expect(cacheRewritten(gptBefore, gptNow, { input_tokens: 23_485, cache_read_input_tokens: 0 })).toBe(true)
  expect(cacheRewritten(gptBefore, gptNow, { input_tokens: 460, cache_read_input_tokens: 23_040 })).toBe(false)
  const geminiBefore = { effort: 'xhigh', at: 0, model: 'Google (Login)/gemini-3.8-flash-high', cacheRead: 23_166 }
  const geminiNow = { effort: 'low', at: 60_000, model: 'Google (Login)/gemini-3.8-flash-high' }
  expect(cacheRewritten(geminiBefore, geminiNow, { input_tokens: 9_140, cache_read_input_tokens: 16_080 })).toBe(false)
  // A provider that never reports a cache (read 0 before as well) can never trip the guard, however much input it counts.
  expect(cacheRewritten({ ...gptBefore, cacheRead: 0 }, gptNow, { input_tokens: 40_000, cache_read_input_tokens: 0 })).toBe(false)
  expect(cacheRewritten({ ...gptBefore, cacheRead: undefined }, gptNow, { input_tokens: 40_000 })).toBe(false)
  expect(cacheRewritten(gptBefore, gptNow, {})).toBe(false)
  // The Anthropic label through a router is read the way the gateway reports, too.
  expect(cacheRewritten({ ...gptBefore, model: 'Anthropic (Login)/claude-opus-5-5' }, { ...gptNow, model: 'Anthropic (Login)/claude-opus-5-5' }, { input_tokens: 30_000, cache_read_input_tokens: 0 })).toBe(true)
  // Plain Claude Code ids ignore all of this: only cache_creation counts, as before.
  const plain = { effort: 'low', at: 0, model: 'claude-opus-5-5', cacheRead: 45_000 }
  expect(cacheRewritten(plain, { effort: 'high', at: 60_000, model: 'claude-opus-5-5' }, { input_tokens: 40_000, cache_read_input_tokens: 0 })).toBe(false)
  expect(cacheRewritten(plain, { effort: 'high', at: 60_000, model: 'claude-opus-5-5' }, { cache_creation_input_tokens: 40_000, cache_read_input_tokens: 0 })).toBe(true)
})

test('the band line names the pick, the ceiling and a pause', () => {
  const base: EffortState = {
    pending: null, pick: null, paused: null, appSeen: 'high', judged: 0, kept: 0, failed: 0,
    judgeTokens: 0, steered: 0, picks: {}, lastSent: null, why: '',
  }
  expect(effortLine(base)).toBe(null)
  expect(effortLine({ ...base, pick: 'low', why: 'tiny edit' })).toBe('Effort low (app: high) · tiny edit')
  expect(effortLine({ ...base, pick: 'high' })).toBe('Effort high')
  expect(effortLine({ ...base, paused: 'x' })).toContain('paused')
})

test('the quantile pick is the lowest level whose cumulative probability reaches tau', () => {
  const all = levelsUpTo('max')
  expect(quantilePick({ low: 0.8, medium: 0.15, high: 0.05 }, all, 0.7)).toBe('low')
  expect(quantilePick({ low: 0.5, medium: 0.4, high: 0.1 }, all, 0.7)).toBe('medium')
  expect(quantilePick({ low: 0.5, medium: 0.1, high: 0.4 }, all, 0.7)).toBe('high')
  expect(quantilePick({ low: 0.05, medium: 0.05, high: 0.1, xhigh: 0.7, max: 0.1 }, all, 0.7)).toBe('xhigh')
  expect(quantilePick({ low: 0.02, medium: 0.03, high: 0.1, xhigh: 0.15, max: 0.7 }, all, 0.7)).toBe('max')
  expect(quantilePick({ low: 0.5, medium: 0.5 }, all, 0.5)).toBe('low')
})

test('a more careful tau never picks lower than a less careful one', () => {
  const probs = { low: 0.3, medium: 0.3, high: 0.2, xhigh: 0.15, max: 0.05 }
  const rank = (e: string) => levelsUpTo('max').indexOf(e as never)
  const picks = [0.5, 0.6, 0.7, 0.8, 0.9, 0.99].map(t => rank(quantilePick(probs, levelsUpTo('max'), t)))
  expect(picks).toEqual([...picks].sort((a, b) => a - b))
})

test('probabilities are restricted to the levels offered and renormalised', () => {
  // xhigh and max are not offered: their mass is ignored, not given to "low"
  expect(quantilePick({ low: 0.1, medium: 0.1, high: 0.1, xhigh: 0.35, max: 0.35 }, levelsUpTo('high'), 0.7)).toBe('high')
  expect(quantilePick({}, levelsUpTo('high'))).toBe('high')
  expect(quantilePick({ low: 1 }, levelsUpTo('low'))).toBe('low')
})


test('the Haiku instructions carry only examples of the levels on offer', () => {
  const text = judgeSystem(levelsUpTo('high'))
  expect(text).toContain('-> high')
  expect(text).not.toContain('-> xhigh')
  expect(judgeSystem(levelsUpTo('max'))).toContain('-> max')
})

test('why a model is left alone is said in plain words', () => {
  const none = { mode: 'haiku', model: '' }
  expect(idleReason('claude-haiku-5-5', none, '')).toBe('Cruise steers Anthropic Opus, Sonnet and Fable 5')
  expect(idleReason('Anthropic (Login)/claude-sonnet-5-5[1m]', none, '')).toContain('lost its prompt cache when the effort changed')
  expect(idleReason('OpenAI (Login)/gpt-6.1-sol', none, '')).toContain('off by default')
  expect(idleReason('OpenAI (Login)/gpt-6.1-sol', none, 'Google (Login)/gemini-*')).toContain('not in routerModels')
  expect(idleReason('OpenAI (Login)/gpt-6.1-sol', none, 'OpenAI (Login)/gpt-*')).toContain('Haiku judge is not used')
  expect(idleReason('OpenAI (Login)/gpt-6.1-sol', { mode: 'haiku', model: 'x' }, 'OpenAI (Login)/gpt-*')).toBe('Cruise steers Anthropic, OpenAI (via router)')
})
