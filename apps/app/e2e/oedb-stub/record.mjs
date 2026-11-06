// Regenerates catalog.json, the fixture server.mjs serves, from the hosted open-exercise-db.
// Run it by hand, rarely — when oedb's response shape changes or a spec needs an exercise the
// fixture lacks — never from CI or a loop: oedb's database runs on a metered free tier, and
// keeping CI off it is the reason this stub exists.
//
//   node apps/app/e2e/oedb-stub/record.mjs > /tmp/catalog.json && mv /tmp/catalog.json apps/app/e2e/oedb-stub/catalog.json
//
// Costs 1 + 1 + (one per non-English locale) requests: the export, the locale list, and each
// locale's translations of the subset (it stays at or under 100 rows, oedb's per_page cap).
// It prints the fixture to stdout rather than writing the file itself, so a failed run leaves
// the committed fixture untouched and nothing fetched from the network is written by this script.

const BASE = 'https://oedb-api-o4dqddih5q-uk.a.run.app'
// The same identity the backend sends, so the request lands in oedb's identified tier.
const UA = 'lyftr/dev (+https://github.com/Cawlumm/lyftr)'

async function get(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path}: http ${res.status}`)
  return res.json()
}

const exportBody = await get('/api/v1/exercises/export')
const all = exportBody.exercises

// What the specs search or filter for (grep apps/app/e2e for `fill(` on a search box and for
// `?q=`), plus the first few of every muscle group, so a spec that picks one exercise per
// group (a11y.spec.ts) still finds every group.
const TERMS = ['bench press', 'squat', 'deadlift', 'curl', 'row', 'press']
const PER_GROUP = 3
const PER_TERM = 4
const picked = new Map()
const pick = (e) => picked.size < 100 && picked.set(e.id, e)
for (const group of [...new Set(all.map((e) => e.muscle_group))]) {
  all.filter((e) => e.muscle_group === group).slice(0, PER_GROUP).forEach(pick)
}
for (const term of TERMS) {
  all.filter((e) => e.translation.name.toLowerCase().includes(term)).slice(0, PER_TERM).forEach(pick)
}
// exercises.spec.ts filters q=press, muscle=chest, equipment=barbell.
all.filter((e) => /press/i.test(e.translation.name) && e.muscle_group === 'chest' && e.equipment === 'barbell')
  .slice(0, PER_TERM).forEach(pick)
const exercises = all.filter((e) => picked.has(e.id))

const locales = (await get('/api/v1/meta/locales?page=1&per_page=100')).locales.map((l) => l.code)
const translations = {}
for (const locale of locales.filter((l) => l !== 'en')) {
  const ids = exercises.map((e) => e.id).join(',')
  const body = await get(`/api/v1/exercises?ids=${ids}&locale=${locale}&per_page=100`)
  translations[locale] = Object.fromEntries(body.exercises.map((e) => [e.id, e.translation]))
}

process.stdout.write(JSON.stringify({ locales, exercises, translations }, null, 1) + '\n')
console.error(`${exercises.length} exercises, locales ${locales.join(', ')}`)
