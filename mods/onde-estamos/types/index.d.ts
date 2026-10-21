export type Ask = { text: string; at: number }
export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = Readonly<Record<string, Step>>

declare module 'claude-code' {
  interface PluginState {
    'onde-estamos': {
      ask: Ask | null
      plan: Plan
      background: readonly string[]
    }
  }
}
