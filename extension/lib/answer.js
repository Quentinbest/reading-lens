// LK2, EX5, EQ2–EQ4: the model's JSON, made into the peek's fixed fields. Linen
// refuses an answer with markup, a percentage or a confidence score, so they are taken
// out here first; what can't be repaired is reported as `unavailable`.
'use strict'
;(function (root) {
  const E = (root.Explain = root.Explain || {})

  // The same tests Linen applies (read-book src/lib/lookup/result.ts).
  const SCORE = /\d\s*%|\bpercent\b|\bconfiden(?:ce|t)\b|\bprobabilit/i
  const MARKUP = /<\/?[a-z!][^>]*>/gi

  const SENTENCE = /[^.!?。！？]+[.!?。！？]*\s*/g

  function plain(v) {
    return String(v == null ? '' : v)
      .replace(MARKUP, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** EQ2: drop any sentence that gives a score. */
  function unscored(s) {
    if (!SCORE.test(s)) return s
    return (s.match(SENTENCE) || [s])
      .filter((x) => !SCORE.test(x))
      .join('')
      .trim()
  }

  /** At most `max` characters, ending at a sentence where it can. */
  function clip(s, max) {
    if (s.length <= max) return s
    const cut = s.slice(0, max)
    const end = Math.max(...['.', '。', '!', '！', '?', '？'].map((c) => cut.lastIndexOf(c)))
    return end > max / 2 ? cut.slice(0, end + 1) : cut.slice(0, max - 1) + '…'
  }

  /** The model's reply as JSON: tolerate a code fence or text around the object. */
  E.parseModelJson = function (text) {
    const t = String(text).trim()
    try {
      return JSON.parse(t)
    } catch {
      const a = t.indexOf('{')
      const b = t.lastIndexOf('}')
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(t.slice(a, b + 1))
        } catch {
          /* fall through */
        }
      }
      throw new E.ProviderError('unavailable', 'the model’s answer is not JSON')
    }
  }

  /** The LK2 answer for `headword` from the model's object. */
  E.toAnswer = function (obj, { headword, language, source, sent }) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj))
      throw new E.ProviderError('unavailable', 'the model’s answer is not an object')
    const meaning = clip(unscored(plain(obj.meaning)), E.meaningLimit(language))
    if (!meaning) throw new E.ProviderError('unavailable', 'the answer has no meaning')
    const status = obj.status === 'needs_context' ? 'needs_context' : 'ok'
    const answer = {
      status,
      // The reader's own selection, as it is: Linen shows it as text (`Vec<T>` stays).
      headword: clip(String(headword).replace(/\s+/g, ' ').trim(), 60),
      meaning,
      source,
    }
    // EX5: the headword line, word and term, within 60 characters.
    const term = clip(unscored(plain(obj.term)), Math.max(0, 60 - answer.headword.length))
    if (term && term !== answer.headword) answer.term = term
    // EQ3: a qualifier that changes the meaning stays in the first layer.
    const qualifier = clip(unscored(plain(obj.qualifier)), 300)
    if (qualifier) answer.qualifier = qualifier
    const details = (Array.isArray(obj.details) ? obj.details : [])
      .map((d) => ({
        label: clip(unscored(plain(d && d.label)), 60),
        text: clip(unscored(plain(d && d.text)), 600),
      }))
      .filter((d) => d.label && d.text)
      .slice(0, 3)
    if (details.length) answer.details = details
    // EQ4: needs_context says what is missing.
    if (status === 'needs_context')
      answer.missing =
        clip(unscored(plain(obj.missing)), 300) || 'The passage doesn’t settle the meaning.'
    if (sent) answer.sent = sent.slice(0, 6000)
    return answer
  }
})(typeof self !== 'undefined' ? self : globalThis)
