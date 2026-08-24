import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// #141 kept coming back in new places because there was no single answer to "how do I put
// a number on screen". There is one now — formatNumber — and this is what stops a
// fourteenth way appearing.
//
// It looks for a weight being rendered straight into JSX text: `{displayWeight(...)}`
// with no formatter around it. That is the exact shape that produced "last: 173,1" beside
// a hero reading "173.1" on the same card.
//
// What it deliberately does NOT flag, because localising these breaks things:
//   - `value=` / `placeholder=` / `set…(String(…))` — an input's buffer is canonical
//   - `weight: displayWeight(…)` — chart series data, which must stay numbers
//   - anything inside an SVG path template
// Those are all assignments or attributes rather than JSX text, so the pattern below
// only matches a `{`-delimited render.
const ROOT = join(__dirname, '..', '..', '..', '..')
const DIRS = ['mobile/src', 'mobile/app', 'web/src']
const CODE = /\.tsx$/
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

// `{displayWeight(` or `{round1(` opening a JSX expression, not preceded by a formatter.
const RAW_RENDER = /\{\s*(?:displayWeight|round1)\(/

function sources(dir: string): string[] {
  let out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(sources(p))
    else if (CODE.test(e.name) && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

it('renders every user-facing weight through the shared formatter', () => {
  const offenders: string[] = []
  for (const dir of DIRS) {
    for (const file of sources(join(ROOT, dir))) {
      const body = readFileSync(file, 'utf8')
      body.split('\n').forEach((line, i) => {
        if (!RAW_RENDER.test(line)) return
        // `{formatNumber(displayWeight(…))}` is the correct form and must not trip.
        if (/formatNumber\(|toLocaleText\(/.test(line)) return
        offenders.push(`${file.slice(ROOT.length + 1).replace(/\\/g, '/')}:${i + 1}`)
      })
    }
  }
  expect(offenders).toEqual([])
})
