// Percent of context at which the last warning was shown; 0 = none yet.
export type Level = number

declare module 'claude-code' {
  interface PluginState {
    'aviso-contexto': { warned: Level }
  }
}
