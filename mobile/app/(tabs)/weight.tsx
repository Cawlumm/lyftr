import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  useWindowDimensions,
} from 'react-native'
import { format, parseISO } from 'date-fns'
import { Trash2 } from 'lucide-react-native'
import { Screen, H1, Card, Field, Button, Muted, ConfirmSheet, deleteConfirmProps } from '../../src/components/ui'
import { WeightChart } from '../../src/components/WeightChart'
import { client, useSettingsStore } from '../../src/lib/lyftr'
import {
  displayWeight,
  displayToLbs,
  weightError,
  weightShort,
  type WeightLog,
  type WeightStats,
} from '@lyftr/shared'

export default function Weight() {
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const unit = settings.weight_unit
  const { width } = useWindowDimensions()

  const [logs, setLogs] = useState<WeightLog[]>([])
  const [stats, setStats] = useState<WeightStats | null>(null)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WeightLog | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([
      client.weightAPI.list({ limit: 60 }).catch(() => [] as WeightLog[]),
      client.weightAPI.stats().catch(() => null),
    ])
    setLogs(list)
    setStats(s)
  }, [])

  useEffect(() => {
    fetchSettings()
    load()
  }, [fetchSettings, load])

  const add = async () => {
    const value = parseFloat(input)
    const validationError = weightError(value, unit)
    if (validationError) {
      setErr(validationError)
      return
    }
    setSaving(true)
    setErr(null)
    try {
      await client.weightAPI.log({
        weight: displayToLbs(value, unit),
        logged_at: new Date().toISOString(),
      })
      setInput('')
      await load()
    } catch {
      setErr("Couldn't save — check your connection.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    await client.weightAPI.delete(pendingDelete.id).catch(() => {})
    await load()
    setDeleting(false)
    setPendingDelete(null)
  }

  // Chart wants oldest -> newest in the display unit.
  const chartValues = [...logs]
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    .map((l) => displayWeight(l.weight, unit))

  return (
    <Screen>
      <FlatList
        data={logs}
        keyExtractor={(l) => String(l.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-6 py-4">
            <H1>Weight</H1>

            <Card>
              <View className="flex-row items-end gap-3">
                <View className="flex-1">
                  <Field
                    label={`New entry (${weightShort(unit)})`}
                    value={input}
                    onChangeText={(t) => { setErr(null); setInput(t) }}
                    keyboardType="decimal-pad"
                    placeholder="185"
                    error={err}
                  />
                </View>
                <Button title="Log" onPress={add} loading={saving} className="px-6" />
              </View>
            </Card>

            {stats ? (
              <Card>
                <Muted className="text-xs uppercase">Trend</Muted>
                <View className="flex-row justify-between mt-2 mb-3">
                  <Stat label="Latest" value={displayWeight(stats.latest, unit)} unit={weightShort(unit)} />
                  <Stat label="30d" value={displayWeight(stats.change_30d, unit)} unit={weightShort(unit)} signed />
                  <Stat label="Avg" value={displayWeight(stats.avg, unit)} unit={weightShort(unit)} />
                </View>
                <WeightChart values={chartValues} width={width - 72} />
              </Card>
            ) : null}

            <Muted className="text-xs uppercase">History</Muted>
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between py-3 border-b border-surface-border">
            <View>
              <Text className="text-tx-primary text-base font-semibold">
                {displayWeight(item.weight, unit)} {weightShort(unit)}
              </Text>
              <Muted className="text-xs">{format(parseISO(item.logged_at), 'EEE, MMM d')}</Muted>
            </View>
            <Pressable onPress={() => setPendingDelete(item)} hitSlop={12} className="p-2">
              <Trash2 color="#f87171" size={18} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Muted className="text-center mt-8">No entries yet — log your first weigh-in above.</Muted>}
      />

      <ConfirmSheet
        {...deleteConfirmProps({
          title: 'Delete Entry?',
          subject: pendingDelete ? `${displayWeight(pendingDelete.weight, unit)} ${weightShort(unit)}` : '',
        })}
        open={!!pendingDelete}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  )
}

function Stat({ label, value, unit, signed }: { label: string; value: number; unit: string; signed?: boolean }) {
  return (
    <View className="items-center">
      <Text className="text-tx-primary text-lg font-bold">
        {signed && value >= 0 ? '+' : ''}{value}
        <Text className="text-tx-muted text-sm font-medium"> {unit}</Text>
      </Text>
      <Muted className="text-xs">{label}</Muted>
    </View>
  )
}
