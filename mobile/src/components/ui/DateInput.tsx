import { useState } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { CalendarDays } from 'lucide-react-native'
import { format } from 'date-fns'
import { useTheme } from '../../theme/useTheme'
import { AppText, Label } from './Typography'

interface Props {
  label?: string
  /** ISO calendar date, YYYY-MM-DD — same value shape as web's <input type=date>. */
  value: string
  onChange: (next: string) => void
  /** Upper bound (e.g. new Date() = today) — mirrors the web input's `max`. */
  maximumDate?: Date
}

// new Date('YYYY-MM-DD') parses as UTC midnight, which *displays* as the previous
// day in negative-offset timezones — so the picker round-trips through local date
// parts. The form's payload keeps web's exact `new Date(date).toISOString()`.
const toLocalDate = (v: string): Date => {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
const pad = (n: number) => String(n).padStart(2, '0')
const toValue = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Mirrors web ui/DateInput / <input type=date>: a Field-look row that opens the
// platform date picker.
//
// Android's picker is its own self-dismissing dialog — fine to mount inline.
// iOS's inline calendar, however, needs ~320pt of width; when the DateInput sits
// in a half-width form column, an inline picker mounted in-place gets crushed to
// near-zero and looks like "the picker never opened". So on iOS we present it in a
// full-width Modal (its own view hierarchy → nest a SafeAreaProvider, same rule as
// ExercisePicker) where width is unconstrained.
export function DateInput({ label, value, onChange, maximumDate }: Props) {
  const { colors, accent, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const date = toLocalDate(value)
  const isIOS = Platform.OS === 'ios'

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    // Android fires exactly once (set|dismissed) and the dialog is already gone.
    // On iOS the inline picker stays up (it's in our Modal) — emit on 'set', keep
    // the Modal open so the user can keep scrolling; Done closes it.
    if (event.type === 'set' && selected) onChange(toValue(selected))
    if (!isIOS) setOpen(false)
  }

  return (
    <View className="gap-1.5">
      {label ? <Label>{label}</Label> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Pick date'}
        onPress={() => setOpen((o) => !o)}
        className="h-12 flex-row items-center gap-2.5 rounded-lg border border-surface-border bg-surface-overlay px-3.5 active:scale-[0.99]"
      >
        <CalendarDays size={16} color={colors.txMuted} />
        <AppText variant="body">{format(date, 'MMM d, yyyy')}</AppText>
      </Pressable>

      {/* Android: mount inline — it's a self-contained dialog. */}
      {open && !isIOS && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}

      {/* iOS: full-width Modal so the inline calendar isn't crushed by the column.
          Gate the whole Modal on `open` — an RN Modal renders its children even while
          hidden, so an always-mounted DateTimePicker would spin up its native view on
          every screen load; mount it only when the user opens the field. */}
      {isIOS && open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <SafeAreaProvider>
            {/* Tap the scrim to dismiss; the card stops propagation. */}
            <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
              <SafeAreaView edges={['bottom']}>
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  className="mx-3 mb-3 rounded-2xl border border-surface-border bg-surface-base p-2"
                >
                  <View className="flex-row items-center justify-between px-2 pb-1 pt-2">
                    <AppText variant="bodySemibold">{label ?? 'Select date'}</AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setOpen(false)}
                      hitSlop={8}
                      className="px-2 py-1 active:opacity-60"
                    >
                      <AppText variant="bodySemibold" color="brand">Done</AppText>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="inline"
                    maximumDate={maximumDate}
                    onChange={handleChange}
                    themeVariant={isDark ? 'dark' : 'light'}
                    // Tint the selection to brand so it reads on-theme.
                    accentColor={accent}
                  />
                </Pressable>
              </SafeAreaView>
            </Pressable>
          </SafeAreaProvider>
        </Modal>
      )}
    </View>
  )
}
