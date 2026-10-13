// §6.9 provider contract tests: recorded responses for each preset replayed through
// net.fetch, the error mapping, and Linen's limits. No test reaches a real provider.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { load, recording, PASSAGE, MODEL_ANSWER } from './harness.mjs'
import { validate } from './linen-validate.mjs'

const PRESETS = ['deepseek', 'qwen', 'openai', 'anthropic', 'gemini', 'ollama']
const settingsFor = (provider) => ({
  provider,
  models: provider === 'ollama' ? { ollama: 'qwen3' } : {},
  studyLog: false,
})
const replay = (preset, name) => () => recording(preset, name)

for (const preset of PRESETS) {
  describe(`${preset}: replayed responses`, () => {
    it('an answer becomes the peek’s fields, labelled with its model (LK2, EQ1)', async () => {
      const x = load({ settings: settingsFor(preset), respond: replay(preset, 'ok') })
      const a = validate(await x.explain())
      assert.equal(a.status, 'ok')
      assert.equal(a.headword, 'invalidates')
      assert.equal(a.term, MODEL_ANSWER.term)
      assert.equal(a.meaning, MODEL_ANSWER.meaning)
      assert.equal(a.details.length, 2)
      assert.equal(a.source.kind, 'ai')
      assert.equal(a.source.model, preset === 'ollama' ? 'qwen3' : x.Explain.PRESETS[preset].model)
      assert.equal(x.fetches.length, 1, 'one request per explanation (EX3)')
    })

    it('the request goes to the preset’s host, asks for JSON, and names the key only by name (EX3, LK7)', async () => {
      const x = load({ settings: settingsFor(preset), respond: replay(preset, 'ok') })
      await x.explain()
      const { url, init } = x.fetches[0]
      const p = x.Explain.PRESETS[preset]
      assert.equal(new URL(url).host, p.host)
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['content-type'], 'application/json')
      for (const h of Object.keys(init.headers))
        assert.ok(!/^(authorization|x-api-key|x-goog-api-key|cookie|host)$/i.test(h), h)
      // Objects from the Worker's context: compare their JSON.
      if (p.scheme)
        assert.deepEqual(JSON.parse(JSON.stringify(init.auth)), { secret: `${preset}-key`, scheme: p.scheme })
      else assert.equal(init.auth, undefined)
      const body = JSON.parse(init.body)
      const asked = JSON.stringify(body)
      assert.match(asked, /JSON/)
      assert.match(asked, /Simplified Chinese/)
      assert.ok(asked.includes(PASSAGE.context.sentence), 'the sentence is sent')
      assert.ok(asked.includes('Computer Architecture'), 'the title is sent')
      if (preset === 'deepseek') assert.deepEqual(body.thinking, { type: 'disabled' })
      if (preset === 'openai') assert.equal(body.reasoning_effort, 'none')
      if (preset === 'gemini') assert.equal(body.generationConfig.responseMimeType, 'application/json')
      if (preset === 'ollama') assert.equal(body.stream, false)
    })

    it('reads a fenced JSON answer', async () => {
      const x = load({ settings: settingsFor(preset), respond: replay(preset, 'fenced') })
      assert.equal(validate(await x.explain()).meaning, MODEL_ANSWER.meaning)
    })

    for (const [name, kind] of [
      ['non-json', 'unavailable'],
      ['partial', 'unavailable'],
      ['empty', 'unavailable'],
      ['401', 'unauthorized'],
      ['403', 'unauthorized'],
      ['404', 'not_configured'],
      ['429', 'rate_limited'],
      ['429-retry-after', 'rate_limited'],
      ['500', 'unavailable'],
      ['captive-portal', 'offline'],
    ])
      it(`${name} shows “${kind}”`, async () => {
        const x = load({ settings: settingsFor(preset), respond: replay(preset, name) })
        const a = validate(await x.explain())
        assert.equal(a.status, 'error')
        assert.equal(a.error, kind)
      })
  })
}

