// Mirrors models.MaxDisplayNameLen, so the field stops accepting characters at the
// same place the server stops accepting them — a maxLength that disagreed with the
// server would mean a 400 on a name the field let you finish typing.
export const MAX_DISPLAY_NAME_LEN = 60

// What to call the person on screen.
//
// Before #170 there was no name to call them, so four places took the local part of
// their email instead — and did it four slightly different ways, with three
// different fallbacks ('U' on web's sidebar, 'there' on both dashboards). That is
// the drift this file exists to end: one copy, imported by both apps, so the
// sidebar and the greeting can never disagree about who is signed in.
//
// The order is name, then email, then a greeting that still reads as a sentence:
//
//   display_name set        -> "Good morning, Carter"
//   never set               -> "Good morning, carter"      (carter@example.com)
//   no email either         -> "Good morning, there"
//
// The last case should be unreachable — an account cannot exist without an email —
// but it is the difference between a bland greeting and "Good morning, " with
// nothing after the comma, and the store does hand back an empty user while the
// first /me is in flight.
//
// Trimmed on the way out as well as on the way in. The server trims before storing
// (controllers.UpdateSettings), so this is belt-and-braces for a row written before
// that existed, and it costs one call.
export function displayName(name?: string, email?: string): string {
  const given = (name ?? '').trim()
  if (given) return given
  const local = (email ?? '').split('@')[0].trim()
  return local || 'there'
}

// The avatar letter. Takes what displayName already returned rather than deriving
// it again, so the circle and the name beside it always start with the same letter.
export function nameInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'U'
}
