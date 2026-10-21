export type Level = 0 | 75 | 90

declare module 'claude-code' {
  interface PluginState {
    'aviso-contexto': { warned: Level }
  }
}
