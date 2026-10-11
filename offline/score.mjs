// Step 5: G2 from the two reviewers' sheets (item 59; the rubric is item 87).
// Agreement first: Krippendorff's α on `severe` must be at least .67. Then, per model,
// the severe-misleading rate (an answer counts when either reviewer marks it) and its
// one-sided 95% Clopper–Pearson upper bound; G2 passes for a model when the bound is
// at most 5%.
//
//   node offline/score.mjs DIR            (reads DIR/key.csv, reviewer-A.csv, reviewer-B.csv)
import { readFileSync, writeFileSync } from 'node:fs'
import { clopperPearsonUpper, krippendorffNominal, parseCsv } from './lib.mjs'

export const ALPHA_MIN = 0.67
export const BOUND_MAX = 0.05
const VERDICTS = new Set(['correct', 'partly', 'wrong'])

export function score({ key, a, b }) {
  const problems = []
  const byId = (rows, who) => {
    const m = new Map()
    for (const r of rows) {
      const v = String(r.verdict || '').trim().toLowerCase()
      const s = String(r.severe || '').trim().toLowerCase()
      if (!VERDICTS.has(v)) problems.push(`${who} ${r.answer_id}: verdict “${r.verdict}”`)
      if (s !== 'y' && s !== 'n') problems.push(`${who} ${r.answer_id}: severe “${r.severe}”`)
      if (s === 'y' && v !== 'wrong') problems.push(`${who} ${r.answer_id}: severe needs verdict wrong`)
      m.set(r.answer_id, { verdict: v, severe: s })
    }
    return m
  }
  const A = byId(a, 'reviewer A')
  const B = byId(b, 'reviewer B')
  for (const k of key)
    if (!A.has(k.answer_id) || !B.has(k.answer_id)) problems.push(`${k.answer_id}: not scored by both`)
  if (problems.length) return { ok: false, problems }

  const alphaSevere = krippendorffNominal(key.map((k) => [A.get(k.answer_id).severe, B.get(k.answer_id).severe]))
  const alphaVerdict = krippendorffNominal(key.map((k) => [A.get(k.answer_id).verdict, B.get(k.answer_id).verdict]))
  const models = {}
  for (const k of key) {
    const m = (models[k.model] ||= { n: 0, either: 0, both: 0, verdicts: { correct: 0, partly: 0, wrong: 0 }, ms: [] })
    const sa = A.get(k.answer_id).severe === 'y'
    const sb = B.get(k.answer_id).severe === 'y'
    m.n++
    if (sa || sb) m.either++
    if (sa && sb) m.both++
    for (const r of [A, B]) m.verdicts[r.get(k.answer_id).verdict] += 0.5
    m.ms.push(Number(k.ms) || 0)
  }
  const agreed = alphaSevere >= ALPHA_MIN
  for (const m of Object.values(models)) {
    m.rate = m.either / m.n
    m.bothRate = m.both / m.n
    m.upper = clopperPearsonUpper(m.either, m.n)
    m.enough = m.n >= 60
    m.g2 = agreed && m.enough && m.upper <= BOUND_MAX ? 'pass' : 'fail'
    const sorted = [...m.ms].sort((x, y) => x - y)
    m.p95ms = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0
    delete m.ms
  }
  return { ok: true, alphaSevere, alphaVerdict, agreed, models }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: node offline/score.mjs DIR')
    process.exit(2)
  }
  const read = (f) => parseCsv(readFileSync(`${dir}/${f}`, 'utf8'))
  const r = score({ key: read('key.csv'), a: read('reviewer-A.csv'), b: read('reviewer-B.csv') })
  if (!r.ok) {
    console.error(`Not scored yet:\n${r.problems.slice(0, 30).join('\n')}`)
    process.exit(1)
  }
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  const lines = [
    `Agreement: α(severe) = ${r.alphaSevere.toFixed(3)} (needs ≥ ${ALPHA_MIN}), α(verdict) = ${r.alphaVerdict.toFixed(3)}`,
    r.agreed ? '' : 'Agreement is below .67: no rate may be used (G2 fails until the reviewers re-score).',
  ]
  for (const [model, m] of Object.entries(r.models))
    lines.push(
      `${model}: n = ${m.n}${m.enough ? '' : ' (under 60)'}; severe (either) ${m.either} = ${pct(m.rate)}, upper 95% bound ${pct(m.upper)}; both ${m.both} = ${pct(m.bothRate)}; verdicts ${JSON.stringify(m.verdicts)}; p95 ${m.p95ms} ms → G2 ${m.g2}`,
    )
  console.log(lines.filter(Boolean).join('\n'))
  writeFileSync(`${dir}/g2.json`, JSON.stringify(r, null, 1) + '\n')
}
