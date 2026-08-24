import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// #141 kept coming back in new places because there was no single answer to "how do I put
// a number on screen". There is one now — formatNumber — and this stops a fourteenth way
// appearing.
//
// The first version of this guard required `displayWeight(` to sit immediately after the
// `{`, so `{Math.abs(displayWeight(delta, unit))}` walked straight past it — and two live
// examples did, on the same dashboard card whose hero had been converted. It also exempted
// a whole line if `formatNumber` appeared anywhere on it, so one correct render hid an
// incorrect one beside it. Both are fixed below: the call is matched anywhere inside a JSX
// expression or a template hole, and each occurrence is judged on its own wrapping.
//
// What it deliberately does NOT flag, because localising these breaks things:
//   - `value=` / `placeholder=` / `set…(String(…))` — an input's buffer is canonical
//   - `weight: displayWeight(…)` — chart series data, which must stay numbers
//   - SVG path builders, which use toFixed and must stay canonical
// Those are attributes or object properties rather than JSX text or template holes, so the
// contexts below don't reach them.
const ROOT = join(__dirname, '..', '..', '..', '..')
const DIRS = ['mobile/src', 'mobile/app', 'web/src', 'packages/shared/src']
const CODE = /\.tsx?$/
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

const CONVERTERS = /(?:displayWeight|round1|lbsToDisplay)\s*\(/g

// A `{ … }` JSX expression, or a `${ … }` hole in a template literal. Either is text a
// person reads.
const TEXT_CONTEXT = /(?:\$\{|\{)[^{}]*$/

// …but two shapes look identical to that and must stay canonical, so they are subtracted:
//
//   attribute      `value={…}`  `placeholder={…}`  `lastValue={…}`
//                  an input's buffer is canonical by design, and a chart prop wants a number
//   object property `{ weight: displayWeight(…) }`
//                  chart series data, which must stay numbers
//
// Both are recognised by what sits immediately before the brace or the call, which is why
// the guard tests the text preceding each occurrence rather than the whole line.
const ATTRIBUTE = /=\s*\{[^{}]*$/
const OBJECT_PROPERTY = /[{,]\s*[A-Za-z_$][\w$]*\s*:\s*[^{}]*$/

function sources(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(sources(p))
    else if (CODE.test(e.name) && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

describe('number display', () => {
  const files = DIRS.flatMap((d) => sources(join(ROOT, d)))

  // A guard that scans nothing passes for the wrong reason. readdirSync used to be
  // wrapped in a try/catch returning [], so an isolated package checkout produced a
  // green run over zero files.
  it('actually scans both apps and the shared package', () => {
    expect(files.length).toBeGreaterThan(100)
    for (const d of DIRS) {
      expect(files.some((f) => f.replace(/\\/g, '/').includes(d))).toBe(true)
    }
  })

  it('renders every user-facing weight through formatNumber', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(CONVERTERS)) {
            const before = line.slice(0, m.index)
            if (!TEXT_CONTEXT.test(before)) continue // not JSX text or a template hole
            if (ATTRIBUTE.test(before)) continue // an input buffer or a chart prop
            if (OBJECT_PROPERTY.test(before)) continue // chart series data
            if (/formatNumber\(\s*[^)]*$|toLocaleText\(\s*[^)]*$/.test(before)) continue
            // formatNumber may wrap it a level up: `{formatNumber(Math.abs(displayWeight(…)))}`
            if (/formatNumber\(/.test(before)) continue
            offenders.push(`${file.slice(ROOT.length + 1).replace(/\\/g, '/')}:${i + 1}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})
