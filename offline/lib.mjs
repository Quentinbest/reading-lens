// Shared pieces of the offline check (Reading Lens Stage 3, G2): CSV, a seeded shuffle,
// the Clopper–Pearson bound and Krippendorff's α. No dependencies.

/** RFC 4180 CSV: rows of objects keyed by the header. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '')
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

export function toCsv(columns, rows) {
  const q = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => q(r[c])).join(','))].join('\n') + '\n'
}

/** A seeded generator (mulberry32), so a shuffle can be repeated. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function shuffle(list, seed) {
  const r = rng(seed)
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** P(X <= x) for X ~ Binomial(n, p). */
function binomCdf(x, n, p) {
  if (x < 0) return 0
  if (x >= n) return 1
  // Sum in log space for stability.
  let logC = 0
  let sum = 0
  for (let k = 0; k <= x; k++) {
    if (k > 0) logC += Math.log(n - k + 1) - Math.log(k)
    sum += Math.exp(logC + k * Math.log(p) + (n - k) * Math.log1p(-p))
  }
  return Math.min(1, sum)
}

/**
 * The one-sided Clopper–Pearson upper bound at `level` for x events in n: the p at
 * which P(X <= x) = 1 − level. With x = 0 and n = 60 it is 4.87% at 95% (item 59:
 * “with 60 items that means no severe error”).
 */
export function clopperPearsonUpper(x, n, level = 0.95) {
  if (n <= 0) return 1
  if (x >= n) return 1
  const target = 1 - level
  let lo = x / n
  let hi = 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (binomCdf(x, n, mid) > target) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * Krippendorff's α for nominal values, any number of coders, missing values allowed:
 * `units` is a list of arrays, one value per coder ('' or null for missing).
 */
export function krippendorffNominal(units) {
  const coincidence = new Map()
  const add = (a, b, w) => {
    const k = `${a}\u0000${b}`
    coincidence.set(k, (coincidence.get(k) || 0) + w)
  }
  for (const u of units) {
    const vals = u.filter((v) => v !== '' && v != null)
    const m = vals.length
    if (m < 2) continue
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++) if (i !== j) add(vals[i], vals[j], 1 / (m - 1))
  }
  const totals = new Map()
  let n = 0
  for (const [k, w] of coincidence) {
    const a = k.split('\u0000')[0]
    totals.set(a, (totals.get(a) || 0) + w)
    n += w
  }
  if (n <= 1) return NaN
  let observed = 0
  for (const [k, w] of coincidence) {
    const [a, b] = k.split('\u0000')
    if (a !== b) observed += w
  }
  let expected = 0
  for (const [a, na] of totals) for (const [b, nb] of totals) if (a !== b) expected += na * nb
  expected /= n - 1
  if (expected === 0) return observed === 0 ? 1 : NaN
  return 1 - observed / expected
}
