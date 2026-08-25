import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// The widest of the three number guards. numberDisplay.guard.test.ts knows the weight
// converters and the .weight/.volume series reads; this one starts from the other end and
// asks of every number drawn as text: did it go through the shared formatter?
//
// It exists because four hand-audits each found something the previous one could not see.
// Math.round/toFixed caught the first sweep, bare property reads caught servings, Math.abs
// caught the weight delta chip, and following a variable into packages/shared caught
// numericRange. Each was a different SHAPE, so a guard that enumerates shapes is always one
// shape behind. This one inverts the default: numeric-looking text is a failure unless it
// is formatted, is machinery, or is listed below with a reason.
const ROOT = join(__dirname, '..', '..', '..', '..')
const DIRS = ['mobile/app', 'mobile/src', 'web/src']
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist', '.playwright-mcp'])

const SAFE = /formatNumber|toLocaleText|targetWeightLabel|compact\(|numericRange|restLabel/

/** Producers of a number that a person then reads. */
const NUMERIC = new RegExp(
  [
    String.raw`Math\.(?:round|abs|min|max|floor|ceil)\s*\(`,
    String.raw`\.toFixed\s*\(`,
    String.raw`\.(?:weight|volume|calories|protein|carbs|fat|fiber|servings|target|remaining|change|delta|pct)\b`,
    String.raw`\b(?:totalCals|totalVolume|totalWeight|exVol|calTarget|displayW|displayDelta|maxTotal|mealCals|pct)\b`,
  ].join('|'),
)

// Whole-line exemptions, kept deliberately narrow. `style=` sat here once and quietly
// disabled the guard across most of mobile, because nearly every <AppText> carries a style
// prop — so every numeric render inside one was skipped and the guard looked clean. A line
// is exempt only when the line ITSELF is the machinery.
const MACHINERY_LINE = new RegExp(
  [
    String.raw`[MLC]\$\{`, // an SVG path command being assembled
    String.raw`linePath|areaPath|\.join\(' '\)`,
    String.raw`style\.\w+\s*=`, // el.style.width = …
  ].join('|'),
)

/** Judged on the expression, so a styled element is still inspected. */
const MACHINERY_EXPR = new RegExp(
  [
    String.raw`^\s*\{`, // a style object passed as a child
    String.raw`width:|height:|transform|opacity|translate|scale`,
    String.raw`toISOString|padStart|getTime|\.length\b`,
    String.raw`fmtClock|formatElapsed|\bformat\(`, // clocks and dates are not decimals
  ].join('|'),
)

// Raw renders that stay, each with its reason. Adding an entry is a deliberate act;
// forgetting to format something is not. They share one property: the value cannot carry a
// decimal separator, being whole by construction, and grouping is opt-in per the doctrine —
// so a bare integer reads identically in every locale.
const ALLOWED: { file: string; contains: string; why: string }[] = [
  { file: 'mobile/app/(tabs)/index.tsx', contains: '{d.value} · {pct}%', why: 'muscle split: set count and a rounded share' },
  { file: 'mobile/src/components/dashboard/DashboardCharts.tsx', contains: '{selSlice.d.value}', why: 'donut slice: a set count' },
  { file: 'mobile/src/components/dashboard/DashboardCharts.tsx', contains: '{total}', why: 'donut centre: total sets' },
  { file: 'mobile/src/components/workouts/ExerciseDetailScreen.tsx', contains: '{pr.reps}', why: 'reps are whole' },
  { file: 'mobile/app/(tabs)/nutrition/log.tsx', contains: '{pct}%', why: 'macro bar share, Math.round just above' },
  { file: 'web/src/pages/LogFood.tsx', contains: '{pct}%', why: 'macro bar share, Math.round just above' },
  { file: 'web/src/pages/AddWorkout.tsx', contains: 'formData.duration % 60', why: 'the m of an h:m split' },
  { file: 'web/src/pages/EditWorkout.tsx', contains: 'formData.duration % 60', why: 'the m of an h:m split' },
  { file: 'web/src/pages/Dashboard.tsx', contains: 'totalMuscSets', why: 'set counts and their share, both whole' },
  { file: 'web/src/pages/Dashboard.tsx', contains: '{d.value} · {pct}%', why: 'muscle split, same render as mobile — set count and rounded share' },
]

const files: string[] = []
const walk = (dir: string) => {
  let entries
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) files.push(rel)
  }
}
DIRS.forEach(walk)

/** Code, not prose: a spread, a statement, a callback, a SCREAMING_CASE lookup. */
const IS_CODE = /^\s*\.\.\.|;|=>|[A-Z][A-Z_]{2,}\.|^\s*[A-Za-z_$][\w$]*\s*:|,\s*[A-Za-z_$][\w$]*\s*:/

