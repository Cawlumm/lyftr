import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// The companion to numberDisplay.guard.test.ts. That one guards the way OUT — a number
// reaching the screen. This guards the way IN — text arriving from a keyboard.
//
// #143 fixed one of the three copies of the sanitize logic that existed at the time, and
// the bug looked fixed right up until a device typed "22,5" into one of the other two and
// got 222575. Auditing the fields by hand found no fourth copy, but an audit is a fact
// about one afternoon; this is the same fact enforced on every push.
//
// The rule: a field that takes a number goes through useNumericField, which is the only
// place allowed to call sanitizeNumericInput. Nothing else in either app may.
const ROOT = join(__dirname, '..', '..', '..', '..')
const DIRS = ['mobile/src', 'mobile/app', 'web/src']
const CODE = /\.tsx?$/
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

function walk(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (CODE.test(e.name) && !e.name.includes('.test.')) out.push(rel)
  }
  return out
}

const files = walk(DIRS[0]).concat(...DIRS.slice(1).map((d) => walk(d)))

describe('numeric input goes through one seam', () => {
  it('scans the app source', () => {
    // A broken path would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(100)
  })

  it('no numeric keyboard is declared outside useNumericField', () => {
    // React Native gives no way to filter keys — ReactEditText replaces Android's
    // KeyListener specifically to permit all input through — so a numeric keyboardType is
    // exactly the signal that this field's text needs sanitizing. The hook supplies the
    // keyboardType itself, so a literal one means the field was wired by hand.
    const offenders = files.filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8')
      return /keyboardType\s*=\s*["{']?\s*['"]?(number-pad|decimal-pad|numeric|decimal)/.test(src)
    })
    expect(offenders).toEqual([])
  })

  it('sanitizeNumericInput is called only by the hook', () => {
    // Calling it directly is how the three divergent copies happened: each site also had
    // to remember the buffer (so "12." survives) and toLocaleText (so a comma is drawn).
    // Two of the three forgot at least one.
    // The call, not the name — the cells' comments explain why the rule is what it is.
    const offenders = files.filter((f) => /sanitizeNumericInput\s*\(/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('toLocaleText is not used to fill a field value', () => {
    // toLocaleText belongs on the way to the screen. Inside `value={…}` it means the field
    // is keeping a localised buffer, which double-converts the moment the hook draws it.
    // (A localised `placeholder=` is fine and deliberate — it is never parsed back.)
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      if (/\bvalue\s*=\s*\{[^}]*toLocaleText\s*\(/.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
