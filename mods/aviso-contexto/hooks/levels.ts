import type { Level } from '../types'

export const WARN_AT = 75
export const URGENT_AT = 90
export const RESET_BELOW = 50

// Qual aviso dar agora e o que fica registrado como já avisado.
// Avisa uma vez por faixa; depois de uma compactação (abaixo de 50%) zera.
export function nextWarning(percent: number, warned: Level): { show: Level; warned: Level } {
  if (percent < RESET_BELOW) return { show: 0, warned: 0 }
  const level: Level = percent >= URGENT_AT ? URGENT_AT : percent >= WARN_AT ? WARN_AT : 0
  return level > warned ? { show: level, warned: level } : { show: 0, warned }
}
