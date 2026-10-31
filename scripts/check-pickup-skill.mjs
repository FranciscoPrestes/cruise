import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const skill = readFileSync(new URL('../skills/pickup/SKILL.md', import.meta.url), 'utf8')
for (const requirement of [
  'memory_read_session_observations',
  'Do not claim or consume',
  'If ai-memory is absent or unavailable, keep the file-only behavior',
  'If an explicit handoff file path',
]) assert.ok(skill.includes(requirement), requirement)

for (const name of ['pickup', 'go-around']) {
  const text = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8')
  assert.ok(text.includes('flight-check'), `${name} must report a flight check`)
  assert.ok(text.toLowerCase().includes('before continuing'), `${name} must report before continuing`)
}
