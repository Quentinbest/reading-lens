// Writes the replayed responses (§6.9) for each preset. They follow each provider's
// documented response shape (docs/providers.md, checked 2026-10-11); none is a live
// capture yet. `node scripts/live-check.mjs` captures DeepSeek's real answer for a
// fixed sentence into tests/recordings/deepseek/live.json when a key is given.
//
//   node tests/recordings/make.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { MODEL_ANSWER } from '../harness.mjs'

const json = (o) => JSON.stringify(o)
const JSON_CT = 'application/json'
const content = json(MODEL_ANSWER)

const openai = (text, extra = {}) => ({
  id: 'chatcmpl-rec',
  object: 'chat.completion',
  model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 420, completion_tokens: 120, total_tokens: 540 },
  ...extra,
})
const shapes = {
  deepseek: (t) => openai(t),
  qwen: (t) => openai(t),
  openai: (t) => openai(t),
  anthropic: (t) => ({
    id: 'msg_rec',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: t == null ? [] : [{ type: 'text', text: t }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 420, output_tokens: 120 },
  }),
  gemini: (t) => ({
    candidates: [
      {
        content: { role: 'model', parts: t == null ? [] : [{ text: t }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 420, candidatesTokenCount: 120 },
  }),
  ollama: (t) => ({
    model: 'qwen3',
    created_at: '2026-10-11T00:00:00Z',
    message: { role: 'assistant', content: t == null ? '' : t },
    done: true,
    done_reason: 'stop',
  }),
}
const errorBody = {
  deepseek: (m, type) => json({ error: { message: m, type, code: null } }),
  qwen: (m, type) => json({ error: { message: m, type, code: type } }),
  openai: (m, type) => json({ error: { message: m, type, param: null, code: type } }),
  anthropic: (m, type) => json({ type: 'error', error: { type, message: m } }),
  gemini: (m, type) => json({ error: { code: 0, message: m, status: type } }),
  ollama: (m) => json({ error: m }),
}

for (const [preset, shape] of Object.entries(shapes)) {
  const dir = new URL(`./${preset}/`, import.meta.url)
  mkdirSync(dir, { recursive: true })
  const err = errorBody[preset]
  const files = {
    ok: { status: 200, content_type: JSON_CT, body: json(shape(content)) },
    // The model wrapped its JSON in a code fence: Explain still reads it.
    fenced: { status: 200, content_type: JSON_CT, body: json(shape('```json\n' + content + '\n```')) },
    // The model answered prose, not JSON.
    'non-json': { status: 200, content_type: JSON_CT, body: json(shape('It means to make stale.')) },
    // The provider's JSON cut off (a truncated body, as Linen's 5 MB cap would leave it).
    partial: { status: 200, content_type: JSON_CT, body: json(shape(content)).slice(0, 80) },
    // No text at all (DeepSeek documents occasional empty content in JSON mode).
    empty: { status: 200, content_type: JSON_CT, body: json(shape(null)) },
    401: { status: 401, content_type: JSON_CT, body: err('Invalid API key', 'authentication_error') },
    403: { status: 403, content_type: JSON_CT, body: err('Permission denied', 'permission_error') },
    404: {
      status: 404,
      content_type: JSON_CT,
      body: err(preset === 'ollama' ? "model 'qwen3' not found" : 'The model does not exist', 'not_found_error'),
    },
    429: { status: 429, content_type: JSON_CT, body: err('Rate limit reached', 'rate_limit_error') },
    '429-retry-after': {
      status: 429,
      content_type: JSON_CT,
      retry_after: '20',
      body: err('Rate limit reached', 'rate_limit_error'),
    },
    500: { status: 500, content_type: JSON_CT, body: err('Internal error', 'server_error') },
    // A hotel or airport network answering for the provider.
    'captive-portal': {
      status: 200,
      content_type: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><title>Sign in to Wi-Fi</title></head><body>Accept the terms</body></html>',
    },
  }
  for (const [name, v] of Object.entries(files))
    writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(v, null, 1) + '\n')
}
console.log('wrote tests/recordings')
