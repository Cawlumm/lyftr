import { useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from './Typography'
import { interactive, TOUCH_MIN } from './interaction'

interface Props<T> {
  items: readonly T[]
  renderChip: (item: T) => ReactNode
  /** Chips shown while collapsed. */
  limit?: number
  /** Beside small read-only badges: the toggle draws as a badge, its tap area still 44px tall. */
  compact?: boolean
}

// A wrapping chip row that shows the first few and a "+N more" chip, the way mail recipients and
// filter rows do; "Show less" folds it again. One hidden chip is never worth a "+1 more" chip of
// the same size, so a row only folds when it would hide two or more. Render it inside the
// caller's flex-wrap row: it returns the chips themselves, not a container.
export function CollapsibleChips<T>({ items, renderChip, limit = 3, compact = false }: Props<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hidden = items.length - limit
  const folds = hidden >= 2
  const shown = folds && !open ? items.slice(0, limit) : items
  const label = open ? t('common.chips.less') : t('common.chips.more', { count: hidden })
  return (
    <>
      {shown.map(renderChip)}
      {folds ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? t('common.chips.less') : t('common.chips.moreLabel', { count: hidden })}
          onPress={() => setOpen((o) => !o)}
          style={{ minHeight: TOUCH_MIN }}
          className={`justify-center active:opacity-70 ${compact ? '' : `rounded-full border border-dashed border-surface-border px-3 ${interactive('hover:bg-surface-muted')}`}`}
        >
          {compact ? (
            <View className={`rounded border border-dashed border-surface-border px-2 py-0.5 ${interactive('hover:bg-surface-muted')}`}>
              <AppText variant="caption" color="secondary">{label}</AppText>
            </View>
          ) : (
            <AppText variant="bodySemibold" color="secondary" className="text-[13px]">{label}</AppText>
          )}
        </Pressable>
      ) : null}
    </>
  )
}
