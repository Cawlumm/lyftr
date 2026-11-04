// The web app's old URLs and where each now lives. The single source: the route files under
// app/(legacy) read it at runtime and the nginx 301 list (C35) is generated from it.
// `:name` segments are path params; everything else in the query string is carried over.
export const LEGACY_ROUTES = [
  { from: '/food', to: '/nutrition' },
  { from: '/food/log', to: '/nutrition/log' },
  { from: '/workout/start', to: '/workouts/start' },
  { from: '/workout/active', to: '/workouts/active' },
  { from: '/workout/active/add-exercise', to: '/workouts/active' },
  { from: '/workout/active/exercise/:exerciseId', to: '/workouts/exercise/:exerciseId' },
  { from: '/exercises', to: '/workouts/exercises' },
  { from: '/exercises/:exerciseId', to: '/workouts/exercise/:exerciseId' },
] as const

export type LegacyFrom = (typeof LEGACY_ROUTES)[number]['from']

type Params = Record<string, string | string[] | undefined>

export function legacyHref(from: LegacyFrom, params: Params = {}): string {
  const route = LEGACY_ROUTES.find((r) => r.from === from)
  if (!route) throw new Error(`No legacy route for ${from}`)
  const used = new Set<string>()
  const path = route.to.replace(/:(\w+)/g, (_, name: string) => {
    used.add(name)
    return encodeURIComponent(String(params[name] ?? ''))
  })
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (used.has(key) || value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v)
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}
