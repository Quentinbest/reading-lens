// A stand-in for Linen's Worker (read-book src-tauri/src/extensions/worker.js): it
// runs Explain's real files in a fresh context with a fake `linen` whose net.fetch
// replays a recorded response (§6.9). No test reaches a real provider.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const EXT = fileURLToPath(new URL('../extension/', import.meta.url))

export const PASSAGE = {
  text: 'invalidates',
  context: {
    before: 'Each core keeps its own copy of the line.',
    sentence: 'A write on one core invalidates the copies held by the others.',
    after: 'The next read on those cores misses.',
    paragraph: '',
    chapter: '5 Caches',
    selection: { start: 19, end: 30 },
  },
  bookLang: 'en',
  language: 'zh-Hans',
}

/**
 * Load Explain with a fake host. `respond(url, init)` returns a response
 * ({ status, content_type, body }) or throws as Linen's net.fetch would.
 */
export function load({
  settings = { provider: 'deepseek', models: {}, studyLog: false },
  granted = true,
  secret = true,
  noticed = true,
  respond = () => ({ status: 200, content_type: 'application/json', body: '{}' }),
} = {}) {
  const storage = new Map()
  if (settings) storage.set('settings', JSON.stringify(settings))
  const fetches = []
  const lookups = new Map()
  const commands = new Map()
  const saved = []
  const warnings = []
  const ctx = {
    console: { ...console, warn: (...a) => warnings.push(a.join(' ')) },
    setTimeout,
    clearTimeout,
    URL,
  }
  ctx.self = ctx
  ctx.importScripts = (...files) => {
    for (const f of files) vm.runInContext(readFileSync(EXT + f, 'utf8'), ctx, { filename: f })
  }
  ctx.linen = {
    apiVersion: '1.1.0',
    storage: {
      get: async (k) => (storage.has(k) ? storage.get(k) : null),
      set: async (k, v) => void storage.set(k, String(v)),
      delete: async (k) => void storage.delete(k),
      keys: async () => [...storage.keys()],
    },
    permissions: {
      has: async () => granted,
      request: async () => granted,
    },
    secrets: {
      has: async () => secret,
      request: async () => secret,
    },
    book: {
      selection: async () => ({ text: PASSAGE.text, cfi: 'epubcfi(/6/10!/4/2/1:19)', context: PASSAGE.context }),
      metadata: async () => ({
        title: 'Computer Architecture',
        authors: ['J. Hennessy', 'D. Patterson'],
        language: 'en',
        identifier: 'urn:isbn:0000',
      }),
    },
    net: {
      fetch: async (url, init) => {
        fetches.push({ url, init })
        return respond(url, init)
      },
    },
    lookups: { register: (id, h) => void lookups.set(id, h) },
    commands: { register: (id, h) => void commands.set(id, h) },
    files: { save: async (o) => void saved.push(o) },
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(EXT + 'main.js', 'utf8'), ctx, { filename: 'main.js' })
  if (noticed && settings && settings.provider) {
    const p = ctx.Explain.PRESETS[settings.provider]
    if (p) storage.set('noticed', JSON.stringify([p.host]))
  }
  const explain = (request = PASSAGE, signal = new AbortController().signal) =>
    lookups.get('explain')(request, { signal })
  return { ctx, Explain: ctx.Explain, storage, fetches, explain, commands, saved, warnings }
}

/** A recorded response from tests/recordings/<preset>/<name>.json. */
export function recording(preset, name) {
  return JSON.parse(
    readFileSync(new URL(`./recordings/${preset}/${name}.json`, import.meta.url), 'utf8'),
  )
}

/** The JSON the model is asked for: a typical good answer. */
export const MODEL_ANSWER = {
  status: 'ok',
  term: 'invalidate · 使失效',
  meaning: '这里指一个核心写入时，让其他核心缓存中同一行的副本作废，之后读取必须重新获取。',
  qualifier: '',
  details: [
    { label: 'Sentence structure', text: '“A write … invalidates the copies”: the write is the subject.' },
    { label: 'Why this reading', text: 'The passage is about cache coherence, not about logic.' },
  ],
  missing: '',
}
