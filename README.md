# Explain for Linen

Explain tells you what the words you selected mean **in this passage**, in a peek under the text, from an AI provider you choose. It is the Explain extension of Reading Lens (read-book `docs/reading-lens-plan.md`, rules EX1–EX10), built against Linen's Host API 1.1.

**Private.** Explain is for personal use until the Reading Lens pilot passes (Gate 3, Decision 10-09). Keep it out of the public Linen repository until then.

## Install

```sh
npm run pack        # dist/explain-0.1.0.linenext
```

In Linen: Settings › Extensions › Install from file…, then choose the package. Explain asks only to read the text you select, see the book's title and author, and save the study log where you choose. It gets no network at install.

Then **Options…** on Explain's row:

1. **Provider:** DeepSeek, Qwen (international), OpenAI, Anthropic, Gemini, or Ollama on this Mac. Choosing one asks Linen to allow its address.
2. **Model:** the preset's default, or any model the provider offers. Use a model that answers without long reasoning: Linen gives a lookup 10 seconds.
3. **Add key…:** typed into Linen's own dialog and kept in your Mac's Keychain. Explain never sees it; Linen adds it only to requests to that provider's address. Ollama needs no key.

Select a passage (up to 40 words, in an English book), then ⋯ › **Explain**, or ⌘K. The first time, the peek says what will be sent and where; nothing goes out until you choose Continue.

## What it sends

The selected text, its sentence with one sentence on each side (at most 1,200 characters, from the same chapter), and the book's title, author and chapter label. Never other chapters, highlights or notes. **What was sent** in the peek shows the exact request. See `docs/providers.md` for what each provider says it does with it.

## The study log (EX10)

Off by default. When on (Options…), Explain keeps lengths, times and outcomes of each explanation, never the text, in its own storage on this Mac. Export it with ⌘K › Export Explain Study Log.

## Development

```sh
npm test            # contract tests (§6.9): recorded responses for every preset, no network
npm run check       # scripts parse; manifest, presets and notices agree
npm run pack        # the package
DEEPSEEK_API_KEY=… npm run live           # one fixed sentence to DeepSeek (never book text)
DEEPSEEK_API_KEY=… npm run live -- deepseek --record   # also save tests/recordings/deepseek/live.json
```

**Trying it in Linen without any provider:** run `node scripts/fake-ollama.mjs`, choose “Ollama on this Mac” in Explain's options with any model name, and Explain a passage. It answers with a fixed explanation and sends nothing anywhere. `--slow` shows Linen's timeout state; `--missing` shows “not set up” (the model isn't installed).

The code is plain scripts loaded into Linen's Worker (`extension/main.js` with `importScripts`). `tests/harness.mjs` runs the same files with a fake `linen`; `tests/linen-validate.mjs` is a port of Linen's answer validator, so every answer is checked as the peek would check it. `tests/recordings/make.mjs` writes the replayed responses from each provider's documented shape.

## Known limits (v0.1)

- **The answer's language** follows the peek's language menu: Linen's UI language, then macOS's preferred languages, then English (Linen item 86, read-book #25). Add 简体中文 to macOS's preferred languages to get “Explain · 简体中文” with Linen in English. The Chinese term is asked for either way.
- **No Test connection** in Options yet: an options page can't make requests through Linen. The first Explain shows any setup error, with Open options.
- **Outcomes the peek keeps** (expanded, copied, “Helped / Wrong”) don't reach extensions, so the study log records only answered, needs context, cancelled and errors.
- **Retry-After** isn't exposed by `net.fetch`; a 429 shows “limiting requests” either way.
