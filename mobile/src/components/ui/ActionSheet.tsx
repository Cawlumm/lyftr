import type { ReactNode } from 'react'
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
  /** Rich header slot — a preview of the item (thumbnail + meta). Takes precedence
   *  over title/subtitle when given, so the sheet shows what you're acting on. */
  header?: ReactNode
  actions: SheetAction[]
  cancelLabel?: string
  /** 'stack' = full-width buttons (any count); 'row' = side-by-side (best for 2). */
  layout?: 'stack' | 'row'
  onClose: () => void
}

// A native-style options sheet — the kebab (⋮) menu other apps use. An optional
// title/subtitle header over chunky action buttons + a Cancel, in the generic slide-up
// Sheet (same button language as ConfirmSheet). layout='stack' is the scalable default
// (full-width rows); layout='row' packs the actions side-by-side, the pattern apps use
// when there are exactly two. An action's onPress fires *after* the sheet dismisses so
// a follow-up modal (e.g. a delete ConfirmSheet) isn't presented mid-close.
export function ActionSheet({
  open, title, subtitle, header, actions, cancelLabel = 'Cancel', layout = 'stack', onClose,
}: Props) {
  const run = (onPress: () => void) => {
    onClose()
    setTimeout(onPress, SHEET_ANIM_MS)
  }

  const button = (a: SheetAction, i: number) => (
    <SheetButton
      key={i}
      label={a.label}
      icon={a.icon}
      // Row buttons are narrow → center their content; stacked buttons read as menu
      // rows → left-align. Normal actions match the detail Edit pill (brand outline).
      align={layout === 'row' ? 'center' : 'left'}
      variant={a.destructive ? 'destructive' : 'brandOutline'}
      onPress={() => run(a.onPress)}
    />
  )

  return (
    <Sheet open={open} onClose={onClose} haptic="selection">
      <View className="px-6">
        {header ? (
          <View className="pb-4">{header}</View>
        ) : (title || subtitle) ? (
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

        <View className="gap-3">
          {layout === 'row' ? (
            <View className="flex-row gap-3">
              {actions.map((a, i) => (
                <View key={i} className="flex-1">{button(a, i)}</View>
              ))}
            </View>
          ) : (
            actions.map((a, i) => button(a, i))
          )}
          <SheetButton label={cancelLabel} variant="muted" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  )
}
