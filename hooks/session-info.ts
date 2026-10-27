import type { EngineInterface } from 'claude-code'

let started: number | undefined
let activity: number | undefined
export function resetActivity(at?: number): void { started = at; activity = undefined }
export function observeActivity(at: number): void { activity = at }
export async function sessionInfo($: EngineInterface) {
  const [model, now] = await Promise.all([$.session.model().catch(() => undefined), $.clock.now().catch(() => undefined)])
  return { model, now, started, activity }
}
