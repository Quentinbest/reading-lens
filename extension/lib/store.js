// Explain's settings, the hosts the reader has seen a notice for (EX8), the session
// cache (EX9) and the opt-in study log (EX10). Settings and the log live in the
// extension's own storage; the cache lives in memory and ends with the Worker.
'use strict'
;(function (root) {
  const E = (root.Explain = root.Explain || {})

  async function json(key, fallback) {
    try {
      const v = await linen.storage.get(key)
      return v ? JSON.parse(v) : fallback
    } catch {
      return fallback
    }
  }

  /** { provider: preset key or null, models: { [preset]: model }, studyLog: boolean } */
  E.settings = async function () {
    const s = await json('settings', {})
    return {
      provider: E.PRESETS[s.provider] ? s.provider : null,
      models: s.models && typeof s.models === 'object' ? s.models : {},
      studyLog: s.studyLog === true,
    }
  }
  E.modelFor = (settings, key) =>
    String(settings.models[key] || E.PRESETS[key].model || '').trim()

  E.noticed = async (host) => (await json('noticed', [])).includes(host)
  E.markNoticed = async function (host) {
    const list = await json('noticed', [])
    if (!list.includes(host)) list.push(host)
    await linen.storage.set('noticed', JSON.stringify(list))
  }

  // EX9: one session, keyed by the book, the place, the words, the provider, the model
  // and the language. Nothing persists.
  const cache = new Map()
  const CACHE_MAX = 200
  E.cacheKey = (parts) => JSON.stringify(parts)
  E.cacheGet = (k) => cache.get(k)
  E.cachePut = function (k, v) {
    cache.delete(k)
    cache.set(k, v)
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  }

  // EX10: the study log, off by default. Never the text: lengths, times and outcomes.
  const LOG_MAX = 5000
  E.logEntry = async function (settings, entry) {
    if (!settings.studyLog) return
    const log = await json('log', [])
    log.push(entry)
    while (log.length > LOG_MAX) log.shift()
    await linen.storage.set('log', JSON.stringify(log))
  }
  E.log = () => json('log', [])
})(typeof self !== 'undefined' ? self : globalThis)
