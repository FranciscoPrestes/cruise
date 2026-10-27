import type { EngineInterface } from 'claude-code'

let started: number | undefined
let activity: number | undefined
let action: string | undefined
export function resetActivity(at?: number): void { started = at; activity = undefined; action = undefined }
export function observeActivity(at: number, description?: string): void { activity = at; action = description }
export async function sessionInfo($: EngineInterface) {
  const [model, now] = await Promise.all([$.session.model().catch(() => undefined), $.clock.now().catch(() => undefined)])
  return { model, now, started, activity, ...(action ? { action } : {}) }
}
