// Runs the effort judge the way Cruise does ($.model.complete: no thinking, the same cap and effort), for train/haiku_baseline.py.
// `claude -p` on its own thinks before it answers, so it measured a different judge. JUDGE_JOB names a JSON job; the answers go next to it.
import type { Register } from 'claude-code'

type Job = { model: string; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; maxTokens: number; workers: number; system: string; prompts: string[] }

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const path = await $.env.get('JUDGE_JOB').catch(() => undefined)
    if (!path) return next(e)
    const job = JSON.parse(await $.fs.read(path)) as Job
    const out: { text: string; answered: boolean; out: number; ms: number; reason?: string }[] = new Array(job.prompts.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < job.prompts.length) {
        const i = cursor++
        const started = Date.now()
        const r = await $.model.complete({ model: job.model, system: job.system, prompt: job.prompts[i] ?? '', maxTokens: job.maxTokens, effort: job.effort, timeoutMs: 60_000 })
        out[i] = { text: r.isAnswered ? r.text : '', answered: r.isAnswered, out: r.usage?.output_tokens ?? 0, ms: Date.now() - started, ...(r.isAnswered ? {} : { reason: r.reason }) }
      }
    }
    await Promise.all(Array.from({ length: job.workers }, worker))
    await $.fs.write(`${path}.out.json`, JSON.stringify(out))
    return next(e)
  })
}
