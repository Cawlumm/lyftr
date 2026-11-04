import { offenders } from '../testing/sourceScan'

// #145 was not a wrong line, it was a second opinion: the API client navigated to /login on
// a failed refresh while the auth store still said the user was signed in, and the root gate
// navigated them back. Two actors, disagreeing inputs, an infinite ping-pong, and an app that
// drew fine but answered nothing until it was force-quit.
//
// So the rule is structural rather than stylistic: nothing routes anyone to the sign-in
// screen. Access is declared by app/_layout.tsx's <Stack.Protected guard={isAuthed}>, and
// anything that ends a session says so by clearing the store — the stack reacts. This test
// fails if a second navigator appears, including the obvious quick fix of pushing /login
// from wherever the 401 happened to be noticed.
//
// Only /login is policed. Navigating to '/' is ordinary (several back-button fallbacks do
// it) and cannot loop, because no guard sends an authed user away from the tabs.

// The three ways to reach a route in expo-router. <Link href="/login"> is deliberately
// absent: a link the user has to press is not the app deciding to move them, and
// register.tsx legitimately offers one.
const ROUTES_TO_LOGIN = [
  /\.(replace|push|navigate|dismissTo|dismissAll)\s*\(\s*['"`]\/login/, // imperative
  /<Redirect[^>]*href\s*=\s*\{?\s*['"`]\/login/, // declarative
  /pathname\s*:\s*['"`]\/login/, // either, in object form
]

it('never routes anyone to the sign-in screen', () => {
  expect(offenders(ROUTES_TO_LOGIN)).toEqual([])
})
