import { expect, mock, test } from 'claude-code/testing'

const usage = (percent: number) => ({ value: { startedAt: 0, context: { window: 200000, tokens: 0, percent } } }) as never
const mountBand = ($: Parameters<Parameters<typeof test>[1]>[0], isWorking = false) =>
  $.ui.mount({ plugin: 'cruise', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 100, isWorking, hasSurvey: false, maxRows: 10 } as never })

test('from the first warning the band offers the handoff button, whatever the progress setting is', async ($, on) => {
  on('session.usage', async () => usage(72))
  const band = await mountBand($)
  expect(await band.findAll({ text: /Context 72% of 200K/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /Handoff and continue/ })).not.toHaveLength(0)
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
  expect(await band.findAll({ text: /Handoff and continue/ })).toHaveLength(0)
})

test('the button waits for the turn to end: it is not drawn while the model works', async ($, on) => {
  on('session.usage', async () => usage(72))
  const band = await mountBand($, true)
  expect(await band.findAll({ text: /Context 72%/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /Handoff and continue/ })).toHaveLength(0)
})

test('one band hook merges the progress rows and the context row', { options: { progress: true } }, async ($, on) => {
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('prompt.submit', async () => ({ text: 'ok' }) as never)
  on('session.usage', async () => usage(72))
  await $.prompt.submit({ text: 'integrate billing into the planning app using the existing connection' })
  const band = await mountBand($)
  expect(await band.findAll({ text: /integrate billing/ })).not.toHaveLength(0)
  expect(await band.findAll({ text: /Context 72%/ })).not.toHaveLength(0)
})

test('pressing the button starts the handoff command, from a timer and not from inside the press', async ($, on) => {
  const clock = mock.clock(on)
  const ran: string[] = []
  const toasts: string[] = []
  const mem: Record<string, unknown> = {}
  on('session.usage', async () => usage(72))
  on('store.get', async (_$: unknown, e: { key: string }) => ({ value: mem[e.key] }) as never)
  on('store.set', async (_$: unknown, e: { key: string; value: unknown }) => { mem[e.key] = e.value; return { value: undefined } as never })
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } as never })
  on('command.run', async (_$: unknown, e: { command: string }) => { ran.push(e.command); return { text: '' } as never })
  await mountBand($)
  await $.ui.press({ plugin: 'cruise', key: 'relay-go' })
  expect(ran).toEqual([])
  await clock.advance(400)
  expect(ran[0]).toBe('cruise:handoff')
  expect(toasts.some(t => t.includes('handoff, then clear, then pickup'))).toBe(true)
  expect((mem['cruise.relay'] as { running: boolean }).running).toBe(true)
  // No turn ever completes here, so the relay gives up after its time-out: nothing is cleared, and the record says why.
  await clock.advance(200_000)
  expect(ran).toEqual(['cruise:handoff'])
  const record = mem['cruise.relay'] as { running: boolean; last: { ok: boolean; why: string } }
  expect(record.running).toBe(false)
  expect(record.last.ok).toBe(false)
  expect(record.last.why).toContain('did not finish in time')
})
