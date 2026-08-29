import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Scale, X } from 'lucide-react-native'
import { useAsyncAction, dayToInstant, displayToLbs, maxWeight, todayStr, weightError, weightShort, type WeightLog, entryDay, BODYWEIGHT_STEP, clampStep } from '@lyftr/shared'
import {
  Alert, AppText, Button, DateInput, Field, NumberField, NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID,
  Sheet, StepperTile,
} from '../ui'
import { client, useSettingsStore } from '../../lib/lyftr'
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
  const { colors, accent } = useTheme()

  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [showExtras, setShowExtras] = useState(false)
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
    setShowDuplicateWarning(false)
    setDupDismissed(false)
  }, [open, lastValue])

  const save = useAsyncAction(async (w: number) => {
    const log = await client.weightAPI.log({
      weight: displayToLbs(w, unit),
      notes: notes.trim(),
      logged_at: dayToInstant(date),
    })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onSuccess(log)
    onClose()
  }, 'Failed to save')

  const submit = async (forceDismissed = false) => {
    if (save.busy) return
    const w = parseFloat(value)
    const wErr = weightError(w, unit)
    if (wErr) {
      setError(wErr)
      return
    }
    if (!(forceDismissed || dupDismissed) && lastLog && entryDay(lastLog) === date) {
      setShowDuplicateWarning(true)
      return
    }
    setError('')
    setShowDuplicateWarning(false)
    void save.run(w)
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
          {(error || save.error) ? (
            <Alert variant="error" size="compact">{error || save.error}</Alert>
          ) : null}

          {showDuplicateWarning && lastLog ? (
            <Alert
              variant="warning"
              actions={[
                { label: 'Cancel', onPress: () => setShowDuplicateWarning(false) },
                {
                  label: 'Log Anyway',
                  primary: true,
                  onPress: () => { setDupDismissed(true); setShowDuplicateWarning(false); submit(true) },
                },
              ]}
            >
              Already logged today ({Math.round(lastValue ?? 0)} {wUnit}). Log again anyway?
            </Alert>
          ) : null}

          <StepperTile
            icon={Scale}
            label={`Weight (${wUnit})`}
            name="weight"
            step={BODYWEIGHT_STEP}
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
            title={save.busy ? 'Saving…' : 'Save'}
            onPress={() => submit()}
            loading={save.busy}
            disabled={!(parseFloat(value) > 0) || save.busy}
          />
        </View>
      </View>
      <NumericKeyboardAccessory />
    </Sheet>
  )
}
