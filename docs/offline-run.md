# The offline check (Reading Lens Stage 3, Gate 2)

Explain's answers on real stuck points from the Stage 1 diary, from two or three models, scored blind by two bilingual reviewers. Gate 2 (read-book `docs/decisions.md`, item 59): agreement α ≥ .67 on `severe` first; then, per model, the severe-misleading rate's **one-sided 95% Clopper–Pearson upper bound is at most 5%**, over at least 60 items. With 60 items that means no severe answer; with 120, one. The rubric below is read-book item 87, approved 2026-10-11.

**Privacy.** Items, answers and sheets hold book text and readers' words. Keep them outside every repository, this one included. Step 3 sends the items' text to the providers you name.

## 1. Items from the diary

When the diary week ends, the owner codes the readers' sheets (read-book `docs/reading-lens-stage1.md`, `scripts/reading-lens/g0.py`), then:

```sh
node offline/items.mjs ~/lens/sheets/*.csv -o ~/lens/items.json
```

Every local stuck point (L2, L3, L4, S1, S2) becomes an item with a random ID. The reader's name and note stay behind. Gate 2 needs at least 60.

## 2. Widen the context

The export keeps only 32 characters on each side of a highlight. Explain in the app sends the sentence and one sentence on each side, so the items need the same. In `items.json`, for each item, set `context.before` to the sentences before the highlight in its sentence plus the one before, and `context.after` to the rest of its sentence plus the one after, copied from the book (Linen's Search finds the passage). Keep `text` as it is. `run.mjs` refuses items whose context is still under 40 characters on either side.

## 3. The answers

Two or three models, chosen before the run. Keys come from the environment and are never written anywhere.

```sh
read -s DEEPSEEK_API_KEY && export DEEPSEEK_API_KEY
read -s DASHSCOPE_API_KEY && export DASHSCOPE_API_KEY
node offline/run.mjs ~/lens/items.json \
  --model deepseek:deepseek-flash --model qwen:qwen3.8-flash \
  -o ~/lens/answers.jsonl --send-book-text
```

It asks each model exactly as Explain does (the same prompt, adapters and answer rules), one request at a time, in Simplified Chinese (`--language` to change it). If it stops, run it again: it resumes. Failed requests are kept and counted, not scored.

## 4. Blind sheets

```sh
node offline/sheets.mjs ~/lens/items.json ~/lens/answers.jsonl --out ~/lens/g2
```

Send `reviewer-A.csv` to one reviewer and `reviewer-B.csv` to the other. Keep `key.csv`: it is the only place that says which model wrote which answer. Each reviewer gets the answers in a different order.

## 5. What the reviewers do

Each row is one answer to one passage. Read the passage, the selected words and the answer (term, meaning, qualifier, “needs more context”, More). Fill three columns, alone, without discussing:

| Column | Value | Meaning |
|---|---|---|
| `verdict` | `correct` | The meaning given is right for this passage. |
| | `partly` | Right, but vague or incomplete enough that a reader might still be unsure. |
| | `wrong` | The meaning given is wrong for this passage. |
| `severe` | `y` | Wrong **and** it shows no doubt: no qualifier, not marked “needs more context”. A reader would likely take the wrong meaning and read on. Only with `verdict` `wrong`. |
| | `n` | Anything else. A wrong answer that says it may be wrong, or asks for more context, is `n`. |
| `term_ok` | `ok`, `wrong`, `na` | The Chinese term, when there is one: is it the standard term for this sense? |
| `comment` | free text | Anything worth knowing, especially for `wrong`. |

Don't guess which model wrote an answer, and don't look anything up beyond what you'd normally need to judge the passage.

## 6. Gate 2

Put both completed sheets back in the folder, then:

```sh
node offline/score.mjs ~/lens/g2
```

It refuses incomplete or inconsistent scoring. Then it reports α on `severe` and on `verdict`. If α on `severe` is under .67, no rate may be used: the reviewers go over the rubric together on a few disagreements (without changing their earlier scores) and score a fresh set. Otherwise, per model: the answers scored, the severe count (**either reviewer**) with its rate and upper bound, the count both marked, the verdicts and the p95 time, and **G2 pass or fail**. It writes `g2.json` beside the sheets. Record the result, with the counts, in read-book `docs/decisions.md`.
