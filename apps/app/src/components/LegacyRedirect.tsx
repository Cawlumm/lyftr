import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { legacyHref, type LegacyFrom } from '../lib/legacyRoutes'

export function LegacyRedirect({ from }: { from: LegacyFrom }) {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  return <Redirect href={legacyHref(from, params) as unknown as Href} />
}
