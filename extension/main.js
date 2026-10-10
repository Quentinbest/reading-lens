/* global linen, Explain */
// Explain (Reading Lens EX1–EX10): what the selected words mean in this passage, from
// the provider the reader chose, in the lookup peek. Nothing is sent until the reader
// chooses Explain (EP1), only to a host the reader allowed (EP2), and never with a key
// Explain can see (LK7).
'use strict'

importScripts('lib/presets.js', 'lib/prompt.js', 'lib/adapters.js', 'lib/answer.js', 'lib/store.js')

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length

async function explain(request, signal) {
  const settings = await Explain.settings()
  const key = settings.provider
  // Not set up: no provider, no model, the host not allowed or no key (Open options).
  if (!key) return { error: 'not_configured', detail: 'no provider' }
  const preset = Explain.PRESETS[key]
  const model = Explain.modelFor(settings, key)
  if (!model) return { error: 'not_configured', detail: 'no model' }
  if (!(await linen.permissions.has(preset.host)))
    return { error: 'not_configured', detail: 'host not allowed' }
  if (preset.scheme && !(await linen.secrets.has(Explain.secretName(key))))
    return { error: 'not_configured', detail: 'no key' }
  const source = { kind: 'ai', name: 'Explain', model }

  // EX8: the first request to each host waits for the reader's Continue.
  if (!(await Explain.noticed(preset.host))) {
    if (!request.acknowledged) return { notice: Explain.noticeFor(key), source, settings }
    await Explain.markNoticed(preset.host)
  }

  const [selection, meta] = await Promise.all([
    linen.book.selection(),
    linen.book.metadata().catch(() => null),
  ])
  const context = request.context
  const book = meta
    ? { title: meta.title, authors: (meta.authors || []).join(', '), id: meta.identifier || '' }
    : null
  const cacheKey = Explain.cacheKey([
    book && (book.id || book.title),
    selection && selection.cfi,
    request.text,
    key,
    model,
    request.language,
  ])
  const cached = Explain.cacheGet(cacheKey)
  if (cached) return { answer: cached, settings, cached: true }

  const messages = {
    system: Explain.system(request.language),
    user: Explain.userMessage({ text: request.text, context, book }),
  }
  const { url, init } = Explain.buildRequest(key, model, messages)
  // EX6: the exact request, without the key (Linen adds it), and where it went.
  const shownHeaders = Object.entries(init.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .concat(preset.scheme ? [`(${preset.scheme} key added by Linen)`] : [])
  const sent = [`POST ${url}`, ...shownHeaders, '', JSON.stringify(JSON.parse(init.body), null, 1)].join(
    '\n',
  )

  let res
  try {
    res = await linen.net.fetch(url, init)
  } catch (err) {
    const failure = Explain.fetchFailure(key, err) // rethrows Linen's key-unavailable
    return { error: failure.kind, detail: failure.detail, settings }
  }
  if (signal.aborted) return null
  try {
    const text = Explain.readResponse(key, res)
    const answer = Explain.toAnswer(Explain.parseModelJson(text), {
      headword: request.text,
      language: request.language,
      source,
      sent,
    })
    Explain.cachePut(cacheKey, answer)
    return { answer, settings }
  } catch (err) {
    if (err instanceof Explain.ProviderError) return { error: err.kind, detail: err.detail, settings }
    throw err
  }
}

linen.lookups.register('explain', async (request, { signal }) => {
  const started = Date.now()
  // Linen's own failures (a key it couldn't read, LK7) propagate as they are.
  const r = await explain(request, signal)
  const entry = (outcome) => ({
    t: new Date(started).toISOString(),
    chars: request.text.length,
    words: words(request.text),
    ms: Date.now() - started,
    outcome,
    provider: r && r.settings ? r.settings.provider : null,
    cached: !!(r && r.cached),
  })
  if (r === null || signal.aborted) {
    if (r && r.settings) await Explain.logEntry(r.settings, entry('cancelled'))
    return null
  }
  const headword = request.text
  if (r.notice) return { status: 'notice', headword, notice: r.notice, source: r.source }
  if (r.error) {
    if (r.settings) await Explain.logEntry(r.settings, entry(`error:${r.error}`))
    // For the extension's console only: never the text.
    if (r.detail) console.warn(`Explain: ${r.error} (${r.detail})`)
    return { status: 'error', headword, error: r.error, source: { kind: 'ai', name: 'Explain' } }
  }
  await Explain.logEntry(r.settings, entry(r.answer.status))
  return r.answer
})

// EX10: the study log leaves only through the save dialog (files.export).
linen.commands.register('export-log', async () => {
  const log = await Explain.log()
  await linen.files.save({
    suggestedName: 'explain-study-log.json',
    content: JSON.stringify({ exported: new Date().toISOString(), entries: log }, null, 1),
    type: 'application/json',
  })
})
