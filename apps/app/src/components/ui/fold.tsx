import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { ChevronDown, ChevronUp, type LucideIcon } from './icons'
import { AppText } from './Typography'
import { interactive, TOUCH_MIN } from './interaction'
import { useTheme } from '../../theme/useTheme'

// The one rule for long rows of chips and option lists: show the first few and a "+N more"
// control, "Show less" folds them again. A row folds only when it would hide two or more (a
// "+1 more" control is as big as the one thing it hides).
export interface FoldRule {
  /** Shown while folded. */
  show: number
  /** Folds only when it holds more than this. */
  foldAbove: number
}
/** Picked or read-only chips (other muscles, "Also works"). */
export const CHIP_FOLD: FoldRule = { show: 3, foldAbove: 4 }
/** Options to choose from (equipment tiles, filter sections): long lists only, the chosen one always shown. */
export const OPTION_FOLD: FoldRule = { show: 6, foldAbove: 8 }

export function useFold<T>(items: readonly T[], rule: FoldRule, keep?: (item: T) => boolean) {
  const [open, setOpen] = useState(false)
  const folds = items.length > rule.foldAbove
  // Something chosen past the cut stays visible, in its own place in the order.
  const shown = folds && !open ? items.filter((it, i) => i < rule.show || !!keep?.(it)) : items
  return { shown, hidden: items.length - shown.length, folds, open, toggle: () => setOpen((o) => !o) }
}

interface ToggleProps {
  open: boolean
  hidden: number
  onPress: () => void
  /** `chip`: a pill beside chips. `badge`:
   *  drawn like the small muscle badges. `tile`: a grid cell. */
  variant?: 'chip' | 'badge' | 'tile'
  /** For `tile`: the cell's size, as the grid's tiles get it. */
  tileStyle?: object
}

export function FoldToggle({ open, hidden, onPress, variant = 'chip', tileStyle }: ToggleProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const text = open ? t('common.chips.less') : t('common.chips.more', { count: hidden })
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: open ? t('common.chips.less') : t('common.chips.moreLabel', { count: hidden }),
    onPress,
  }
  if (variant === 'tile') {
    const Icon: LucideIcon = open ? ChevronUp : ChevronDown
    return (
      <Pressable
        {...a11y}
        style={tileStyle}
        className={`items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border px-1 py-2 active:opacity-70 ${interactive('hover:bg-surface-muted')}`}
      >
        <Icon size={22} color={colors.txMuted} strokeWidth={2} />
        <AppText variant="caption" color="secondary" className="text-center text-[12px]">{text}</AppText>
      </Pressable>
    )
  }
  if (variant === 'badge') {
    // Drawn as a badge; the tap area is still 44px tall.
    return (
      <Pressable {...a11y} style={{ minHeight: TOUCH_MIN }} className="justify-center active:opacity-70">
        <View className={`rounded border border-dashed border-surface-border px-2 py-0.5 ${interactive('hover:bg-surface-muted')}`}>
          <AppText variant="caption" color="secondary">{text}</AppText>
        </View>
      </Pressable>
    )
  }
  return (
    <Pressable
      {...a11y}
      style={{ minHeight: TOUCH_MIN }}
      className={`justify-center rounded-full border border-dashed border-surface-border px-3 active:opacity-70 ${interactive('hover:bg-surface-muted')}`}
    >
      <AppText variant="bodySemibold" color="secondary" className="text-[13px]">{text}</AppText>
    </Pressable>
  )
}
