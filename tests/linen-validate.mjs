// A port of Linen's LK2 validator (read-book src/lib/lookup/result.ts, 2026-10-11), so
// the tests check every answer as the peek will. Keep it in step with that file.
const TOP = new Set(['status', 'headword', 'term', 'meaning', 'qualifier', 'details', 'source', 'sent', 'missing', 'error', 'notice'])
const SOURCE = new Set(['kind', 'name', 'model'])
const ERRORS = new Set(['offline', 'unauthorized', 'rate_limited', 'unavailable', 'not_configured'])
const SCORE = /\d\s*%|\bpercent\b|\bconfiden(?:ce|t)\b|\bprobabilit/i
const MARKUP = /<\/?[a-z!][^>]*>/i
const LIMITS = { headword: 200, term: 200, meaning: 2000, qualifier: 300, detailLabel: 60, detailText: 2000, details: 8, name: 60, model: 80, sent: 6000, missing: 300, noticeTitle: 120, noticeText: 600 }

function text(v, field, max, required, scored = true, prose = true) {
  if (v === undefined || v === null) {
    if (required) throw new Error(`${field} is missing`)
    return
  }
  if (typeof v !== 'string') throw new Error(`${field} is not text`)
  if (v.length > max) throw new Error(`${field} is longer than ${max}`)
  if (prose && MARKUP.test(v)) throw new Error(`${field} holds markup`)
  if (scored && SCORE.test(v)) throw new Error(`${field} holds a score`)
}

/** Throws with Linen's reason when the peek would refuse `r`. */
export function validate(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('not an object')
  for (const k of Object.keys(r)) if (!TOP.has(k)) throw new Error(`unknown field ${k}`)
  if (!['ok', 'needs_context', 'error', 'notice'].includes(r.status)) throw new Error('status')
  const s = r.source
  if (!s || typeof s !== 'object') throw new Error('source is missing')
  for (const k of Object.keys(s)) if (!SOURCE.has(k)) throw new Error(`source.${k}`)
  if (s.kind !== 'ai' && s.kind !== 'dictionary') throw new Error('source.kind')
  text(r.headword, 'headword', LIMITS.headword, true, false, false)
  text(r.meaning, 'meaning', LIMITS.meaning, r.status === 'ok')
  text(s.name, 'source.name', LIMITS.name, true)
  text(s.model, 'source.model', LIMITS.model, false)
  text(r.term, 'term', LIMITS.term, false)
  text(r.qualifier, 'qualifier', LIMITS.qualifier, false)
  text(r.sent, 'sent', LIMITS.sent, false, false, false)
  if (r.details !== undefined) {
    if (!Array.isArray(r.details) || r.details.length > LIMITS.details) throw new Error('details')
    for (const d of r.details) {
      for (const k of Object.keys(d)) if (k !== 'label' && k !== 'text') throw new Error(`details.${k}`)
      text(d.label, 'details.label', LIMITS.detailLabel, true)
      text(d.text, 'details.text', LIMITS.detailText, true)
    }
  }
  if (r.status === 'needs_context') text(r.missing, 'missing', LIMITS.missing, true)
  else if (r.missing !== undefined) throw new Error('missing outside needs_context')
  if (r.status === 'error') {
    if (!ERRORS.has(r.error)) throw new Error(`error ${r.error}`)
  } else if (r.error !== undefined) throw new Error('error outside status error')
  if (r.status === 'notice') {
    const n = r.notice
    if (!n) throw new Error('notice is missing')
    text(n.title, 'notice.title', LIMITS.noticeTitle, true)
    text(n.text, 'notice.text', LIMITS.noticeText, true)
    text(n.host, 'notice.host', 200, true)
  } else if (r.notice !== undefined) throw new Error('notice outside status notice')
  return r
}
