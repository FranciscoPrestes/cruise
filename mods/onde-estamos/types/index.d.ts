export type Ask = { text: string; at: number }
export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = Readonly<Record<string, Step>>

declare module 'claude-code' {
  interface PluginState {
    'onde-estamos': {
      ask: Ask | null
      plan: Plan
      // Background work other than subagents, as of the last Stop / SubagentStop (subagents are read live).
      background: readonly string[]
      // Bumped once a minute so the "x min ago" label redraws on its own.
      tick: number
    }
  }
}
