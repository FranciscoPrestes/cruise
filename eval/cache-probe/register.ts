import type { Register } from 'claude-code'

const lines: string[] = []

// MODE=alternate flips low/high on every main-loop request; MODE=constant leaves the effort alone.
export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const mode = (await $.env.get('PROBE_MODE').catch(() => undefined)) ?? 'alternate'
    const sent = mode === 'alternate' ? (e.index % 2 === 0 ? 'low' : 'high') : e.effort
    const result = yield* next(mode === 'alternate' ? { ...e, effort: sent } : e)
    const u = (result.usage ?? {}) as Record<string, number | undefined>
    lines.push(`mode=${mode} req=${e.index} model=${e.model} appEffort=${String(e.effort)} sentEffort=${String(sent)} input=${u.input_tokens} cache_read=${u.cache_read_input_tokens} cache_write=${u.cache_creation_input_tokens} output=${u.output_tokens}`)
    await $.fs.write('/tmp/cache-probe.log', lines.join('\n') + '\n').catch(() => undefined)
    return result
  })
}
