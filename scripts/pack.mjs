// Packs extension/ into dist/explain-<version>.linenext, a zip Linen installs with
// Settings › Extensions › Install from file… (D4).
//
//   node scripts/pack.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(readFileSync(`${root}extension/manifest.json`, 'utf8'))
const out = `${root}dist/explain-${version}.linenext`
mkdirSync(`${root}dist`, { recursive: true })
rmSync(out, { force: true })
// -X: no extra file attributes; -D: no directory entries.
execFileSync('zip', ['-X', '-D', '-r', '-q', out, '.', '-x', '.*'], { cwd: `${root}extension` })
console.log(out)
