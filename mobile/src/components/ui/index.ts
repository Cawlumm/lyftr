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
export { SearchField } from './SearchField'
export { NumberField } from './NumberField'
export { NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID } from './NumericKeyboardAccessory'
export { StepperTile } from './StepperTile'
export { DateInput } from './DateInput'

// Data display
export { Stat } from './Stat'
export { ListRow } from './ListRow'

// Settings list — grouped iOS-style rows, reusable for any preferences screen
export { SettingsGroup } from './SettingsGroup'
export { SettingsRow } from './SettingsRow'
export { Toggle } from './Toggle'
export { EmptyState } from './EmptyState'

// Loading placeholders (skeleton screens) — reusable across list/detail pages
export { Skeleton, SkeletonText, SkeletonListRow, SkeletonList, SkeletonStat, SkeletonStatRow } from './Skeleton'
export { ListScreenSkeleton } from './ListScreenSkeleton'

// Feedback
export { Toast } from './Toast'
export type { ToastVariant } from './Toast'
export { Sheet, SHEET_ANIM_MS } from './Sheet'
export { SheetButton } from './SheetButton'
export { ConfirmSheet } from './ConfirmSheet'
export { ActionSheet } from './ActionSheet'
export type { SheetAction } from './ActionSheet'
export type { ConfirmSheetProps } from './ConfirmSheet'
export { editAction, deleteAction, deleteConfirmProps } from './sheetActions'
export { Loading } from './Loading'
