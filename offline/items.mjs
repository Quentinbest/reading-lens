// Step 1: the offline check's items from the coded diary sheets (read-book
// scripts/reading-lens/g0.py; docs/offline-run.md). Every local stuck point (L2, L3,
// L4, S1, S2) becomes an item; the reader's name and note stay behind.
//
//   node offline/items.mjs SHEET.csv... -o items.json
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseCsv } from './lib.mjs'

const LOCAL = new Set(['L2', 'L3', 'L4', 'S1', 'S2'])
const args = process.argv.slice(2)
const o = args.indexOf('-o')
const out = o >= 0 ? args[o + 1] : null
const sheets = args.filter((a, i) => a !== '-o' && i !== o + 1)
if (!out || !sheets.length) {
  console.error('usage: node offline/items.mjs SHEET.csv... -o items.json')
  process.exit(2)
}

const items = []
const readers = new Set()
let skipped = 0
for (const file of sheets)
  for (const row of parseCsv(readFileSync(file, 'utf8'))) {
    const type = String(row.type || '').trim().toUpperCase()
    if (!LOCAL.has(type)) {
      skipped++
      continue
    }
    readers.add(row.reader)
    const id = createHash('sha256').update(`${row.reader}\u0000${row.id}`).digest('hex').slice(0, 10)
    items.push({
      id,
      type,
      noticed: String(row.noticed || '').trim().toLowerCase(),
      book: row.book,
      text: String(row.quote || '').trim(),
      // The export keeps 32 characters on each side (Linen's anchoring context). Explain
      // in the app sends the sentence and one on each side: widen these from the book
      // before the run (docs/offline-run.md, step 2); run.mjs refuses short ones.
      context: {
        before: String(row.before || '').trim(),
        sentence: String(row.quote || '').trim(),
        after: String(row.after || '').trim(),
        paragraph: '',
        chapter: '',
        selection: { start: 0, end: String(row.quote || '').trim().length },
      },
    })
  }

writeFileSync(out, JSON.stringify({ made: new Date().toISOString(), items }, null, 1) + '\n')
console.log(
  `${items.length} local items from ${readers.size} readers (${skipped} other stuck points left out) → ${out}`,
)
if (items.length < 60) console.log('note: G2 needs at least 60 items (item 59).')
console.log(
  "next: widen each item's context.before and context.after to the sentence and one sentence on each side, from the book (docs/offline-run.md, step 2).",
)
