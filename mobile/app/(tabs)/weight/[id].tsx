import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, Edit2, Scale, Trash2 } from 'lucide-react-native'
import { useAsyncAction, uiMessage, isNotFound, dayToInstant, displayWeight, maxWeight, resolveWeightLbs, weightError, weightShort, type WeightLog, entryDay, BODYWEIGHT_STEP, clampStep, formatDay, useTranslation, type UiMessage } from '@lyftr/shared'
import { Alert,
  AppText, Button, Card, ConfirmSheet, DateInput, ErrorState, Field, Label, Loading, NumberField,
  NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, Screen, StepperTile, deleteConfirmProps,
} from '../../../src/components/ui'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

export default function WeightDetail() {
  const { t } = useTranslation()
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>()
  const settings = useSettingsStore((s) => s.settings)
  const unit = settings.weight_unit
  const wUnit = weightShort(unit)
  const { colors, accent } = useTheme()

  const [log, setLog] = useState<WeightLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<UiMessage | null>(null)
  const [gone, setGone] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editWeight, setEditWeight] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  // The value the box was rejected for, not the sentence, so the banner follows a language switch.
  const [badWeight, setBadWeight] = useState<number | null>(null)

  // Delete confirm
  const [confirming, setConfirming] = useState(false)

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/weight'))

  useEffect(() => {
    client.weightAPI.get(Number(id))
      .then((data) => {
        setLog(data)
        setEditWeight(String(displayWeight(data.weight, unit)))
        setEditDate(entryDay(data))
        setEditNotes(data.notes ?? '')
        // Deep-link from the list kebab's Edit action opens straight into edit mode.
        if (edit) setEditing(true)
      })
      .catch((err) => {
        setGone(isNotFound(err))
        setError({ key: 'errors.unknown', cause: err })
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retryKey])

  const startEdit = () => {
    if (!log) return
    setEditWeight(String(displayWeight(log.weight, unit)))
    setEditDate(entryDay(log))
    setEditNotes(log.notes ?? '')
    setBadWeight(null)
    setEditing(true)
  }

  const saveEdit = useAsyncAction(async (entry: WeightLog) => {
    const updated = await client.weightAPI.update(entry.id, {
      // resolveWeightLbs keeps the original lbs when the shown 0.1 value is unchanged
      // (avoids kg round-trip drift); only converts when the user actually edited it.
      weight: resolveWeightLbs(editWeight, entry.weight, unit),
      notes: editNotes.trim(),
      logged_at: dayToInstant(editDate, entry.logged_at),
    })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setLog(updated)
    setEditing(false)
  }, t('common.saveFailed'))

  // `badWeight` is what this screen can say about the value in the box; the hook carries
  // what the server said. The entry is passed to run() because the guard above is what
  // proves it is not null.
  const handleSave = () => {
    if (!log || saveEdit.busy) return
    const w = parseFloat(editWeight)
    const wErr = weightError(w, unit)
    if (wErr) {
      setBadWeight(w)
      return
    }
    setBadWeight(null)
    void saveEdit.run(log)
  }

  // The catch here just closed up and left the screen unchanged, which is
  // indistinguishable from a tap that never registered. It says why now.
  const remove = useAsyncAction(async () => {
    if (!log) return
    await client.weightAPI.delete(log.id)
    goBack() // the list refetches on focus
  }, t('weight.deleteFailed'))

  const editError = badWeight == null ? '' : weightError(badWeight, unit) ?? ''

  if (loading) return <Loading />

  if (error || !log) {
    return (
      <Screen>
        <View className="flex-1 py-4">
          <ErrorState
            size="page"
            title={t('weight.detail.loadFailed')}
            message={error ? uiMessage(error) : t('weight.detail.gone')}
            onRetry={error && !gone ? () => { setError(null); setRetryKey((k) => k + 1) } : undefined}
            secondary={<Button title={t('weight.detail.backToWeight')} variant="secondary" onPress={goBack} />}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-5 py-4">
          {/* Back nav + actions */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">{t('weight.detail.back')}</AppText>
            </Pressable>
            {!editing ? (
              <View className="flex-row items-center gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('weight.detail.editLabel')}
                  onPress={startEdit}
                  hitSlop={6}
                  className="h-9 flex-row items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 active:scale-95"
                >
                  <Edit2 size={15} color={accent} strokeWidth={2.2} />
                  <AppText variant="label" style={{ color: accent }}>{t('common.edit')}</AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('weight.detail.deleteLabel')}
                  onPress={() => setConfirming(true)}
                  disabled={remove.busy}
                  hitSlop={6}
                  className={`h-9 w-9 items-center justify-center rounded-lg active:bg-error-500/10 ${remove.busy ? 'opacity-40' : ''}`}
                >
                  <Trash2 size={17} color={colors.txMuted} strokeWidth={2.2} />
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Hero card */}
          <Card>
            <View className="flex-row items-start gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                <Scale size={28} color={accent} />
              </View>
              <View className="min-w-0 flex-1">
                <Label className="mb-1">{t('weight.detail.entryLabel')}</Label>
                {editing ? (
                  <AppText variant="bodySemibold" color="brand">{t('weight.detail.editing')}</AppText>
                ) : (
                  <>
                    <View className="flex-row items-end gap-2">
                      <AppText variant="display" style={{ fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] }}>{displayWeight(log.weight, unit)}</AppText>
                      <AppText variant="body" color="muted" className="mb-1.5">{wUnit}</AppText>
                    </View>
                    <AppText variant="body" color="muted" className="mt-1">
                      {formatDay(entryDay(log), 'weekdayDate')}
                    </AppText>
                    {log.notes ? (
                      <AppText variant="body" color="secondary" className="mt-2 italic">"{log.notes}"</AppText>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </Card>

          {/* Edit form */}
          {editing ? (
            <Card>
              <AppText variant="heading" className="mb-4">{t('weight.detail.editTitle')}</AppText>
              <View className="gap-4">
                {editError || saveEdit.error ? (
                  <Alert variant="error" size="compact">{editError || saveEdit.error}</Alert>
                ) : null}

                <StepperTile
                  icon={Scale}
                  label={t('common.weightWithUnit', { unit: wUnit })}
                  name={t('common.weightName')}
                  step={BODYWEIGHT_STEP}
                  onStep={(d) => setEditWeight(String(clampStep(parseFloat(editWeight) || 0, d, { min: 0, max: maxWeight(unit) })))}
                >
                  <NumberField
                    inputMode="decimal"
                    value={editWeight}
                    onChange={setEditWeight}
                    placeholder="0"
                    accessibilityLabel={t('weight.log.weightField')}
                    inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  />
                </StepperTile>

                <DateInput label={t('weight.detail.date')} value={editDate} onChange={setEditDate} maximumDate={new Date()} />

                <Field
                  label={t('weight.detail.notesOptionalPlain')}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder={t('weight.notePlaceholder')}
                  maxLength={200}
                />

                <View className="flex-row items-center gap-2 pt-1">
                  <View className="flex-1">
                    <Button title={t('common.cancel')} variant="secondary" onPress={() => { setEditing(false); setBadWeight(null) }} />
                  </View>
                  <View className="flex-1">
                    <Button title={saveEdit.busy ? t('common.saving') : t('common.save')} onPress={handleSave} loading={saveEdit.busy} disabled={!(parseFloat(editWeight) > 0) || saveEdit.busy} />
                  </View>
                </View>
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmSheet
        {...deleteConfirmProps({
          title: t('weight.deleteTitle'),
          subject: t('weight.deleteSubject', { date: formatDay(entryDay(log), 'longDate'), weight: displayWeight(log.weight, unit), unit: wUnit }),
        })}
        open={confirming}
        busy={remove.busy}
        error={remove.error}
        onConfirm={() => { void remove.run() }}
        onCancel={() => { setConfirming(false); remove.reset() }}
      />
      {/* iOS Done bar above the numeric keyboard (the edit weight NumberField links it). */}
      <NumericKeyboardAccessory />
    </Screen>
  )
}
