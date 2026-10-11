// The offline check's kit (G2): CSV, the statistics, items, blind sheets and scoring,
// on made-up data. No network.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { clopperPearsonUpper, krippendorffNominal, parseCsv, shuffle, toCsv } from '../offline/lib.mjs'
import { score } from '../offline/score.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' })

describe('statistics', () => {
  it('the one-sided 95% Clopper–Pearson bound matches item 59’s examples', () => {
    assert.ok(clopperPearsonUpper(0, 60) <= 0.05, '60 items, no severe error: passes')
    assert.ok(clopperPearsonUpper(1, 60) > 0.05, '60 items, one: fails')
    assert.ok(clopperPearsonUpper(1, 120) <= 0.05, '120 items, one: passes')
    assert.ok(clopperPearsonUpper(2, 120) > 0.05, '120 items, two: fails')
    assert.equal(clopperPearsonUpper(0, 60).toFixed(4), '0.0487') // 1 − 0.05^(1/60)
  })

  it('Krippendorff’s α matches the published nominal example (0.743)', () => {
    const d = [
      [1, 1, null, 1], [2, 2, 3, 2], [3, 3, 3, 3], [3, 3, 3, 3], [2, 2, 2, 2], [1, 2, 3, 4],
      [4, 4, 4, 4], [1, 1, 2, 1], [2, 2, 2, 2], [null, 5, 5, 5], [null, null, 1, 1], [null, null, 3, null],
    ]
    assert.equal(krippendorffNominal(d).toFixed(3), '0.743')
    assert.equal(krippendorffNominal([['y', 'y'], ['n', 'n'], ['n', 'n']]), 1)
  })

  it('CSV round-trips quotes, commas and newlines; a seeded shuffle repeats', () => {
    const rows = [{ a: 'x, "y"', b: 'line\nbreak' }, { a: '', b: '中文' }]
    assert.deepEqual(parseCsv(toCsv(['a', 'b'], rows)), rows)
    assert.deepEqual(shuffle([1, 2, 3, 4, 5], 9), shuffle([1, 2, 3, 4, 5], 9))
  })
})

describe('G2 scoring (item 87)', () => {
  const sheet = (n, severeAt = [], disagreeAt = []) => {
    const key = Array.from({ length: n }, (_, i) => ({ answer_id: `R${i}`, item: `i${i}`, model: 'deepseek:x', ms: '1500' }))
    const mk = (who) =>
      key.map((k, i) => {
        const severe = severeAt.includes(i) && !(who === 'b' && disagreeAt.includes(i))
        return { answer_id: k.answer_id, verdict: severe ? 'wrong' : 'correct', severe: severe ? 'y' : 'n' }
      })
    return { key, a: mk('a'), b: mk('b') }
  }

  it('60 answers, none severe, reviewers agreeing: G2 passes', () => {
    const r = score(sheet(60))
    assert.equal(r.models['deepseek:x'].g2, 'pass')
  })

  it('one severe answer in 60 fails, even if only one reviewer marked it', () => {
    const r = score(sheet(60, [5, 20, 40, 50], [5]))
    assert.equal(r.models['deepseek:x'].either, 4)
    assert.equal(r.models['deepseek:x'].both, 3)
    assert.equal(r.models['deepseek:x'].g2, 'fail')
  })

  it('agreement under .67: no rate may be used', () => {
    const r = score(sheet(80, [1, 2, 3, 4], [1, 2, 3, 4]))
    assert.ok(r.alphaSevere < 0.67)
    assert.equal(r.agreed, false)
    assert.equal(r.models['deepseek:x'].g2, 'fail')
  })

  it('fewer than 60 answers can’t pass', () => {
    assert.equal(score(sheet(59)).models['deepseek:x'].g2, 'fail')
  })

  it('refuses incomplete or inconsistent scoring', () => {
    const s = sheet(3)
    s.a[0].verdict = ''
    s.b[1].severe = 'y' // severe needs wrong
    const r = score(s)
    assert.equal(r.ok, false)
    assert.equal(r.problems.length, 2)
  })
})

