// Update check: once a day it reads the version published on GitHub and tells the person when it is newer.
// Installation is always manual. Off with `updates: off`.
import type { EngineInterface, PluginOptions } from 'claude-code'

import { VERSION } from './version'

export const MANIFEST_URL = 'https://raw.githubusercontent.com/FranciscoPrestes/cruise/main/.claude-plugin/plugin.json'
const DAY_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000
const KEY = 'cruise.update'

export type UpdateMode = 'check' | 'off'
export type UpdateRecord = { checkedAt: number | null; latest: string | null; told: string | null }

export const updateMode = (options: PluginOptions): UpdateMode => (options.updates === 'off' ? 'off' : 'check')

const numbers = (version: string): number[] | undefined => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

// True only for a well-formed version that is higher than the one installed.
export function isNewer(latest: string, current: string): boolean {
  const a = numbers(latest)
  const b = numbers(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

export function manifestVersion(text: string): string | undefined {
  try {
    const version = (JSON.parse(text) as { version?: unknown }).version
    return typeof version === 'string' && numbers(version) ? version : undefined
  } catch {
    return undefined
  }
}

export const noticeFor = (latest: string, current: string = VERSION): string => `Cruise ${latest} is available (you have ${current}). Type /cruise:update to install it.`

async function fetchLatest($: EngineInterface): Promise<string | undefined> {
  const res = await Promise.race([
    $.http.fetch(MANIFEST_URL),
    $.clock.sleep(FETCH_TIMEOUT_MS).then(() => {
      throw new Error('update check timeout')
    }),
  ])
  return res.ok ? manifestVersion(res.text) : undefined
}

async function check($: EngineInterface, mode: UpdateMode): Promise<void> {
  if (mode === 'off') return
  const now = await $.clock.now()
  const saved = ((await $.store.get(KEY)) as UpdateRecord | undefined) ?? { checkedAt: null, latest: null, told: null }
  let record = saved
  if (saved.checkedAt === null || now - saved.checkedAt >= DAY_MS) {
    const latest = await fetchLatest($)
    if (latest === undefined) return // offline or unreadable: try again next session
    record = { ...saved, checkedAt: now, latest }
    await $.store.set(KEY, record)
  }
  const latest = record.latest
  if (!latest || !isNewer(latest, VERSION) || record.told === latest) return
  await $.store.set(KEY, { ...record, told: latest })
  $.ui.toast(noticeFor(latest))
}

export async function checkForUpdate($: EngineInterface, mode: UpdateMode): Promise<void> {
  try {
    await check($, mode)
  } catch {
    // Never blocks the session.
  }
}

// The update line of the /cruise panel.
export async function updateLine($: EngineInterface, mode: UpdateMode): Promise<string> {
  if (mode === 'off') return 'automatic check off (setting "updates") · /cruise:update checks by hand'
  const saved = (await $.store.get(KEY).catch(() => undefined)) as UpdateRecord | undefined
  if (saved?.latest && isNewer(saved.latest, VERSION)) return `${saved.latest} is available (you have ${VERSION}) · type /cruise:update`
  return saved?.latest ? `${VERSION} · last checked: ${saved.latest} · /cruise:update` : `${VERSION} · update check not yet available · /cruise:update`
}
