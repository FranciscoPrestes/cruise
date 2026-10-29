import { expect, mock, test } from 'claude-code/testing'

const usage = (percent: number) => ({ value: { startedAt: 0, context: { window: 200000, tokens: 0, percent } } }) as never
const mountBand = ($: Parameters<Parameters<typeof test>[1]>[0], isWorking = false) =>
  $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 100, isWorking, hasSurvey: false, maxRows: 10 } as never })

test('from the first warning the band offers the handoff button', async ($, on) => {
  on('session.usage', async () => usage(72))
  const band = await mountBand($)
  expect(await band.findAll({ text: /Context 72% of 200K/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /✈/ })).not.toHaveLength(0)
})

// With nothing to show the band hands the site to the engine, which in a test has nothing beneath: the mount is refused.
const hasContextRow = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  try {
    return (await (await mountBand($)).findAll({ text: /Context/ })).length > 0
  } catch {
    return false
  }
}

test('below the first warning the band has no context row', async ($, on) => {
  on('session.usage', async () => usage(40))
  expect(await hasContextRow($)).toBe(false)
})

test('alert mode keeps the warnings and adds no row', { options: { contextAction: 'alert' } }, async ($, on) => {
  on('session.usage', async () => usage(95))
  expect(await hasContextRow($)).toBe(false)
})

test('auto mode shows its point instead of a button', { options: { contextAction: 'auto', autoAt: 85 } }, async ($, on) => {
  on('session.usage', async () => usage(72))
  const band = await mountBand($)
  expect(await band.findAll({ text: /automatic at 85%/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /✈/ })).toHaveLength(0)
})

test('the handoff is visible while the model works and offered when it is idle', async ($, on) => {
  on('session.usage', async () => usage(72))
  const band = await mountBand($, true)
  expect(await band.findAll({ text: /Context 72%/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /✈/ })).toHaveLength(0)
  expect(await band.findAll({ text: /Handoff after this turn/ })).not.toHaveLength(0)
})

test('pressing the button starts the handoff command, from a timer and not from inside the press', async ($, on) => {
  const clock = mock.clock(on)
  const ran: string[] = []
  const toasts: string[] = []
  on('session.usage', async () => usage(72))
  on('env.get', async () => ({ value: '/tmp' }) as never)
  on('session.id', async () => ({ value: 'session-a' }) as never)
  on('session.cwd', async () => ({ value: '/work/demo' }) as never)
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } as never })
  on('command.run', async (_$: unknown, e: { command: string }) => { ran.push(e.command); return { text: '' } as never })
  await mountBand($)
  await $.ui.press({ plugin: 'cruise', key: 'relay-go' })
  expect(ran).toEqual([])
  await clock.advance(400)
  expect(ran[0]).toBe('cruise:handoff')
  expect(toasts.some(t => t.includes('handoff, then clear, then pickup'))).toBe(true)
  // No turn ever completes here, so the relay gives up after its time-out: nothing is cleared, and the record says why.
  await clock.advance(200_000)
  expect(ran).toEqual(['cruise:handoff'])
  expect(toasts.some(t => t.includes('did not finish in time'))).toBe(true)
})

test('the handoff button is present below the warning', async ($, on) => {
  on('session.usage', async () => usage(30))
  expect(await (await mountBand($)).findAll({ text: /✈/ })).not.toHaveLength(0)
})

test('the handoff button remains present if context usage fails', async ($, on) => {
  on('session.usage', async () => { throw new Error('unavailable') })
  const band = await mountBand($)
  expect(await band.findAll({ text: /✈/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /Context unknown/ })).not.toHaveLength(0)
})


test('a narrow band keeps the handoff button without a clipped context message', async ($, on) => {
  on('session.usage', async () => { throw new Error('unavailable') })
  const band = await $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 16, isWorking: false, hasSurvey: false, maxRows: 10 } as never })
  expect(await band.findAll({ text: /✈/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /Context unkn/ })).toHaveLength(0)
})
