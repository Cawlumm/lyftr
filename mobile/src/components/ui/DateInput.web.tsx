import { useRef, useState } from 'react'
import { View } from 'react-native'
import { CalendarDays } from './icons'
import { dateToDay, formatDay, useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { AppText, Label } from './Typography'

interface Props {
  label?: string
  /** ISO calendar date, YYYY-MM-DD — same value shape as the native picker. */
  value: string
  onChange: (next: string) => void
  /** Upper bound (e.g. new Date() = today). */
  maximumDate?: Date
}

// The real input is transparent, so the ring is drawn on the visible box instead.
const RING = 'outline outline-2 outline-offset-2 outline-focus'

// Web: a transparent native <input type=date> fills the visible box, so a click lands on
// the browser's own picker and the keyboard works unchanged. The label under it follows
// the app language, which the input's own text (the browser's locale) would not.
export function DateInput({ label, value, onChange, maximumDate }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Browsers treat a date field as text entry, so :focus-visible matches after a mouse click
  // too (MDN :focus-visible). The ring is meant for the keyboard only, so a pointer press
  // switches it off until a key or a Tab-in switches it back on.
  const [ring, setRing] = useState(false)
  const pointer = useRef(false)

  // Same rule as DateInput.tsx: a bound must never exclude the value being shown. Both
  // sides are day strings, so they compare as text; no day passes through new Date().
  const maxDay = maximumDate ? dateToDay(maximumDate) : undefined
  const effectiveMax = maxDay && value > maxDay ? value : maxDay

  return (
    <View className={label ? 'gap-1.5' : 'flex-1'}>
      {label ? <Label>{label}</Label> : null}
      <View
        className={`${label ? 'h-12' : 'flex-1'} flex-row items-center gap-2.5 rounded-lg border border-surface-border bg-surface-overlay px-3.5 ${ring ? RING : ''}`}
      >
        <CalendarDays size={16} color={colors.txMuted} />
        <AppText variant="body">{formatDay(value, 'monthDayYear')}</AppText>
        <input
          type="date"
          value={value}
          max={effectiveMax}
          aria-label={label ?? t('common.pickDate')}
          onPointerDown={() => { pointer.current = true; setRing(false) }}
          onFocus={(e) => { if (!pointer.current && e.currentTarget.matches(':focus-visible')) setRing(true) }}
          onKeyDown={() => setRing(true)}
          onBlur={() => { pointer.current = false; setRing(false) }}
          // A cleared field reports '' — there is no day to emit, and the controlled
          // value snaps back to the last real one.
          onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
          // Desktop browsers only focus the segments on a click in the text area; the picker
          // opens from the (invisible) calendar icon alone. showPicker throws in a
          // cross-origin iframe and is missing in older browsers.
          onClick={(e) => { try { e.currentTarget.showPicker?.() } catch { /* typing still works */ } }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0 }}
        />
      </View>
    </View>
  )
}
