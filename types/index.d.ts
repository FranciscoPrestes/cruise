export type Level = number
export type Ask = { text: string; at: number }
export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = Readonly<Record<string, Step>>
export type BgTask = { id: string; type: string }
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type EffortState = {
  // The prompt waiting for a verdict (judged on the first request of its turn, when the model is known).
  pending: { text: string; afterQuestion: boolean } | null
  // The effort chosen for the current work; null until the first verdict.
  pick: Effort | null
  // Why steering stopped for this session (the prompt cache did not survive an effort change); null while it runs.
  paused: string | null
  // The effort the app itself asked for on the last request: the ceiling.
  appSeen: string | null
  // Counters for /cruise: verdicts asked, follow-ups that kept the pick, judge failures, tokens, requests steered.
  judged: number
  kept: number
  failed: number
  judgeTokens: number
  steered: number
  // How many times each effort was picked.
  picks: Readonly<Record<string, number>>
  // The effort and time of the previous main-loop request, for the cache guard.
  lastSent: { effort: string; at: number; model?: string; cacheRead?: number } | null
  // The judge's reason for the current pick.
  why: string
  // The model of the last main-loop request when it takes no steering here (another provider, or no effort setting); null while steering applies.
  idle: string | null
}

declare module 'claude-code' {
  interface PluginState {
    cruise: {
      // Context: percent of context at which the last warning was shown; 0 = none yet.
      contextWarned: Level
      // Context: the model of the last main-loop request, to notice a model switch.
      contextModel: string
      // Progress tracking (shown in the /cruise dashboard): the current request, the plan and background work.
      progressAsk: Ask | null
      progressPlan: Plan
      // Background work other than subagents (subagents are read live): kept up to date as tasks start
      // and end, and reset to the engine's own list at each Stop / SubagentStop.
      progressBackground: readonly BgTask[]
      // The request is shown whole (true) or cut to two rows (false, the default and what every new prompt restores).
      progressExpanded: boolean
      // Effort steering (optional): the judge's verdicts and the cache guard.
      effort: EffortState
    }
  }
}