describe('items, sheets and scoring, end to end', () => {
  it('local stuck points become items without the reader; sheets are blind; scoring reads them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-offline-'))
    const rows = [
      { reader: 'Ann', book: 'Caches', id: 'a1', created: '', quote: 'invalidates', before: 'A write on one core', after: 'the copies held by others.', note: 'Eudic: wrong sense', type: 'L2', noticed: 'y', tool: 'Eudic', failed: 'y', dict_right_sense: 'n', dict_first: 'n' },
      { reader: 'Ann', book: 'Caches', id: 'a2', created: '', quote: 'slow', before: '', after: '', note: 'tired', type: 'G', noticed: 'y', tool: '', failed: 'n', dict_right_sense: 'na', dict_first: 'na' },
      { reader: 'Bo', book: 'Nets', id: 'b1', created: '', quote: 'back pressure', before: 'Queues fill and', after: 'slows the senders.', note: 'asked chat', type: 'L4', noticed: 'y', tool: 'chat', failed: 'n', dict_right_sense: 'na', dict_first: 'na' },
    ]
    const cols = Object.keys(rows[0])
    writeFileSync(join(dir, 'ann.csv'), toCsv(cols, rows.slice(0, 2)))
    writeFileSync(join(dir, 'bo.csv'), toCsv(cols, rows.slice(2)))
    const itemsOut = node('offline/items.mjs', join(dir, 'ann.csv'), join(dir, 'bo.csv'), '-o', join(dir, 'items.json'))
    assert.match(itemsOut, /2 local items from 2 readers \(1 other/)
    const { items } = JSON.parse(readFileSync(join(dir, 'items.json'), 'utf8'))
    assert.equal(items.length, 2)
    assert.ok(!JSON.stringify(items).includes('Ann') && !JSON.stringify(items).includes('Eudic'), 'no reader, no note')

    // The run refuses the export's short context, and without --send-book-text.
    assert.throws(() => node('offline/run.mjs', join(dir, 'items.json'), '--model', 'ollama:x', '-o', join(dir, 'a.jsonl')), /send-book-text/)
    assert.throws(
      () => node('offline/run.mjs', join(dir, 'items.json'), '--model', 'ollama:x', '-o', join(dir, 'a.jsonl'), '--send-book-text'),
      /short context/,
    )

    // Answers as run.mjs writes them, for two models.
    const answers = items.flatMap((it) =>
      ['deepseek:deepseek-flash', 'qwen:qwen3.8-flash'].map((model) => ({
        item: it.id,
        model,
        ms: 1500,
        http: 200,
        answer: { status: 'ok', headword: it.text, meaning: `meaning of ${it.text}`, source: { kind: 'ai', name: 'Explain', model } },
      })),
    )
    answers.push({ item: items[0].id, model: 'gemini:x', ms: 0, http: 500, answer: { status: 'error', error: 'unavailable' } })
    writeFileSync(join(dir, 'answers.jsonl'), answers.map((a) => JSON.stringify(a)).join('\n') + '\n')
    const out = join(dir, 'sheets')
    assert.match(node('offline/sheets.mjs', join(dir, 'items.json'), join(dir, 'answers.jsonl'), '--out', out), /4 answers to score/)
    const a = parseCsv(readFileSync(join(out, 'reviewer-A.csv'), 'utf8'))
    const b = parseCsv(readFileSync(join(out, 'reviewer-B.csv'), 'utf8'))
    const key = parseCsv(readFileSync(join(out, 'key.csv'), 'utf8'))
    assert.equal(a.length, 4)
    assert.ok(!readFileSync(join(out, 'reviewer-A.csv'), 'utf8').includes('deepseek'), 'the model is hidden')
    assert.deepEqual(new Set(a.map((r) => r.answer_id)), new Set(key.map((r) => r.answer_id)))
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'errors.json'), 'utf8')), { 'gemini:x': 1 })

    for (const r of [...a, ...b]) Object.assign(r, { verdict: 'correct', severe: 'n' })
    const cols2 = Object.keys(a[0])
    writeFileSync(join(out, 'reviewer-A.csv'), toCsv(cols2, a))
    writeFileSync(join(out, 'reviewer-B.csv'), toCsv(cols2, b))
    const report = node('offline/score.mjs', out)
    assert.match(report, /deepseek:deepseek-flash: n = 2 \(under 60\).*G2 fail/)
  })
})
