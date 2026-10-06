import { displayName } from '../utils/profile'

// Bound per app the way createUseRestTimer is, because the store instances live in each
// app's lib/lyftr.ts rather than in this package.
//
// `displayName` collapsed four ad-hoc derivations of a name from an email into one
// function (#170) — but the four CALL SITES still had to wire the same two fields from
// two different stores, which is the same drift one level up: a fifth screen that passes
// only the email silently goes back to pre-#170 behaviour and nothing fails. This is the
// wiring, written once.
type SettingsHook = <T>(selector: (state: { settings: { display_name?: string } }) => T) => T
type AuthHook = <T>(selector: (state: { user?: { email?: string } | null }) => T) => T

export function createUseDisplayName(useSettingsStore: SettingsHook, useAuthStore: AuthHook) {
  return function useDisplayName(): string {
    // Selected narrowly rather than taking whole stores: the greeting re-renders on a
    // name or email change, not on every target or weight-unit write.
    const name = useSettingsStore((s) => s.settings.display_name)
    const email = useAuthStore((s) => s.user?.email)
    return displayName(name, email)
  }
}
