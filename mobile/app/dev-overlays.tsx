import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useTranslation } from '@lyftr/shared'
import { AppText, Button, Icon, Menu, Sheet, Tooltip } from '../src/components/ui'
import { Check, Info, Pencil, Trash2 } from '../src/components/ui/icons'

// A test surface for the web Tooltip and Menu until real screens adopt them (the user menu in
// C20, chart tooltips in C22); delete it then. Nothing links here, and it renders only on web
// with a localStorage flag the e2e sets, so everyone else lands on the home redirect. Copy
// reuses existing catalog keys so no dev-only strings enter the translations.
const STORY_FLAG = 'lyftr:dev-stories'

export default function OverlayStory() {
  const { t } = useTranslation()
  const [picked, setPicked] = useState('')
  const [sheet, setSheet] = useState(false)
  if (Platform.OS !== 'web' || window.localStorage.getItem(STORY_FLAG) !== '1') return <Redirect href="/" />

  const items = [
    { label: t('common.edit'), icon: Pencil, onSelect: () => setPicked(t('common.edit')) },
    { label: t('common.delete'), icon: Trash2, destructive: true, onSelect: () => setPicked(t('common.delete')) },
    { label: t('common.done'), icon: Check, onSelect: () => setPicked(t('common.done')) },
    { label: t('common.save'), onSelect: () => setPicked(t('common.save')) },
  ]

  return (
    <View className="flex-1 justify-between bg-surface-base p-6">
      <View className="flex-row items-center gap-4">
        <Tooltip content={t('common.card.cannotUndo')}>
          <Button title={t('common.delete')} variant="secondary" />
        </Tooltip>
        <Tooltip content={t('common.rest.timerOff')} side="bottom">
          <Icon icon={Info} label={t('common.notes')} />
        </Tooltip>
        <Menu label={t('workouts.card.options')} items={items} align="start" />
      </View>
      <AppText testID="picked">{picked}</AppText>
      {/* A menu and a tooltip inside a sheet, tall enough that a short window must scroll it. */}
      <Sheet open={sheet} onClose={() => setSheet(false)} labelledBy="story-sheet-title">
        <View className="gap-3 px-6">
          <AppText nativeID="story-sheet-title" variant="title">{t('common.notes')}</AppText>
          <View className="flex-row items-center gap-4">
            <Tooltip content={t('common.card.cannotUndo')}>
              <Button title={t('common.save')} variant="secondary" />
            </Tooltip>
            <Menu label={t('workouts.card.options')} items={items} />
          </View>
          {Array.from({ length: 12 }, (_, i) => (
            <AppText key={i} testID="story-sheet-row">{t('common.done')}</AppText>
          ))}
          <Button title={t('common.cancel')} variant="secondary" onPress={() => setSheet(false)} />
        </View>
      </Sheet>
      <View className="flex-row items-center justify-end gap-4">
        <Menu label={t('workouts.card.optionsNamed', { name: t('common.notes') })} items={items} />
        <Button title={t('common.edit')} variant="secondary" onPress={() => setSheet(true)} />
      </View>
    </View>
  )
}
