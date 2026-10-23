import { expect, mock, test } from 'claude-code/testing'

import { isNewer, manifestVersion, noticeFor } from './updates'
import { VERSION } from './version'

test('isNewer compares x.y.z numerically and refuses anything else', () => {
  expect(isNewer('1.3.1', '1.3.0')).toBe(true)
  expect(isNewer('1.10.0', '1.9.9')).toBe(true)
  expect(isNewer('2.0.0', '1.99.99')).toBe(true)
  expect(isNewer('1.3.0', '1.3.0')).toBe(false)
  expect(isNewer('1.2.9', '1.3.0')).toBe(false)
  expect(isNewer('1.3', '1.2.0')).toBe(false)
  expect(isNewer('latest', '1.2.0')).toBe(false)
})

test('manifestVersion reads a version and ignores a broken or odd answer', () => {
  expect(manifestVersion('{"name":"cruise","version":"1.4.0"}')).toBe('1.4.0')
  expect(manifestVersion('<html>404</html>')).toBeUndefined()
  expect(manifestVersion('{"version":"next"}')).toBeUndefined()
})

test('the notice names both versions and the command', () => {
  expect(noticeFor('1.9.0', '1.3.0')).toBe('Cruise 1.9.0 is available (you have 1.3.0). Type /cruise:update to install it.')
})

type Setup = { toasts: string[]; fetched: number; ran: string[][] }
const mount = (on: any) => {
  const clock = mock.clock(on)
  on('session.start', async () => ({ cwd: '/tmp' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  const mem: Record<string, unknown> = {}
  on('store.get', async (_$: unknown, e: { key: string }) => ({ value: mem[e.key] }) as never)
  on('store.set', async (_$: unknown, e: { key: string; value: unknown }) => { mem[e.key] = e.value; return { value: undefined } as never })
  return clock
}
function stubs(on: any, manifest: string): Setup {
  const out: Setup = { toasts: [], fetched: 0, ran: [] }
  mount(on)
  on('ui.toast', async (_$: unknown, e: { text: string }) => { out.toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('http.fetch', async () => { out.fetched += 1; return { value: { ok: true, status: 200, headers: {}, text: manifest } } as never })
  on('process.run', async (_$: unknown, e: { argv: string[] }) => { out.ran.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } as never })
  return out
}

const start = async ($: any) => { await $.session.start({ source: 'startup', cwd: '/tmp' } as never); await new Promise(r => setTimeout(r, 50)) }

test('check mode: a newer version is announced once and nothing is installed', async ($, on) => {
  const s = stubs(on, '{"version":"9.0.0"}')
  await start($)
  await start($)
  expect(s.toasts.filter(t => t.includes('9.0.0'))).toHaveLength(1)
  expect(s.fetched).toBe(1)
  expect(s.ran).toHaveLength(0)
})

test('the same version as installed says nothing', async ($, on) => {
  const s = stubs(on, `{"version":"${VERSION}"}`)
  await start($)
  expect(s.toasts.filter(t => t.includes('available'))).toHaveLength(0)
})

test('off: it never looks', { options: { updates: 'off' } }, async ($, on) => {
  const s = stubs(on, '{"version":"9.0.0"}')
  await start($)
  expect(s.fetched).toBe(0)
})

test('legacy auto setting only announces the update and never installs it', { options: { updates: 'auto' } }, async ($, on) => {
  const s = stubs(on, '{"version":"9.0.0"}')
  await start($)
  expect(s.ran).toHaveLength(0)
  expect(s.toasts.some(t => t.includes('9.0.0') && t.includes('/cruise:update'))).toBe(true)
})

test('a broken answer from GitHub is ignored without a word', async ($, on) => {
  const s = stubs(on, '<html>rate limited</html>')
  await start($)
  expect(s.toasts.filter(t => t.includes('available'))).toHaveLength(0)
})
