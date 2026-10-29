// Prints the Haiku judge's exact system prompt and questions for haiku_baseline.py, so the baseline asks what Cruise asks.
// stdin: {"top": "max", "app": "medium", "posture": "quality", "rows": [{"text": "...", "afterQuestion": false}]}  stdout: {"system": "...", "prompts": ["..."]}
import { judgeQuestion, judgeSystem, levelsUpTo } from '../hooks/effort-rules'

const input = JSON.parse(await Bun.stdin.text())
const levels = levelsUpTo(input.top)
console.log(JSON.stringify({
  system: judgeSystem(levels, input.posture ?? 'quality'),
  prompts: input.rows.map((r: { text: string; afterQuestion: boolean }) => judgeQuestion(r.text, input.top, null, r.afterQuestion, input.app)),
}))
