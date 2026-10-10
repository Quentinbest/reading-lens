// EX3: one request per explanation, through a small adapter per preset: the OpenAI
// chat format where the provider offers it, otherwise its own API. Each adapter builds
// the request (Linen adds the key: LK7) and reads the model's text back, or says which
// of the peek's failure states fits (§6.9, O17).
'use strict'
;(function (root) {
  const E = (root.Explain = root.Explain || {})

  /** A failure, as the peek words it: offline, unauthorized, rate_limited, unavailable, not_configured. */
  class ProviderError extends Error {
    constructor(kind, detail) {
      super(`${kind}: ${detail}`)
      this.kind = kind
      this.detail = detail
    }
  }
  E.ProviderError = ProviderError

  const MAX_TOKENS = 700

  /** The request for `messages` ({ system, user }), without the key. */
  E.buildRequest = function (key, model, { system, user }) {
    const p = E.PRESETS[key]
    const headers = { 'content-type': 'application/json', ...(p.headers || {}) }
    let url = p.url
    let body
    switch (p.format) {
      case 'openai':
        body = {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          max_tokens: MAX_TOKENS,
          ...(p.temperature == null ? {} : { temperature: p.temperature }),
          ...p.extra,
        }
        // OpenAI's newer models take max_completion_tokens instead.
        if (key === 'openai') {
          delete body.max_tokens
          body.max_completion_tokens = MAX_TOKENS
        }
        break
      case 'anthropic':
        body = {
          model,
          max_tokens: MAX_TOKENS,
          temperature: p.temperature,
          system,
          messages: [{ role: 'user', content: user }],
        }
        break
      case 'gemini':
        url = p.url.replace('{model}', encodeURIComponent(model))
        body = {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: p.temperature,
            maxOutputTokens: MAX_TOKENS,
            responseMimeType: 'application/json',
          },
        }
        break
      case 'ollama':
        body = {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          format: 'json',
          stream: false,
          think: false,
          options: { temperature: p.temperature },
        }
        break
      default:
        throw new Error(`unknown format ${p.format}`)
    }
    const init = { method: 'POST', headers, body: JSON.stringify(body) }
    if (p.scheme) init.auth = { secret: E.secretName(key), scheme: p.scheme }
    return { url, init }
  }

  /** What a refused or failed `net.fetch` means (it throws on network failures). */
  E.fetchFailure = function (key, err) {
    const m = String((err && err.message) || err)
    if (/^key-unavailable/.test(m)) throw err // Linen's own state (LK7-keychain-denied)
    if (/not allowed to connect|can't be sent to/.test(m))
      return new ProviderError('not_configured', 'the host is not allowed')
    // O17: Ollama not running on this Mac.
    if (key === 'ollama' && /refused|connect/i.test(m))
      return new ProviderError('unavailable', 'Ollama isn’t running on this Mac')
    return new ProviderError('offline', m.slice(0, 200))
  }

  function errorMessage(body) {
    try {
      const j = JSON.parse(body)
      const e = j.error
      return String((e && (e.message || e)) || j.message || '').slice(0, 200)
    } catch {
      return ''
    }
  }

  /** The model's text from a response, or a ProviderError. */
  E.readResponse = function (key, res) {
    const status = res.status
    const body = typeof res.body === 'string' ? res.body : ''
    if (status === 401 || status === 403)
      throw new ProviderError('unauthorized', errorMessage(body) || `HTTP ${status}`)
    if (status === 429) throw new ProviderError('rate_limited', errorMessage(body) || 'HTTP 429')
    // O17: a model the provider doesn't have (Ollama: not installed).
    if (status === 404) throw new ProviderError('not_configured', errorMessage(body) || 'HTTP 404')
    if ((status === 400 || status === 422) && /model/i.test(errorMessage(body)))
      throw new ProviderError('not_configured', errorMessage(body))
    // DeepSeek: 402, the account has no balance.
    if (status >= 400) throw new ProviderError('unavailable', errorMessage(body) || `HTTP ${status}`)
    // A captive portal's page, or anything but JSON, is not the provider answering.
    const ct = String(res.content_type || '')
    if (!/json/i.test(ct) || /^\s*</.test(body))
      throw new ProviderError('offline', `not JSON (${ct || 'no content type'})`)
    let j
    try {
      j = JSON.parse(body)
    } catch {
      throw new ProviderError('unavailable', 'the response is not JSON')
    }
    let text
    switch (E.PRESETS[key].format) {
      case 'openai':
        text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
        break
      case 'anthropic':
        text = Array.isArray(j.content)
          ? j.content
              .filter((c) => c && c.type === 'text')
              .map((c) => c.text)
              .join('')
          : undefined
        break
      case 'gemini': {
        const parts =
          j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
        text = Array.isArray(parts)
          ? parts
              .filter((x) => !x.thought)
              .map((x) => x.text || '')
              .join('')
          : undefined
        break
      }
      case 'ollama':
        text = j.message && j.message.content
        break
    }
    if (typeof text !== 'string' || !text.trim())
      throw new ProviderError('unavailable', 'the model returned no text')
    return text
  }
})(typeof self !== 'undefined' ? self : globalThis)
