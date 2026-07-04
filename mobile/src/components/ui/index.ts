// The Lyftr mobile primitive library — read mobile/CONVENTIONS.md before adding to
// it. This barrel resolves the same '../../src/components/ui' path the screens
// already import, so it fully replaces the old single-file ui.tsx.

// Typography — the only sanctioned way to render text (brand fonts live here).
export { AppText, Heading, Body, Label, Numeric, H1, Muted } from './Typography'
export type { AppTextProps, TextVariant, TextColor } from './Typography'

// Layout / surfaces
export { Screen } from './Screen'
export { Card } from './Card'
export { Section } from './Section'

// Headers (web-parity)
export { PageHeader } from './PageHeader'
export { SectionHeader } from './SectionHeader'

// Controls
export { Button } from './Button'
export { IconButton } from './IconButton'
export { SegmentedControl } from './SegmentedControl'
export { OptionPill } from './OptionPill'

// Inputs
export { Field } from './Field'
export { NumberField } from './NumberField'
export { StepperTile } from './StepperTile'
export { DateInput } from './DateInput'

// Data display
export { Stat } from './Stat'
export { ListRow } from './ListRow'
export { EmptyState } from './EmptyState'

// Feedback
export { Toast } from './Toast'
export type { ToastVariant } from './Toast'
export { ConfirmSheet } from './ConfirmSheet'
export { Loading } from './Loading'
