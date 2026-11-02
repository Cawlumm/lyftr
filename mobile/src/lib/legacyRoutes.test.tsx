import fs from 'fs'
import path from 'path'
import { Text } from 'react-native'
import { renderRouter, screen } from 'expo-router/testing-library'
import { LEGACY_ROUTES, legacyHref } from './legacyRoutes'
import FoodLog from '../../app/(legacy)/food/log'
import ExerciseById from '../../app/(legacy)/exercises/[exerciseId]'
import ExercisesIndex from '../../app/(legacy)/exercises/index'
import NotFound from '../../app/+not-found'
import { useAuthStore } from './lyftr'

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const appDir = path.resolve(__dirname, '../../app')

// Every URL a route file under app/ serves, with [param] segments as wildcards.
function routePatterns(dir = appDir, prefix = ''): RegExp[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`
      return routePatterns(path.join(dir, e.name), prefix + seg)
    }
    const name = e.name.replace(/\.tsx?$/, '')
    if (name.startsWith('_') || name.startsWith('+')) return []
    const url = name === 'index' ? prefix || '/' : `${prefix}/${name}`
    return [new RegExp(`^${url.replace(/\[\w+\]/g, '[^/]+')}$`)]
  })
}

const resolves = (url: string) => routePatterns().some((re) => re.test(url))

const webApp = fs.readFileSync(path.resolve(__dirname, '../../../web/src/App.tsx'), 'utf8')
const webPaths = [...webApp.matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1])

describe('legacy route manifest', () => {
  it('reads the web paths it is meant to cover', () => {
    expect(webPaths).toContain('/food/log')
    expect(webPaths.length).toBeGreaterThan(20)
  })

  it.each(LEGACY_ROUTES.map((r) => [r.from, r.to]))('%s lands on a real screen (%s)', (_from, to) => {
    expect(resolves(to.replace(/:\w+/g, '7'))).toBe(true)
  })

  it.each(webPaths)('web path %s has a destination', (p) => {
    const legacy = LEGACY_ROUTES.find((r) => r.from === p)
    const target = (legacy?.to ?? p).replace(/:\w+/g, '7')
    expect(resolves(target)).toBe(true)
  })

  it('has a route file for each old path', () => {
    for (const r of LEGACY_ROUTES) expect(resolves(r.from.replace(/:\w+/g, '7'))).toBe(true)
  })
})

function target(label: string) {
  const Screen = () => <Text>{label}</Text>
  return Screen
}

describe('legacyHref', () => {
  it('keeps the query and fills path params', () => {
    expect(legacyHref('/food/log', { edit: '5', date: '2026-01-02' })).toBe('/nutrition/log?edit=5&date=2026-01-02')
    expect(legacyHref('/exercises/:exerciseId', { exerciseId: '9' })).toBe('/workouts/exercise/9')
  })
})

describe('redirect routes', () => {
  
  it('/food/log?edit=5&date=2026-01-02 lands on /nutrition/log with both params', async () => {
    await renderRouter(
      { '(legacy)/food/log': FoodLog, 'nutrition/log': target('NLOG') },
      { initialUrl: '/food/log?edit=5&date=2026-01-02' },
    )
    expect(screen.getByText('NLOG')).toBeTruthy()
    expect(screen).toHavePathname('/nutrition/log')
    expect(screen).toHaveSearchParams({ edit: '5', date: '2026-01-02' })
  })

  it('/exercises/:id and /exercises?filters keep their params', async () => {
    await renderRouter(
      { '(legacy)/exercises/[exerciseId]': ExerciseById, 'workouts/exercise/[exerciseId]': target('EX') },
      { initialUrl: '/exercises/12' },
    )
    expect(screen).toHavePathname('/workouts/exercise/12')

    await renderRouter(
      { '(legacy)/exercises/index': ExercisesIndex, 'workouts/exercises': target('LIST') },
      { initialUrl: '/exercises?q=bench&muscle=chest&equipment=barbell' },
    )
    expect(screen).toHavePathname('/workouts/exercises')
    expect(screen).toHaveSearchParams({ q: 'bench', muscle: 'chest', equipment: 'barbell' })
  })
})

describe('+not-found', () => {
  const routes = { index: target('HOME'), login: target('LOGIN'), '+not-found': NotFound }
    it.each([[true, 'HOME'], [false, 'LOGIN']])('signed in = %s goes to %s', async (authed, label) => {
    useAuthStore.setState({ isAuthenticated: authed })
    await renderRouter(routes, { initialUrl: '/no/such/page' })
    expect(screen.getByText(label)).toBeTruthy()
  })
})
