import type { EngineInterface } from 'claude-code'
import { handoffDir } from './relay'

export type HandoffInfo = { status: 'absent' | 'unavailable' } | { status: 'found'; path: string; at: number; goal?: string }

export async function handoffInfo($: EngineInterface): Promise<HandoffInfo> {
  try {
    const home = await $.env.get('HOME')
    if (!home) return { status: 'unavailable' }
    const folder = handoffDir(home, await $.session.cwd())
    if (!(await $.fs.exists(folder))) return { status: 'absent' }
    const latest = (await $.fs.list(folder)).filter(e => e.kind === 'file' && e.name.endsWith('.md')).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    if (!latest) return { status: 'absent' }
    const path = `${folder}/${latest.name}`
    const text = await $.fs.read(path)
    const goal = /^###\s+(?:Goal|Objetivo)\s*\r?\n([^\r\n]+)/im.exec(text)?.[1]?.trim()
    return { status: 'found', path, at: latest.mtimeMs, ...(goal ? { goal } : {}) }
  } catch { return { status: 'unavailable' } }
}
