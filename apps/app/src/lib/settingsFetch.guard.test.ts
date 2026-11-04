import { offenders } from '../testing/sourceScan'

// A screen that shows a weight in the user's unit has to load settings itself. Each screen
// fetches its own (the store makes the second call free); there is no app-wide load. A
// screen that relied on another having run first showed lb to a kg user whenever it was
// the first one open: a bookmark, a reload, or an old /exercises/:id link redirected to it.
// Components are covered by the screen that renders them, so only screens are checked.

const READS_UNIT = [/weight_unit/, /weightShort\(/]
const FETCHES = [/useSettingsStore\(\(s\) => s\.fetch\)/]
const isScreen = (p: string) => p.startsWith('app/') || /Screen\.tsx$/.test(p)

it('every screen that shows a weight unit loads settings itself', () => {
  const fetching = new Set(offenders(FETCHES))
  expect(offenders(READS_UNIT).filter((p) => isScreen(p) && !fetching.has(p))).toEqual([])
})
