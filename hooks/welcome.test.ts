import { expect, mock, test } from 'claude-code/testing'

import { welcomeText } from './welcome'

test('the welcome points to the panel and to the settings', () => {
  expect(welcomeText(true)).toContain('/cruise')
  expect(welcomeText(true)).toContain('/cruise:configure')
})

test('it greets once, on the first session', async ($, on) => {
  const toasts: string[] = []
  mock.clock(on)
  on('session.start', async () => ({ cwd: '/tmp' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  const mem: Record<string, unknown> = {}
  on('store.get', async (_$: unknown, e: { key: string }) => ({ value: mem[e.key] }) as never)
  on('store.set', async (_$: unknown, e: { key: string; value: unknown }) => { mem[e.key] = e.value; return { value: undefined } as never })
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('http.fetch', async () => ({ value: { ok: false, status: 500, headers: {}, text: '' } }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise(r => setTimeout(r, 50))
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise(r => setTimeout(r, 50))
  expect(toasts.filter(t => t.includes('Cruise is on'))).toHaveLength(1)
})
