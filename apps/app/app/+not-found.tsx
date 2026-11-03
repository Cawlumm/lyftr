import { Redirect } from 'expo-router'
import { useAuthStore } from '../src/lib/lyftr'

// An unknown path is a stale link, not an error page. The root layout holds the app on its
// loader until auth has hydrated, so the flag read here is settled.
export default function NotFound() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated)
  return <Redirect href={isAuthed ? '/' : '/login'} />
}
