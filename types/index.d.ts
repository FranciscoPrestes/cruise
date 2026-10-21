export type Level = number
export type Ask = { text: string; at: number }
export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = Readonly<Record<string, Step>>
export type BgTask = { id: string; type: string }

declare module 'claude-code' {
  interface PluginState {
    cruise: {
      // Context: percent of context at which the last warning was shown; 0 = none yet.
      contextWarned: Level
      // Progress band: the current request, the plan, background work and a minute tick.
      progressAsk: Ask | null
      progressPlan: Plan
      // Background work other than subagents (subagents are read live): kept up to date as tasks start
      // and end, and reset to the engine's own list at each Stop / SubagentStop.
      progressBackground: readonly BgTask[]
      // Bumped once a minute so the "x min ago" label redraws on its own.
      progressTick: number
    }
  }
}
