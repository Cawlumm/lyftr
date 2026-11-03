// Fails when the exported web bundle outgrows mobile/perf-budget.json. The one place
// the budget is read; CI runs this and nothing else compares sizes.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const budget = JSON.parse(readFileSync(join(root, 'perf-budget.json'), 'utf8'))

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const gz = (p) => gzipSync(readFileSync(p)).length
const js = walk(dist).filter((p) => p.endsWith('.js'))
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entryRel = html.match(/_expo\/static\/js\/web\/entry-[^"]*\.js/)?.[0]
if (!entryRel) {
  console.error('no entry bundle referenced in dist/index.html')
  process.exit(1)
}

const measured = {
  entryGzipBytes: gz(join(dist, entryRel)),
  totalJsGzipBytes: js.reduce((n, p) => n + gz(p), 0),
}

let failed = false
const rows = ['| Metric | Measured (gzip bytes) | Budget | Status |', '|---|---:|---:|---|']
for (const [key, value] of Object.entries(measured)) {
  const limit = budget[key]
  const ok = value <= limit
  failed ||= !ok
  rows.push(`| ${key} | ${value} | ${limit} | ${ok ? 'ok' : 'OVER'} |`)
  if (!ok) console.error(`${key}: ${value} exceeds budget ${limit} (+${value - limit})`)
}
console.log(rows.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs')
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Web bundle budget\n\n${rows.join('\n')}\n`)
}
process.exit(failed ? 1 : 0)