describe('live captures (scripts/live-check.mjs --record)', () => {
  for (const preset of PRESETS) {
    const file = new URL(`./recordings/${preset}/live.json`, import.meta.url)
    it(`${preset}: a captured answer still reads`, { skip: !existsSync(file) && 'no live capture yet' }, async () => {
      const x = load({ settings: settingsFor(preset), respond: replay(preset, 'live') })
      assert.notEqual(validate(await x.explain()).status, 'error')
    })
  }
})

describe('network failures (§6.9, O17)', () => {
  const fail = (message) => () => {
    throw new Error(message)
  }
  for (const [what, message, kind, preset] of [
    ['DNS', 'the request failed: Dns Failed: resolve dns name', 'offline', 'deepseek'],
    ['TLS', 'the request failed: Connection Failed: tls connection init failed', 'offline', 'anthropic'],
    // Linen gives up after 8 s (read-book Q5): a slow provider, not a lost connection.
    ['a timeout', 'the request failed: Network Error: timed out reading response', 'unavailable', 'gemini'],
    ['a connect timeout', 'the request failed: Connection Failed: Connect error: connection timed out', 'unavailable', 'deepseek'],
    ['Ollama not running', 'the request failed: Connection Failed: Connect error: Connection refused (os error 61)', 'unavailable', 'ollama'],
    ['a host the reader removed', 'not allowed to connect to https://api.openai.com/v1/chat/completions', 'not_configured', 'openai'],
  ])
    it(`${what} shows “${kind}”`, async () => {
      const x = load({ settings: settingsFor(preset), respond: fail(message) })
      const a = validate(await x.explain())
      assert.equal(a.error, kind)
    })

  it('a key Linen couldn’t read stays Linen’s own failure (LK7-keychain-denied)', async () => {
    const x = load({ respond: fail('key-unavailable: deepseek-key') })
    await assert.rejects(x.explain(), /key-unavailable/)
  })
})

describe('not set up (Open options)', () => {
  for (const [what, opts] of [
    ['no provider', { settings: { provider: null, models: {}, studyLog: false } }],
    ['the host not allowed', { granted: false }],
    ['no key', { secret: false }],
    ['Ollama without a model', { settings: { provider: 'ollama', models: {}, studyLog: false } }],
  ])
    it(`${what}: not_configured, and nothing is sent`, async () => {
      const x = load(opts)
      const a = validate(await x.explain())
      assert.equal(a.error, 'not_configured')
      assert.equal(x.fetches.length, 0)
    })

  it('Ollama needs no key', async () => {
    const x = load({ settings: settingsFor('ollama'), secret: false, respond: replay('ollama', 'ok') })
    assert.equal(validate(await x.explain()).status, 'ok')
  })
})

describe('the first request to a host (EX8)', () => {
  for (const preset of PRESETS)
    it(`${preset}: a notice first, then Continue sends, and later requests don’t ask again`, async () => {
      const x = load({ settings: settingsFor(preset), noticed: false, respond: replay(preset, 'ok') })
      const n = validate(await x.explain())
      assert.equal(n.status, 'notice')
      assert.equal(n.notice.host, x.Explain.PRESETS[preset].host)
      assert.match(n.notice.text, /sentence/)
      assert.match(n.notice.text, new RegExp(x.Explain.PRESETS[preset].host.replace(/\./g, '\\.')))
      assert.equal(x.fetches.length, 0, 'nothing before Continue')
      assert.equal(validate(await x.explain({ ...PASSAGE, acknowledged: true })).status, 'ok')
      assert.equal(validate(await x.explain({ ...PASSAGE, text: 'copies' })).status, 'ok')
      assert.equal(x.fetches.length, 2)
    })
})

