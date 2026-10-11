// Step 4: blind sheets for the two reviewers. Every answer gets a random ID; the model
// behind it is only in key.csv, which the reviewers don't see. Each reviewer gets the
// answers in a different order. Errors (no answer) aren't scored; they're counted.
//
//   node offline/sheets.mjs items.json answers.jsonl --out DIR [--seed 1]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { shuffle, toCsv } from './lib.mjs'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const [itemsFile, answersFile] = args
const dir = opt('--out')
const seed = Number(opt('--seed') || 1)
if (!itemsFile || !answersFile || !dir) {
  console.error('usage: node offline/sheets.mjs items.json answers.jsonl --out DIR [--seed 1]')
  process.exit(2)
}

const items = new Map(JSON.parse(readFileSync(itemsFile, 'utf8')).items.map((it) => [it.id, it]))
const answers = readFileSync(answersFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))

const scored = []
const errors = {}
for (const [n, a] of answers.entries()) {
  const ok = a.answer && (a.answer.status === 'ok' || a.answer.status === 'needs_context')
  if (!ok) {
    errors[a.model] = (errors[a.model] || 0) + 1
    continue
  }
  scored.push({ ...a, aid: `A${String(n + 1).padStart(4, '0')}` })
}
const ids = shuffle(
  scored.map((s) => s.aid),
  seed * 7919,
)
// Answer IDs in a random order, so they don't reveal the run's order or model.
const blindId = new Map(ids.map((aid, i) => [aid, `R${String(i + 1).padStart(4, '0')}`]))

const row = (s) => {
  const it = items.get(s.item)
  const a = s.answer
  return {
    answer_id: blindId.get(s.aid),
    passage: [it.context.before, it.context.sentence, it.context.after].filter(Boolean).join(' '),
    selected: it.text,
    term: a.term || '',
    meaning: a.meaning || '',
    qualifier: a.qualifier || '',
    needs_context: a.status === 'needs_context' ? `yes: ${a.missing || ''}` : '',
    more: (a.details || []).map((d) => `${d.label}: ${d.text}`).join('\n'),
    verdict: '',
    severe: '',
    term_ok: '',
    comment: '',
  }
}
const COLUMNS = [
  'answer_id',
  'passage',
  'selected',
  'term',
  'meaning',
  'qualifier',
  'needs_context',
  'more',
  'verdict',
  'severe',
  'term_ok',
  'comment',
]
mkdirSync(dir, { recursive: true })
for (const [r, name] of [
  [1, 'reviewer-A.csv'],
  [2, 'reviewer-B.csv'],
])
  writeFileSync(`${dir}/${name}`, toCsv(COLUMNS, shuffle(scored, seed * 31 + r).map(row)))
writeFileSync(
  `${dir}/key.csv`,
  toCsv(
    ['answer_id', 'item', 'model', 'type', 'ms'],
    scored.map((s) => ({
      answer_id: blindId.get(s.aid),
      item: s.item,
      model: s.model,
      type: items.get(s.item).type,
      ms: s.ms,
    })),
  ),
)
writeFileSync(`${dir}/errors.json`, JSON.stringify(errors, null, 1) + '\n')
console.log(
  `${scored.length} answers to score → ${dir}/reviewer-A.csv, reviewer-B.csv (keep key.csv from the reviewers); errors not scored: ${JSON.stringify(errors)}`,
)
