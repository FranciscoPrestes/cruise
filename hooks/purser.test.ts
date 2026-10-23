import { expect, test } from 'claude-code/testing'

import { PURSER, PURSER_ID } from './purser'

const sections = [{ id: 'intro', text: 'hi', scope: 'shared' }]
const compose = async ($: any, on: any) => {
  on('prompt.compose', async () => ({ sections }) as never)
  return ($.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }) as Promise<{ sections: { id: string; text: string; scope: string }[] }>)
}

test('purser mode is on by default and adds one session section last', async ($, on) => {
  const out = await compose($, on)
  expect(out.sections.map(s => s.id)).toEqual(['intro', PURSER_ID])
  expect(out.sections.at(-1)).toMatchObject({ text: PURSER, scope: 'session' })
})

test('it can be switched off', { options: { purser: false } }, async ($, on) => {
  const out = await compose($, on)
  expect(out.sections.map(s => s.id)).toEqual(['intro'])
})

test('the instruction stays short', () => {
  expect(PURSER.length).toBeLessThan(2800)
})
