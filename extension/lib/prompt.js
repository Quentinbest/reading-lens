// EX4, EX5: what Explain asks the model, and the shape it asks for. The prompt names
// the reader's language; the standard Chinese term is asked for whenever the selection
// is a technical term (spec 4.2: “a headword line with the Chinese term”).
'use strict'
;(function (root) {
  const E = (root.Explain = root.Explain || {})

  const LANGUAGES = {
    'zh-Hans': 'Simplified Chinese',
    'zh-Hant': 'Traditional Chinese',
    ja: 'Japanese',
    es: 'Spanish',
    en: 'English',
  }
  E.languageName = (tag) => LANGUAGES[tag] || LANGUAGES[String(tag).split('-')[0]] || 'English'

  /** EX5 (prov.): the meaning's length, in characters, by the answer's language. */
  E.meaningLimit = (tag) => (/^(zh|ja)/.test(String(tag)) ? 120 : 300)

  E.system = function (language) {
    const lang = E.languageName(language)
    return [
      'You help a reader understand a passage of an English technical book.',
      `Answer in ${lang}. Reply with one JSON object and nothing else, in this shape:`,
      '{"status": "ok" or "needs_context", "term": string, "meaning": string, "qualifier": string, "details": [{"label": string, "text": string}], "missing": string}',
      'Rules:',
      '- "meaning": what the selected text means in this passage, at most two sentences' +
        ` (at most ${E.meaningLimit(language)} characters). Not a dictionary definition: the sense here.`,
      '- "term": the selection in its base form; when it is a technical term, add " · " and the standard Simplified Chinese term (for example "invalidate · 使失效"). At most 50 characters. Empty when neither applies.',
      '- "qualifier": only when the passage is ambiguous or the context is missing something, say so in one short sentence; otherwise "".',
      '- "details": at most 3 items, each a short label and one or two sentences: the sentence structure, why this reading, other uses of the word. [] when nothing is worth adding.',
      '- "status": "needs_context" when the passage does not settle the meaning; then "missing" says what is missing in one sentence, and "meaning" is your best reading with that said. Never guess silently.',
      '- No percentages, no confidence or probability numbers. If you are unsure, say “I think” once.',
      '- Plain text only: no markdown, no HTML.',
    ].join('\n')
  }

  /** The user message: the selection, its context and the book (EP3: nothing else). */
  E.userMessage = function ({ text, context, book }) {
    const lines = []
    if (book && book.title) lines.push(`Book: ${book.title}${book.authors ? ` by ${book.authors}` : ''}`)
    if (context && context.chapter) lines.push(`Chapter: ${context.chapter}`)
    lines.push(`Passage: ${[context.before, context.sentence, context.after].filter(Boolean).join(' ')}`)
    lines.push(`Selected: ${text}`)
    return lines.join('\n')
  }
})(typeof self !== 'undefined' ? self : globalThis)
