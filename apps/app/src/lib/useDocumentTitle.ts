import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useTranslation } from '@lyftr/shared'

// Section titles by the first route segment under its group. Sub-screens (a workout, a
// settings page) share their section's title.
const SEGMENT_TITLE = {
  login: 'auth.login.submit',
  register: 'auth.register.heading',
  workouts: 'nav.workouts',
  programs: 'nav.programs',
  nutrition: 'nav.nutrition',
  weight: 'nav.weight',
  settings: 'nav.settings',
} as const

type TitleKey = 'nav.home' | (typeof SEGMENT_TITLE)[keyof typeof SEGMENT_TITLE]

export function titleKeyForSegments(segments: readonly string[]): TitleKey | null {
  const [group, section] = segments
  if (group === '(tabs)' && !section) return 'nav.home'
  return section ? SEGMENT_TITLE[section as keyof typeof SEGMENT_TITLE] ?? null : null
}

// One call site (the root layout) rather than a <Head> per screen: stack screens stay
// mounted when covered, and expo-router's <Head> leaves the last title in place when you
// navigate to a screen that sets none.
export function useDocumentTitle(segments: readonly string[]) {
  const { t, i18n } = useTranslation()
  const key = titleKeyForSegments(segments)
  const title = key ? t('app.pageTitle', { page: t(key) }) : t('app.documentTitle')
  useEffect(() => {
    if (Platform.OS !== 'web') return
    document.title = title
  }, [title, i18n.language])
}
