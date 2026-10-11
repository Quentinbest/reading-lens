# Providers: what Explain sends where, and why each preset looks as it does

Checked on **2026-10-11** against each provider's documentation and policy pages. Providers change their models, endpoints and terms; check again before relying on this, and before any distribution of Explain (Reading Lens Gate 3).

## API facts

| Preset | Endpoint | Key header (added by Linen) | Default model | Notes |
|---|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/chat/completions` | `Authorization: Bearer` | `deepseek-flash` | OpenAI chat format; `response_format: json_object` needs the word “json” in the prompt. **Thinking is on by default** and is turned off (`thinking: { type: "disabled" }`) to stay within Linen's 10 s budget. Errors: 400, 401, 402 (no balance), 422, 429, 500, 503. JSON mode can occasionally return empty content. |
| Qwen (international) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | `Authorization: Bearer` | `qwen3.8-flash` | OpenAI-compatible mode; `enable_thinking: false`. Alibaba now recommends per-workspace domains (`{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`), but Linen's optional hosts must be declared exactly, so Explain uses the shared domain, which Alibaba says still works. Keys are per region: a Singapore key. |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer` | `gpt-6-luna` | A reasoning model: `reasoning_effort: "none"`, `max_completion_tokens`, no `temperature`. |
| Anthropic | `https://api.anthropic.com/v1/messages` | `x-api-key` | `claude-haiku-5-5` | `anthropic-version: 2023-06-01`; Messages API; the JSON shape is asked for in the system prompt. |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `x-goog-api-key` | `gemini-3.5-flash-lite` | `generationConfig.responseMimeType: application/json`. Flash-Lite's thinking defaults to minimal. Gemini 2.5 models have restricted access. |
| Ollama on this Mac | `http://localhost:11434/api/chat` | none | (the reader's) | `format: "json"`, `stream: false`, `think: false`. Connection refused means Ollama isn't running; 404 means the model isn't pulled (O17). |

Each reader can change the model in Explain's options; the default is only a starting point.

## Live captures

| Preset | Date | Result |
|---|---|---|
| DeepSeek | 2026-10-11 | `deepseek-flash`, HTTP 200 in 1.7 s, thinking off (no reasoning tokens), a valid answer with the term “invalidate · 使失效”. Recorded in `tests/recordings/deepseek/live.json` and replayed by the tests |

## What each first-request notice says (EX8)

Each notice names what is sent (the selection, its sentence with one on each side, at most 1,200 characters, and the book's title, author and chapter) and the host, then one sentence from the provider's own policy. Only what the policy pages say plainly is in a notice.

| Preset | The notice's sentence | Source |
|---|---|---|
| DeepSeek | “DeepSeek is a company in China. Its privacy policy says it stores data on servers in the People's Republic of China.” | [DeepSeek privacy policy](https://chat.deepseek.com/downloads/DeepSeek%20Privacy%20Policy.html) |
| Qwen | “Alibaba Cloud Model Studio, international edition. Alibaba Cloud says it stores this edition's data in Singapore, may run the model in other regions outside mainland China, and doesn't use your data to train models.” | [Model Studio overview and FAQ](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) |
| OpenAI | “OpenAI says it doesn't train on API data unless you opt in, and keeps abuse-monitoring logs, which can include requests, for up to 30 days.” | [Your data](https://developers.openai.com/api/docs/guides/your-data) |
| Anthropic | “Anthropic's commercial terms say it doesn't train models on API content.” | [Commercial terms](https://www.anthropic.com/legal/commercial-terms) |
| Gemini | “Google says that on the Gemini API's free tier it may use what you send to improve its products, and people may review it; on a paid account it doesn't.” | [Gemini API additional terms](https://ai.google.dev/gemini-api/terms) |
| Ollama | “Ollama runs on this Mac: the request doesn't leave it.” | — |

## Not confirmed (left out of the notices)

- **DeepSeek API:** whether API requests are used for training, and how long they are kept. The consumer policy covers the app; secondary sources disagree about the API. Ask DeepSeek in writing before relying on either.
- **Anthropic:** the API retention period (sources say 7 or 30 days). The notice says nothing about retention.
- **Alibaba Cloud:** a retention period for prompts and answers.
- **All:** whether sending excerpts of a purchased book fits the publisher's personal-use terms (spec 4.11): the owner's call, or counsel's.
