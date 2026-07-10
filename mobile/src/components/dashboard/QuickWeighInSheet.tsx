import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { AlertCircle, Scale, X } from 'lucide-react-native'
import {
  apiErrorMessage, dayToIsoNoon, displayToLbs, isoToDayInput, maxWeight, todayStr,
  weightError, weightShort, type WeightLog,
} from '@lyftr/shared'
import {
  AppText, Button, DateInput, Field, NumberField, NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID,
  Sheet, StepperTile,
} from '../ui'
import { client, useSettingsStore } from '../../lib/lyftr'
import { clampStep } from '../../utils/number'
import { useTheme } from '../../theme/useTheme'

interface Props {
  open: boolean
  /** Latest weight in the display unit, prefilled into the field (null = empty). */
  lastValue: number | null
  /** Latest log — powers the "already logged today" guard. */
  lastLog?: WeightLog | null
  onClose: () => void
  onSuccess: (log: WeightLog) => void
}

// Mobile port of web QuickWeighInSheet: a bottom-sheet weight logger reused by the
// Dashboard. Same logic as the Weight page's log form (prefill, same-day duplicate
// guard, collapsible date/note, validation) but self-contained in a Sheet.
export function QuickWeighInSheet({ open, lastValue, lastLog, onClose, onSuccess }: Props) {
  const settings = useSettingsStore((s) => s.settings)
  const unit = settings.weight_unit
  const wUnit = weightShort(unit)
  const { colors, accent, brand } = useTheme()

  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [showExtras, setShowExtras] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [dupDismissed, setDupDismissed] = useState(false)

  // Reset every time the sheet opens (mirrors web's isOpen effect).
  useEffect(() => {
    if (!open) return
    setValue(lastValue && lastValue > 0 ? String(lastValue) : '')
    setDate(todayStr())
    setNotes('')
    setShowExtras(false)
    setError('')
    setSaving(false)
    setShowDuplicateWarning(false)
    setDupDismissed(false)
  }, [open, lastValue])

  const submit = async (forceDismissed = false) => {
    if (saving) return
    const w = parseFloat(value)
    const wErr = weightError(w, unit)
    if (wErr) {
      setError(wErr)
      return
    }
    if (!(forceDismissed || dupDismissed) && lastLog && isoToDayInput(lastLog.logged_at) === date) {
      setShowDuplicateWarning(true)
      return
    }
    setSaving(true)
    setError('')
    setShowDuplicateWarning(false)
    try {
      const log = await client.weightAPI.log({
        weight: displayToLbs(w, unit),
        notes: notes.trim(),
        logged_at: dayToIsoNoon(date),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      onSuccess(log)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} haptic="selection">
      <View className="px-5 pb-2">
        {/* Header */}
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10">
              <Scale size={16} color={accent} />
            </View>
            <AppText variant="heading">Log Weight</AppText>
          </View>
          <Pressable onPress={onClose} hitSlop={8} className="p-1.5 active:opacity-60" accessibilityLabel="Close">
            <X size={20} color={colors.txMuted} />
          </Pressable>
        </View>

        <View className="gap-4">
          {error ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
              <AlertCircle size={16} color={brand.errorSoft} />
              <Text className="flex-1 font-sans text-sm text-error-400">{error}</Text>
            </View>
          ) : null}

          {showDuplicateWarning && lastLog ? (
            <View className="flex-row items-start gap-3 rounded-xl border border-warning-500/20 bg-warning-500/10 px-4 py-3">
              <AlertCircle size={16} color={brand.warningSoft} style={{ marginTop: 2 }} />
              <View className="min-w-0 flex-1">
                <Text className="font-sans-semibold text-sm text-warning-400">
                  Already logged today ({Math.round(lastValue ?? 0)} {wUnit}). Log again anyway?
                </Text>
                <View className="mt-2 flex-row gap-2">
                  <Pressable onPress={() => setShowDuplicateWarning(false)}
                    className="rounded-lg border border-surface-border bg-surface-overlay px-3 py-1 active:opacity-70">
                    <AppText variant="caption" color="secondary">Cancel</AppText>
                  </Pressable>
                  <Pressable onPress={() => { setDupDismissed(true); setShowDuplicateWarning(false); submit(true) }}
                    className="rounded-lg border border-warning-500/30 bg-warning-500/20 px-3 py-1 active:opacity-70">
                    <Text className="font-sans-semibold text-xs text-warning-400">Log Anyway</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <StepperTile
            icon={Scale}
            label={`Weight (${wUnit})`}
            name="weight"
            step={0.5}
            onStep={(d) => setValue(String(clampStep(parseFloat(value) || 0, d, { min: 0, max: maxWeight(unit) })))}
          >
            <NumberField
              inputMode="decimal"
              value={value}
              onChange={setValue}
              placeholder="0"
              accessibilityLabel="Weight"
              inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
            />
          </StepperTile>

          {!showExtras ? (
            <Pressable onPress={() => setShowExtras(true)} hitSlop={6} className="self-start active:opacity-60">
              <AppText variant="caption" color="brand">+ Change date or add a note</AppText>
            </Pressable>
          ) : (
            <View className="gap-3">
              <DateInput label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
              <Field
                label="Note (optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g., morning, post-workout"
                maxLength={200}
              />
            </View>
          )}

          <Button
            title={saving ? 'Saving…' : 'Save'}
            onPress={() => submit()}
            loading={saving}
            disabled={!(parseFloat(value) > 0) || saving}
          />
        </View>
      </View>
      <NumericKeyboardAccessory />
    </Sheet>
  )
}
