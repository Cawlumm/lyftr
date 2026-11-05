// The Lyftr mobile primitive library — read apps/app/CONVENTIONS.md before adding to
// it. This barrel resolves the same '../../src/components/ui' path the screens
// already import, so it fully replaces the old single-file ui.tsx.

// Typography — the only sanctioned way to render text (brand fonts live here).
export { AppText, Body, Label, Muted } from './Typography'
export type { AppTextProps, TextVariant, TextColor } from './Typography'

// Layout / surfaces
export { Screen } from './Screen'
export { ContentColumn, scrollBleed } from './ContentColumn'
export type { ColumnWidth } from './ContentColumn'
export { ResponsiveGrid } from './ResponsiveGrid'
export { Card } from './Card'
export { Alert } from './Alert'
export { ErrorState } from './ErrorState'
export { BarbellBroken } from './BarbellBroken'
export { StatFailure } from './StatFailure'

// Headers (web-parity)
export { PageHeader } from './PageHeader'
export { SectionHeader } from './SectionHeader'

// Controls
export { Button } from './Button'
export { IconButton } from './IconButton'
export { Icon, ICON_SIZE, ICON_STROKE } from './Icon'
export type { IconSize } from './Icon'
export { interactive, touchPad, touchTarget } from './interaction'
export { isPlainClick, linkProps } from './link'
export type { Click } from './link'
export { LinkCard } from './LinkCard'
export { CardActions } from './CardActions'
export type { CardAction } from './CardActions'
export { useCardGrid } from './useCardGrid'
export { SegmentedControl } from './SegmentedControl'
export { FilterButton } from './FilterButton'
export { FilterSheet } from './FilterSheet'
export { ActiveFilters } from './ActiveFilters'

// Inputs
export { Field } from './Field'
export { SearchField } from './SearchField'
export { NumberField } from './NumberField'
export { PasswordField, PasswordRule } from './PasswordField'
export { NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID } from './NumericKeyboardAccessory'
export { StepperTile } from './StepperTile'
export { DateInput } from './DateInput'

// Data display
export { ListRow } from './ListRow'

// Settings list — grouped iOS-style rows, reusable for any preferences screen
export { SettingsGroup } from './SettingsGroup'
export { SettingsRow } from './SettingsRow'
export { Toggle } from './Toggle'
export { EmptyState } from './EmptyState'

// Loading placeholders (skeleton screens) — reusable across list/detail pages
export { Skeleton, SkeletonList, SkeletonStatRow } from './Skeleton'
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
export { ChartTooltip } from './ChartTooltip'
export { Menu } from './Menu'
export type { MenuItem } from './Menu'
export { Loading } from './Loading'
