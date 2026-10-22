// Release check: the version in hooks/version.ts (used by the update check) must equal the one in the manifest.
// Run before every push that changes the version: node scripts/check-version.mjs
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version
const code = /VERSION = '([^']+)'/.exec(readFileSync(new URL('../hooks/version.ts', import.meta.url), 'utf8'))?.[1]
if (manifest !== code) {
  console.error(`version mismatch: plugin.json ${manifest}, hooks/version.ts ${code}`)
  process.exit(1)
}
console.log(`version ${manifest}: ok`)
