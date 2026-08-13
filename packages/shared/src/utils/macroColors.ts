// One colour per macro, used wherever protein/carbs/fat are charted or badged —
// web's nutrition rings, gradients and Recharts gradients, and the mobile dashboard's
// macro rows. Hex rather than theme tokens because both platforms feed these to
// drawing APIs (SVG stops, canvas, RN inline styles) that can't read a CSS class, and
// because a macro's colour is an identity, not a theme choice: protein is green in
// light and dark alike.
export const MACRO_COLORS = { protein: '#10b981', carbs: '#f59e0b', fat: '#8b5cf6' } as const
