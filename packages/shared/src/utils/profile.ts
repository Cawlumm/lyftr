// An independently maintained mirror of models.MaxDisplayNameLen. Not an identity: Go's
// `max` counts runes and these fields count UTF-16 units, so the client cuts off earlier
// for astral characters — the safe direction, never a 400 on a name it let you finish.
export const MAX_DISPLAY_NAME_LEN = 60

// What to call the person on screen: their chosen name, else the local part of their
// email, else a word that still reads as a sentence. One copy, imported by both apps, so
// the sidebar and the greeting can never disagree about who is signed in — before #170
// four places derived this from the email and three of them disagreed about the fallback.
//
// 'there' covers the empty-user window while the first /me is in flight; without it the
// greeting reads "Good morning, " with nothing after the comma.
export function displayName(name?: string, email?: string): string {
  const given = (name ?? '').trim()
  if (given) return given
  const local = (email ?? '').split('@')[0].trim()
  return local || 'there'
}

// The avatar letter. Takes what displayName already returned rather than deriving it
// again, so the circle and the name beside it always start with the same letter.
//
// Spread rather than charAt(0): a name is free text bounded only by length, so it can
// begin with an emoji, and charAt returns half a surrogate pair — which toUpperCase
// leaves alone and every avatar then renders as a replacement glyph. The string iterator
// yields whole code points.
export function nameInitial(name: string): string {
  return ([...name][0] ?? '').toUpperCase()
}
