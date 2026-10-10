// The six provider presets (Reading Lens Stage 0, decided 2026-10-09). Endpoints,
// models and auth were checked against each provider's documentation on 2026-10-11
// (docs/providers.md); the notices (EX8) say only what each provider's own policy
// says, on the same date.
'use strict'
;(function (root) {
  const E = (root.Explain = root.Explain || {})

  /** What every request carries (EX4, spec 4.2), named once for every notice. */
  const SENT =
    'the text you selected, its sentence with one sentence on each side (at most 1,200 characters), and the book’s title, author and chapter'

  E.PRESETS = Object.freeze({
    deepseek: {
      name: 'DeepSeek',
      host: 'api.deepseek.com',
      url: 'https://api.deepseek.com/chat/completions',
      format: 'openai',
      scheme: 'bearer',
      model: 'deepseek-flash',
      // Thinking is on by default and would not fit the 10 s budget (LK10).
      extra: { thinking: { type: 'disabled' } },
      temperature: 0.3,
      notice:
        'DeepSeek is a company in China. Its privacy policy says it stores data on servers in the People’s Republic of China.',
    },
    qwen: {
      name: 'Qwen (international)',
      // The shared Singapore domain: the per-workspace ones can't be declared ahead.
      host: 'dashscope-intl.aliyuncs.com',
      url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      format: 'openai',
      scheme: 'bearer',
      model: 'qwen3.8-flash',
      extra: { enable_thinking: false },
      temperature: 0.3,
      notice:
        'Alibaba Cloud Model Studio, international edition. Alibaba Cloud says it stores this edition’s data in Singapore, may run the model in other regions outside mainland China, and doesn’t use your data to train models.',
    },
    openai: {
      name: 'OpenAI',
      host: 'api.openai.com',
      url: 'https://api.openai.com/v1/chat/completions',
      format: 'openai',
      scheme: 'bearer',
      model: 'gpt-6-luna',
      // A reasoning model: no reasoning keeps it fast, and it takes no temperature.
      extra: { reasoning_effort: 'none' },
      temperature: null,
      notice:
        'OpenAI says it doesn’t train on API data unless you opt in, and keeps abuse-monitoring logs, which can include requests, for up to 30 days.',
    },
    anthropic: {
      name: 'Anthropic',
      host: 'api.anthropic.com',
      url: 'https://api.anthropic.com/v1/messages',
      format: 'anthropic',
      scheme: 'x-api-key',
      headers: { 'anthropic-version': '2023-06-01' },
      model: 'claude-haiku-5-5',
      extra: {},
      temperature: 0.3,
      notice: 'Anthropic’s commercial terms say it doesn’t train models on API content.',
    },
    gemini: {
      name: 'Gemini',
      host: 'generativelanguage.googleapis.com',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
      format: 'gemini',
      scheme: 'x-goog-api-key',
      model: 'gemini-3.5-flash-lite',
      extra: {},
      temperature: 0.3,
      notice:
        'Google says that on the Gemini API’s free tier it may use what you send to improve its products, and people may review it; on a paid account it doesn’t.',
    },
    ollama: {
      name: 'Ollama on this Mac',
      host: 'localhost:11434',
      url: 'http://localhost:11434/api/chat',
      format: 'ollama',
      scheme: null,
      model: '',
      extra: {},
      temperature: 0.3,
      notice: 'Ollama runs on this Mac: the request doesn’t leave it.',
    },
  })

  E.PRESET_ORDER = ['deepseek', 'qwen', 'openai', 'anthropic', 'gemini', 'ollama']

  /** EX8: the notice before the first request to a preset's host. */
  E.noticeFor = function (key) {
    const p = E.PRESETS[key]
    return {
      title: `Explain sends text to ${p.name}`,
      text: `To explain this, Explain sends ${SENT} to ${p.host}. ${p.notice} Nothing is sent until you choose Continue.`,
      host: p.host,
    }
  }

  /** The key's name in Linen's Keychain store, one per preset. */
  E.secretName = (key) => `${key}-key`
})(typeof self !== 'undefined' ? self : globalThis)
