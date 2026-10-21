import { expect, test } from 'claude-code/testing'

import {
  cacheRewritten,
  clampTo,
  effortLine,
  endsOnQuestion,
  isFollowUp,
  isSteerable,
  levelsUpTo,
  liftHighest,
  parseHaiku,
  parseJev,
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
  expect(isSteerable('claude-opus-5-5', 12000)).toBe(false)
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

test('the highest label of a three-level judge keeps a higher app effort', () => {
  expect(liftHighest('high', 'xhigh')).toBe('xhigh')
  expect(liftHighest('high', 'max')).toBe('max')
  expect(liftHighest('high', 'high')).toBe('high')
  expect(liftHighest('medium', 'xhigh')).toBe('medium')
})