/** JSX children and template holes — text a person reads. */
function textHoles(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(/\$\{([^{}]+)\}/g)) {
    if (IS_CODE.test(m[1])) continue
    // A ${…} inside key={`…`} or aria-label={`…`} is not text, and the attribute check
    // below cannot see it because the hole sits inside the template. So find the backtick
    // that opened the template and ask what precedes it: `={` means the whole thing is an
    // attribute value. Structural, so it covers every attribute rather than the few
    // anyone thought to name.
    // `={` is an attribute (key={`…`}); a bare `:` is an object property, which is how
    // style={{ width: `${pct}%` }} arrives — geometry, not prose.
    const openedAt = line.lastIndexOf('`', m.index)
    if (openedAt > 0 && /[:=]\s*\{?\s*$/.test(line.slice(0, openedAt))) continue
    out.push(m[1])
  }
  for (const m of line.matchAll(/\{([^{}]+)\}/g)) {
    // An arrow contains '>', so strip arrows before asking whether a JSX tag closed.
    const before = line.slice(0, m.index).replace(/=>/g, '')
    if (/=\s*$/.test(before)) continue // an attribute value
    if (/[{,]\s*[A-Za-z_$][\w$]*\s*:\s*$/.test(before)) continue // an object property
    if (IS_CODE.test(m[1])) continue
    // A '>' before the hole means the tag closed on this line. But JSX children are
    // routinely a line of their own —
    //     <AppText …>
    //       {Math.abs(change)} {wUnit}
    //     </AppText>
    // — and requiring '>' on the same line missed exactly that, which is how the weight
    // delta chip stayed raw. A bare expression line, carrying no tag and no attribute, is
    // a child too.
    const isChildOnThisLine = before.includes('>')
    const isBareExpressionLine = !before.includes('<') && !before.includes('=')
    if (!isChildOnThisLine && !isBareExpressionLine) continue
    out.push(m[1])
  }
  return out
}

describe('every number a person reads goes through the shared formatter', () => {
  it('scans both apps', () => {
    expect(files.length).toBeGreaterThan(100)
    for (const d of DIRS) expect(files.some((f) => f.startsWith(d))).toBe(true)
  })

  it('leaves nothing numeric drawn raw', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const t = line.trim()
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
          if (MACHINERY_LINE.test(line)) return
          if (ALLOWED.some((a) => file === a.file && line.includes(a.contains))) return
          for (const expr of textHoles(line)) {
            if (!NUMERIC.test(expr)) continue
            if (SAFE.test(expr)) continue
            if (MACHINERY_EXPR.test(expr)) continue
            if (/[><]=?|===|!==/.test(expr)) continue // a guard, not the render
            offenders.push(`${file}:${i + 1}  {${expr.trim().slice(0, 70)}}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })

  // The gap that let numericRange through: it is not a component, so no sweep of .tsx
  // could see it. A shared helper returning display text is a render one file earlier.
  it('leaves no shared helper building display text from a raw number', () => {
    // Only modules that deal in quantities. networkError, serverUrl, version and
    // passwordRules assemble prose and identifiers, where arguing about whether
    // `${base} (${detail})` is a number wastes everyone's time. It never is.
    const PROSE = new Set(['networkError.ts', 'serverUrl.ts', 'version.ts', 'passwordRules.ts', 'index.ts'])
    const dir = join(ROOT, 'packages/shared/src/utils')
    const offenders: string[] = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts') || name.includes('.test.') || PROSE.has(name)) continue
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const t = line.trim()
          if (t.startsWith('//') || t.startsWith('*')) return
          if (!/\breturn\b/.test(line)) return
          if (!/`|String\(/.test(line)) return
          if (SAFE.test(line)) return
          // Clocks, dates and machine formats are text but never carry a decimal mark.
          if (/padStart|toISOString|getFullYear|getUTC|MONTH_NAMES/.test(line)) return
          if (/\$\{[a-z][\w.]*\}/.test(line) || /String\([a-z][\w.]*\s*\)/.test(line)) {
            offenders.push(`packages/shared/src/utils/${name}:${i + 1}  ${t.slice(0, 66)}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })

  // Attributes are exempt from the rule above, because almost all of them are machinery.
  // A placeholder is the exception: it is drawn inside the field, in the same place the
  // value will appear, so a raw one sits a dot next to the comma the browser draws.
  // Mobile localised these; web did not, which is exactly the sort of asymmetry no
  // component-level sweep would surface.
  it('draws a weight placeholder in the reader notation', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/placeholder=/.test(line)) return
          if (!/displayWeight|lbsToDisplay/.test(line)) return
          if (SAFE.test(line)) return
          offenders.push(`${file}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('keeps the allowlist honest — every entry still matches something', () => {
    for (const a of ALLOWED) {
      const src = readFileSync(join(ROOT, a.file), 'utf8')
      expect({ entry: a.contains, found: src.includes(a.contains) }).toEqual({ entry: a.contains, found: true })
    }
  })
})
