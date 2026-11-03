import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  apiErrorCode,
  catalogSyncLines,
  uiMessage,
  useTranslation,
  type ExerciseCacheStatus,
  type UiMessage,
} from '@lyftr/shared'
import { AppText, Button, ConfirmSheet, SettingsGroup, SettingsRow } from '../ui'
import { Library, RefreshCw } from '../ui/icons'
import { client } from '../../lib/lyftr'

// The exercise library's admin controls, ported from the Vite Settings page. Web only, as the
// cutover plan has it (C32): they act on the whole server, and the phone app never had them.
export function ExerciseCacheAdmin() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ExerciseCacheStatus | null>(null)
  const [busy, setBusy] = useState(false)
  // Carries whether it failed as well as what it said, so a failure does not read like news.
  const [result, setResult] = useState<{ message: UiMessage; failed: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<UiMessage | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await client.exerciseAPI.cacheStatus())
    } catch { /* a best-effort probe: without it the count reads as unknown */ }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const refreshed = (n: number): UiMessage => ({ key: 'settings.library.refreshed', params: { count: n, amount: n.toLocaleString() } })

  const refresh = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await client.exerciseAPI.refreshCache()
      setResult({ message: refreshed(res.refreshed), failed: false })
    } catch (err) {
      // The one refusal with a way forward: the catalog shrank, and an admin may accept it.
      if (apiErrorCode(err) === 'EXERCISE_CATALOG_SHRANK') {
        setConfirmError(null)
        setConfirming(true)
      } else {
        setResult({ message: { key: 'settings.library.refreshFailed', cause: err }, failed: true })
      }
    } finally {
      // Also after a failure: the failed-sync line is exactly what changed.
      void loadStatus()
      setBusy(false)
    }
  }

  const confirmRemovals = async () => {
    setBusy(true)
    setConfirmError(null)
    try {
      const res = await client.exerciseAPI.refreshCache({ confirmRemovals: true })
      setConfirming(false)
      setResult({ message: refreshed(res.refreshed), failed: false })
    } catch (err) {
      // Said in the dialog, under the button that was pressed, which stays open for a retry.
      setConfirmError({ key: 'settings.library.refreshFailed', cause: err })
    } finally {
      void loadStatus()
      setBusy(false)
    }
  }

  const lines = catalogSyncLines(status)

  return (
    <SettingsGroup title={t('settings.library.title')} footnote={t('settings.library.footnote')}>
      <SettingsRow
        icon={Library}
        label={t('settings.library.database.label')}
        description={t('settings.library.database.description')}
        value={status
          ? t('settings.library.cached', { count: status.count, amount: status.count.toLocaleString() })
          : t('settings.library.cachedUnknown')}
      />
      <View className="gap-2 border-t border-surface-border py-4">
        {lines.map((l) => (
          <AppText key={l.text} variant="caption" color={l.warning ? 'warning' : 'muted'}>{l.text}</AppText>
        ))}
        {result ? (
          <View role={result.failed ? 'alert' : 'status'}>
            <AppText variant="caption" color={result.failed ? 'error' : 'muted'}>{uiMessage(result.message)}</AppText>
          </View>
        ) : null}
        <View className="flex-row">
          <Button
            title={busy ? t('settings.library.refreshing') : t('settings.library.refresh')}
            variant="secondary"
            onPress={() => { void refresh() }}
            // A sync can take a minute or two; the words stay, where a spinner would drop the name.
            disabled={busy}
          />
        </View>
      </View>
      <ConfirmSheet
        open={confirming}
        icon={RefreshCw}
        title={t('settings.library.confirmRemovals.title')}
        message={t('settings.library.confirmRemovals.message')}
        confirmLabel={t('settings.library.confirmRemovals.confirm')}
        busyLabel={t('settings.library.refreshing')}
        busy={busy}
        error={confirmError ? uiMessage(confirmError) : undefined}
        onConfirm={() => { void confirmRemovals() }}
        onCancel={() => setConfirming(false)}
      />
    </SettingsGroup>
  )
}
