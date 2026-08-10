// The platform-agnostic half of exercise presentation.
//
// What is NOT here, and why: each app keeps its own muscle→colour table and its own
// muscle→body-diagram-slug table.
//
//  - Colour: web returns Tailwind class strings ("bg-red-500/20 text-red-400 ...");
//    mobile returns a {chip, border, text} tint because RN needs the text colour as an
//    inline style to beat stylesheet ordering. Same palette, different delivery.
//  - Slugs: web draws with react-body-highlighter, mobile with
//    react-native-body-highlighter, and the two libraries do not agree on their slug
//    sets — the web one splits front/back deltoids and has 'abductors'; the RN one has
//    a single 'deltoids' and neither 'abductors' nor 'middle-back'. Sharing one table
//    would mean emitting slugs a renderer silently ignores.
//
// The *lookup rule* over those tables is identical on both sides, so it lives here.

export const EQUIPMENT_LABEL: Record<string, string> = {
  'body only':     'Bodyweight',
  'barbell':       'Barbell',
  'dumbbell':      'Dumbbell',
  'machine':       'Machine',
  'cable':         'Cable',
  'kettlebells':   'Kettlebell',
  'bands':         'Bands',
  'medicine ball': 'Med Ball',
  'other':         'Other',
  'foam roll':     'Foam Roll',
}

// Resolve a muscle name to body-diagram slugs against the caller's table: exact match
// on the normalized key first, then a substring match in either direction so free-text
// secondary-muscle names from the exercise DB ("quad", "anterior deltoid") still land.
// Returns [] for empty or unknown input, which every caller reads as "highlight nothing".
export function resolveMuscleSlugs(m: string, table: Record<string, string[]>): string[] {
  const key = m?.toLowerCase().trim()
  if (!key) return []
  if (table[key]) return table[key]
  for (const [k, v] of Object.entries(table)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return []
}
