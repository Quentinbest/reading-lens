// Step 3: each item through two or three models, exactly as Explain asks them (its
// prompt, adapters and answer rules), one request at a time. This sends the items'
// book text to the providers named: it needs --send-book-text, and keys from the
// environment (never written anywhere). Re-running resumes where it stopped.
//
//   DEEPSEEK_API_KEY=… DASHSCOPE_API_KEY=… node offline/run.mjs items.json \
//     --model deepseek:deepseek-flash --model qwen:qwen3.8-flash \
//     -o answers.jsonl --send-book-text [--language zh-Hans]
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { load } from '../tests/harness.mjs'

const ENV = {
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: null,
}
const SHORT = 40 // characters: context still as the export left it

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const models = args.flatMap((a, i) => (a === '--model' ? [args[i + 1]] : []))
const file = args[0]
const out = opt('-o')
const language = opt('--language') || 'zh-Hans'
if (!file || !out || !models.length) {
  console.error('usage: node offline/run.mjs items.json --model preset:model ... -o answers.jsonl --send-book-text')
  process.exit(2)
}
if (!args.includes('--send-book-text')) {
  console.error('This sends the items’ book text to the providers named. Add --send-book-text to go ahead.')
  process.exit(2)
}

const { items } = JSON.parse(readFileSync(file, 'utf8'))
const short = items.filter((it) => it.context.before.length < SHORT || it.context.after.length < SHORT)
if (short.length && !args.includes('--allow-short-context')) {
  console.error(
    `${short.length} items still have the export's short context (${short
      .slice(0, 5)
      .map((it) => it.id)
      .join(', ')}…). Widen them first (docs/offline-run.md, step 2), or pass --allow-short-context.`,
  )
  process.exit(1)
}
for (const m of models) {
  const [preset] = m.split(':')
  if (!(preset in ENV)) throw new Error(`unknown preset ${preset}`)
  if (ENV[preset] && !process.env[ENV[preset]]) throw new Error(`set ${ENV[preset]} for ${preset}`)
}

const done = new Set(
  existsSync(out)
    ? readFileSync(out, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const r = JSON.parse(l)
          return `${r.item}\u0000${r.model}`
        })
    : [],
)

for (const it of items)
  for (const m of models) {
    if (done.has(`${it.id}\u0000${m}`)) continue
    const [preset, model] = m.split(/:(.*)/s)
    const key = ENV[preset] ? process.env[ENV[preset]] : ''
    let ms = 0
    let http = null
    const x = load({
      settings: { provider: preset, models: { [preset]: model }, studyLog: false },
      respond: async (url, init) => {
        const headers = { ...init.headers }
        if (init.auth) {
          if (init.auth.scheme === 'bearer') headers.authorization = `Bearer ${key}`
          else headers[init.auth.scheme] = key
        }
        const started = Date.now()
        const res = await fetch(url, { method: init.method, headers, body: init.body, redirect: 'manual' })
        const body = await res.text()
        ms = Date.now() - started
        http = res.status
        return { status: res.status, content_type: res.headers.get('content-type'), body }
      },
    })
    // The book, as Explain would send it.
    x.ctx.linen.book.metadata = async () => ({ title: it.book, authors: [], language: 'en', identifier: '' })
    x.ctx.linen.book.selection = async () => ({ text: it.text, cfi: it.id, context: it.context })
    let answer
    try {
      answer = await x.explain({ text: it.text, context: it.context, bookLang: 'en', language })
    } catch (e) {
      answer = { status: 'error', error: String(e.message || e).slice(0, 200) }
    }
    if (answer) delete answer.sent
    appendFileSync(out, JSON.stringify({ item: it.id, model: m, ms, http, answer }) + '\n')
    console.log(`${it.id} ${m}: ${answer ? answer.status : 'none'}${answer?.error ? ` (${answer.error})` : ''} ${ms} ms`)
  }
