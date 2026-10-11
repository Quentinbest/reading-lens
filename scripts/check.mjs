// Static checks: every script parses, the manifest is what Linen expects, and the
// package holds no file Linen would refuse. Run in CI with the tests.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ext = fileURLToPath(new URL('../extension/', import.meta.url))
const problems = []
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = `${d}${f}`
    if (statSync(p).isDirectory()) walk(`${p}/`)
    else files.push(p.slice(ext.length))
  }
}
walk(ext)

for (const f of readdirSync(new URL('../offline/', import.meta.url)))
  try {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`../offline/${f}`, import.meta.url))], { stdio: 'pipe' })
  } catch (e) {
    problems.push(`offline/${f}: ${String(e.stderr)}`)
  }
for (const f of files.filter((f) => f.endsWith('.js')))
  try {
    execFileSync(process.execPath, ['--check', `${ext}${f}`], { stdio: 'pipe' })
  } catch (e) {
    problems.push(`${f}: ${String(e.stderr)}`)
  }

const m = JSON.parse(readFileSync(`${ext}manifest.json`, 'utf8'))
if (!/^\^1\.1/.test(m.engines?.linen)) problems.push('engines.linen must allow 1.1')
for (const p of m.optionalPermissions)
  if (!/^network:[a-z0-9.-]+(:\d+)?$/.test(p)) problems.push(`optional permission ${p}`)
if (m.permissions.includes('book.text')) problems.push('EX2: never book.text')
if (m.permissions.some((p) => p.startsWith('network:')))
  problems.push('EX2: hosts are optional, granted when the reader picks a provider')
for (const page of [m.contributes.options.page])
  if (!files.includes(page)) problems.push(`missing ${page}`)

// Every preset's host is declared, and nothing else is.
const ctx = {}
ctx.self = ctx
new Function('self', readFileSync(`${ext}lib/presets.js`, 'utf8'))(ctx)
const hosts = Object.values(ctx.Explain.PRESETS).map((p) => `network:${p.host}`)
if (JSON.stringify([...hosts].sort()) !== JSON.stringify([...m.optionalPermissions].sort()))
  problems.push(`optionalPermissions ${m.optionalPermissions} ≠ presets ${hosts}`)
for (const key of Object.keys(ctx.Explain.PRESETS)) {
  const n = ctx.Explain.noticeFor(key)
  if (n.title.length > 120 || n.text.length > 600) problems.push(`${key}: notice too long (${n.text.length})`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`check: ${files.length} files, manifest and presets agree`)
