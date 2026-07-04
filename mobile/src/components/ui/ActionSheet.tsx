import { View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { AppText } from './Typography'
import { SheetButton } from './SheetButton'
import { Sheet, SHEET_ANIM_MS } from './Sheet'

export interface SheetAction {
  label: string
  /** Leading icon on the action's button. */
  icon?: LucideIcon
  /** Destructive actions get the red button fill. */
  destructive?: boolean
  onPress: () => void
}

interface Props {
  open: boolean
  /** Small uppercase kicker (e.g. "Workout"). */
  title?: string
  /** The item the actions apply to (e.g. the workout name). */
  subtitle?: string
  actions: SheetAction[]
  cancelLabel?: string
  onClose: () => void
}

// A native-style options sheet — the kebab (⋮) menu other apps use. An optional
// title/subtitle header over chunky stacked buttons (one per action) + a Cancel, in
// the generic slide-up Sheet — same button language as ConfirmSheet. An action's
// onPress fires *after* the sheet dismisses so a follow-up modal (e.g. a delete
// ConfirmSheet) isn't presented while this one is still closing.
export function ActionSheet({ open, title, subtitle, actions, cancelLabel = 'Cancel', onClose }: Props) {
  const run = (onPress: () => void) => {
    onClose()
    setTimeout(onPress, SHEET_ANIM_MS)
  }

  return (
    <Sheet open={open} onClose={onClose} haptic="selection">
      <View className="px-6">
        {(title || subtitle) ? (
          <View className="items-center pb-5">
            {title ? (
              <AppText variant="label" color="muted" className="uppercase" style={{ letterSpacing: 1.5 }}>
                {title}
              </AppText>
            ) : null}
            {subtitle ? (
              <AppText variant="heading" numberOfLines={1} className="mt-0.5 text-center">{subtitle}</AppText>
            ) : null}
          </View>
        ) : null}

        {/* Chunky stacked buttons in the ConfirmSheet's language: normal actions are
            neutral (gray fill, brand icon, left-aligned menu-row feel), destructive is
            solid red, and Cancel is muted + centered to read as the dismiss. */}
        <View className="gap-3">
          {actions.map((a, i) => (
            <SheetButton
              key={i}
              label={a.label}
              icon={a.icon}
              align="left"
              variant={a.destructive ? 'destructive' : 'neutral'}
              onPress={() => run(a.onPress)}
            />
          ))}
          <SheetButton label={cancelLabel} variant="muted" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  )
}
