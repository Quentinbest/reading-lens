// The live contract check for one preset: a fixed sentence (never book text, §6.9),
// sent the way Explain sends it, and the answer read the way Explain reads it. The key
// comes from the environment and is never written anywhere.
//
//   DEEPSEEK_API_KEY=… node scripts/live-check.mjs            (deepseek, the default)
//   node scripts/live-check.mjs deepseek --record              (also save the response)
//
// With --record, the response (no key in it) goes to tests/recordings/<preset>/live.json.
import { writeFileSync } from 'node:fs'
import { load } from '../tests/harness.mjs'
import { validate } from '../tests/linen-validate.mjs'

const preset = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'deepseek'
const record = process.argv.includes('--record')
const ENV = {
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: null,
}
const envName = ENV[preset]
const key = envName ? process.env[envName] : ''
if (envName && !key) {
  console.log(`skipped: set ${envName} to run the live check for ${preset}`)
  process.exit(0)
}

let raw
const x = load({
  settings: { provider: preset, models: { ollama: process.env.OLLAMA_MODEL || 'qwen3' }, studyLog: false },
  // What Linen's core does with `auth` (LK7): the key goes in its scheme's header.
  respond: async (url, init) => {
    const headers = { ...init.headers }
    if (init.auth) {
      if (init.auth.scheme === 'bearer') headers.authorization = `Bearer ${key}`
      else headers[init.auth.scheme] = key
    }
    const started = Date.now()
    const res = await fetch(url, { method: init.method, headers, body: init.body, redirect: 'manual' })
    const body = await res.text()
    raw = { status: res.status, content_type: res.headers.get('content-type'), body }
    console.log(`${preset}: HTTP ${res.status} in ${Date.now() - started} ms`)
    return raw
  },
})

const answer = validate(await x.explain())
console.log(JSON.stringify({ ...answer, sent: `(${answer.sent?.length ?? 0} characters)` }, null, 1))
if (answer.status === 'error') process.exitCode = 1
if (record && raw) {
  if (raw.body.includes(key || '\u0000')) throw new Error('the response holds the key; not recorded')
  writeFileSync(
    new URL(`../tests/recordings/${preset}/live.json`, import.meta.url),
    JSON.stringify(raw, null, 1) + '\n',
  )
  console.log(`recorded tests/recordings/${preset}/live.json`)
}
