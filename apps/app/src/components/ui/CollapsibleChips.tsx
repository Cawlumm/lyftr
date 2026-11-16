import { useState, type ReactNode } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from './Typography'
import { interactive, TOUCH_MIN } from './interaction'

interface Props<T> {
  items: readonly T[]
  renderChip: (item: T) => ReactNode
  /** Chips shown while collapsed. */
  limit?: number
}

// A wrapping chip row that shows the first few and a "+N more" chip, the way mail recipients and
// filter rows do; "Show less" folds it again. One hidden chip is never worth a "+1 more" chip of
// the same size, so a row only folds when it would hide two or more. Render it inside the
// caller's flex-wrap row: it returns the chips themselves, not a container.
export function CollapsibleChips<T>({ items, renderChip, limit = 3 }: Props<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hidden = items.length - limit
  const folds = hidden >= 2
  const shown = folds && !open ? items.slice(0, limit) : items
  return (
    <>
      {shown.map(renderChip)}
      {folds ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? t('common.chips.less') : t('common.chips.moreLabel', { count: hidden })}
          onPress={() => setOpen((o) => !o)}
          style={{ minHeight: TOUCH_MIN }}
          className={`justify-center rounded-full border border-dashed border-surface-border px-3 active:opacity-70 ${interactive('hover:bg-surface-muted')}`}
        >
          <AppText variant="bodySemibold" color="secondary" className="text-[13px]">
            {open ? t('common.chips.less') : t('common.chips.more', { count: hidden })}
          </AppText>
        </Pressable>
      ) : null}
    </>
  )
}