describe('honesty and limits (EQ2–EQ4, EX5, EX6)', () => {
  const answering = (obj) => () => ({
    status: 200,
    content_type: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
  })

  it('a sentence giving a score is dropped, so the peek can show the rest (EQ2)', async () => {
    const x = load({
      respond: answering({ ...MODEL_ANSWER, meaning: '指让其他副本作废。 I am 90% confident.', qualifier: 'Confidence: high.' }),
    })
    const a = validate(await x.explain())
    assert.equal(a.meaning, '指让其他副本作废。')
    assert.equal(a.qualifier, undefined)
  })

  it('markup and markdown are taken out', async () => {
    const x = load({ respond: answering({ ...MODEL_ANSWER, meaning: '<b>作废</b> **其他**副本。' }) })
    assert.equal(validate(await x.explain()).meaning, '作废 其他副本。')
  })

  it('the meaning is at most 120 characters in Chinese, ending on a sentence (EX5)', async () => {
    const long = '这是一个很长的句子。'.repeat(30)
    const x = load({ respond: answering({ ...MODEL_ANSWER, meaning: long }) })
    const a = validate(await x.explain())
    assert.ok(a.meaning.length <= 120)
    assert.ok(a.meaning.endsWith('。'))
  })

  it('at most three details; the headword line within 60 characters (EX5)', async () => {
    const x = load({
      respond: answering({
        ...MODEL_ANSWER,
        term: 'x'.repeat(80),
        details: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, text: 't' })),
      }),
    })
    const a = validate(await x.explain())
    assert.equal(a.details.length, 3)
    assert.ok(a.headword.length + (a.term || '').length <= 60)
  })

  it('needs_context says what is missing (EQ4)', async () => {
    const x = load({
      respond: answering({ ...MODEL_ANSWER, status: 'needs_context', missing: 'The paragraph doesn’t say which cache.' }),
    })
    const a = validate(await x.explain())
    assert.equal(a.status, 'needs_context')
    assert.equal(a.missing, 'The paragraph doesn’t say which cache.')
  })

  it('What was sent is the exact request without the key, and the host (EX6)', async () => {
    const x = load({ respond: answering(MODEL_ANSWER) })
    const a = validate(await x.explain())
    const { url, init } = x.fetches[0]
    assert.ok(a.sent.startsWith(`POST ${url}`))
    assert.ok(a.sent.includes(JSON.stringify(JSON.parse(init.body), null, 1)))
    assert.match(a.sent, /bearer key added by Linen/)
  })

  it('code in the selection survives (Linen shows What was sent as text)', async () => {
    const x = load({ respond: answering(MODEL_ANSWER) })
    const a = validate(await x.explain({ ...PASSAGE, text: 'Vec<T>' }))
    assert.equal(a.headword, 'Vec<T>')
  })

  it('a percentage in the selection is the book’s, not a score', async () => {
    const x = load({ respond: answering(MODEL_ANSWER) })
    const a = validate(await x.explain({ ...PASSAGE, text: '50% of the lines' }))
    assert.equal(a.headword, '50% of the lines')
  })
})

describe('session cache (EX9) and cancel (LK4)', () => {
  it('the same passage, provider, model and language is asked once', async () => {
    const x = load({ respond: replay('deepseek', 'ok') })
    await x.explain()
    await x.explain()
    assert.equal(x.fetches.length, 1)
    await x.explain({ ...PASSAGE, language: 'en' })
    assert.equal(x.fetches.length, 2)
  })

  it('an answer for a cancelled lookup is dropped', async () => {
    const ac = new AbortController()
    const x = load({
      respond: () => {
        ac.abort()
        return recording('deepseek', 'ok')
      },
    })
    assert.equal(await x.explain(PASSAGE, ac.signal), null)
  })
})

describe('study log (EX10)', () => {
  it('is off by default', async () => {
    const x = load({ respond: replay('deepseek', 'ok') })
    await x.explain()
    assert.equal(x.storage.has('log'), false)
  })

  it('when on, keeps lengths, times and outcomes, never the text, and exports through the save dialog', async () => {
    const x = load({
      settings: { provider: 'deepseek', models: {}, studyLog: true },
      respond: replay('deepseek', 'ok'),
    })
    await x.explain()
    const log = JSON.parse(x.storage.get('log'))
    assert.equal(log.length, 1)
    assert.equal(log[0].outcome, 'ok')
    assert.equal(log[0].words, 1)
    assert.ok(!JSON.stringify(log).includes('invalidates'))
    await x.commands.get('export-log')()
    assert.equal(x.saved.length, 1)
    assert.equal(x.saved[0].suggestedName, 'explain-study-log.json')
  })
})
