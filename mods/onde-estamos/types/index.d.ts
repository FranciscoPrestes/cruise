export type Ask = { text: string; at: number }
export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = Readonly<Record<string, Step>>
export type BgTask = { id: string; type: string }

declare module 'claude-code' {
  interface PluginState {
    'onde-estamos': {
      ask: Ask | null
      plan: Plan
      // Background work other than subagents (subagents are read live): kept up to date as tasks start
      // and end, and reset to the engine's own list at each Stop / SubagentStop.
      background: readonly BgTask[]
      // Bumped once a minute so the "x min ago" label redraws on its own.
      tick: number
    }
  }
}
