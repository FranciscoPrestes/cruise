import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level } from '../types'
import { nextWarning, URGENT_AT } from './levels'

const warned = atom({ plugin: 'aviso-contexto', key: 'warned' } as const, 0 as Level)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    const percent = context.percent
    if (percent === undefined) return result

    const step = nextWarning(percent, await read($, warned))
    await update($, warned, () => step.warned)
    $.ui.status(step.warned ? `Contexto ${percent}% · digite /handoff` : undefined)

    if (step.show === URGENT_AT) {
      $.ui.toast(`Contexto em ${percent}%. Digite /handoff agora, antes da compactação.`)
      void $.ui.notify(`Contexto em ${percent}%: hora do handoff`, { title: 'Claude Code' })
    } else if (step.show) {
      $.ui.toast(`Contexto em ${percent}%. Quando fechar esta etapa, digite /handoff.`)
    }
    return result
  })
}
