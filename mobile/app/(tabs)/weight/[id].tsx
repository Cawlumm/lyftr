import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { format, parseISO } from 'date-fns'
import * as Haptics from 'expo-haptics'
import { AlertCircle, ArrowLeft, Edit2, Scale, Trash2 } from 'lucide-react-native'
import {
  apiErrorMessage, dayToIsoNoon, displayWeight, isoToDayInput, maxWeight, resolveWeightLbs,
  weightError, weightShort, type WeightLog,
} from '@lyftr/shared'
import {
  AppText, Button, Card, ConfirmSheet, DateInput, Field, Label, Loading, NumberField,
  NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, Screen, StepperTile, deleteConfirmProps,
} from '../../../src/components/ui'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { clampStep } from '../../../src/utils/number'
import { useTheme } from '../../../src/theme/useTheme'

export default function WeightDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>()
  const settings = useSettingsStore((s) => s.settings)
  const unit = settings.weight_unit
  const wUnit = weightShort(unit)
  const { colors, accent, brand } = useTheme()

  const [log, setLog] = useState<WeightLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editWeight, setEditWeight] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirm
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/weight'))

  useEffect(() => {
    client.weightAPI.get(Number(id))
      .then((data) => {
        setLog(data)
        setEditWeight(String(displayWeight(data.weight, unit)))
        setEditDate(isoToDayInput(data.logged_at))
        setEditNotes(data.notes ?? '')
        // Deep-link from the list kebab's Edit action opens straight into edit mode.
        if (edit) setEditing(true)
      })
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load entry')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const startEdit = () => {
    if (!log) return
    setEditWeight(String(displayWeight(log.weight, unit)))
    setEditDate(isoToDayInput(log.logged_at))
    setEditNotes(log.notes ?? '')
    setEditError('')
    setEditing(true)
  }

  const handleSave = async () => {
    if (!log || saving) return
    const w = parseFloat(editWeight)
    const wErr = weightError(w, unit)
    if (wErr) {
      setEditError(wErr)
      return
    }
    setSaving(true)
    setEditError('')
    try {
      const updated = await client.weightAPI.update(log.id, {
        // resolveWeightLbs keeps the original lbs when the shown 0.1 value is unchanged
        // (avoids kg round-trip drift); only converts when the user actually edited it.
        weight: resolveWeightLbs(editWeight, log.weight, unit),
        notes: editNotes.trim(),
        logged_at: dayToIsoNoon(editDate),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setLog(updated)
      setEditing(false)
    } catch (err) {
      setEditError(apiErrorMessage(err, 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!log || deleting) return
    setDeleting(true)
    try {
      await client.weightAPI.delete(log.id)
      goBack() // the list refetches on focus
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (loading) return <Loading />

  if (error || !log) {
    return (
      <Screen>
        <View className="gap-4 py-4">
          <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-2 self-start active:opacity-60">
            <ArrowLeft size={16} color={colors.txMuted} />
            <AppText variant="body" color="muted">Weight</AppText>
          </Pressable>
          <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
            <AlertCircle size={18} color={brand.errorSoft} />
            <Text className="flex-1 font-sans text-sm text-error-400">{error || 'Entry not found'}</Text>
          </View>
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
              <AppText variant="body" color="muted">Weight</AppText>
            </Pressable>
            {!editing ? (
              <View className="flex-row items-center gap-1">
                <Pressable onPress={startEdit} hitSlop={8} className="p-2 active:opacity-60" accessibilityLabel="Edit entry">
                  <Edit2 size={18} color={accent} />
                </Pressable>
                <Pressable onPress={() => setConfirming(true)} hitSlop={8} className="p-2 active:opacity-60" accessibilityLabel="Delete entry">
                  <Trash2 size={18} color={brand.errorSoft} />
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
                <Label className="mb-1">Weight Entry</Label>
                {editing ? (
                  <AppText variant="bodySemibold" color="brand">Editing…</AppText>
                ) : (
                  <>
                    <View className="flex-row items-end gap-2">
                      <AppText variant="display" style={{ fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] }}>{displayWeight(log.weight, unit)}</AppText>
                      <AppText variant="body" color="muted" className="mb-1.5">{wUnit}</AppText>
                    </View>
                    <AppText variant="body" color="muted" className="mt-1">
                      {format(parseISO(log.logged_at), 'EEEE, MMMM d, yyyy')}
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
              <AppText variant="heading" className="mb-4">Edit Entry</AppText>
              <View className="gap-4">
                {editError ? (
                  <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 px-4 py-3">
                    <AlertCircle size={16} color={brand.errorSoft} />
                    <Text className="flex-1 font-sans text-sm text-error-400">{editError}</Text>
                  </View>
                ) : null}

                <StepperTile
                  icon={Scale}
                  label={`Weight (${wUnit})`}
                  name="weight"
                  step={0.5}
                  onStep={(d) => setEditWeight(String(clampStep(parseFloat(editWeight) || 0, d, { min: 0, max: maxWeight(unit) })))}
                >
                  <NumberField
                    inputMode="decimal"
                    value={editWeight}
                    onChange={setEditWeight}
                    placeholder="0"
                    accessibilityLabel="Weight"
                    inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  />
                </StepperTile>

                <DateInput label="Date" value={editDate} onChange={setEditDate} maximumDate={new Date()} />

                <Field
                  label="Notes (optional)"
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="e.g., morning, post-workout"
                  maxLength={200}
                />

                <View className="flex-row items-center gap-2 pt-1">
                  <View className="flex-1">
                    <Button title="Cancel" variant="secondary" onPress={() => { setEditing(false); setEditError('') }} />
                  </View>
                  <View className="flex-1">
                    <Button title={saving ? 'Saving…' : 'Save'} onPress={handleSave} loading={saving} disabled={!(parseFloat(editWeight) > 0) || saving} />
                  </View>
                </View>
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmSheet
        {...deleteConfirmProps({
          title: 'Delete Entry?',
          subject: `${format(parseISO(log.logged_at), 'MMMM d, yyyy')} · ${displayWeight(log.weight, unit)} ${wUnit}`,
        })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
      {/* iOS Done bar above the numeric keyboard (the edit weight NumberField links it). */}
      <NumericKeyboardAccessory />
    </Screen>
  )
}
