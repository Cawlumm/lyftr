import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useTranslation } from '@lyftr/shared'
import { AppText, Button, Icon, Menu, Tooltip } from '../src/components/ui'
import { Check, Info, Pencil, Trash2 } from '../src/components/ui/icons'

// A test surface for the web Tooltip and Menu until real screens adopt them (the user menu in
// C20, chart tooltips in C22); delete it then. Nothing links here, and it renders only on web
// with a localStorage flag the e2e sets, so everyone else lands on the home redirect. Copy
// reuses existing catalog keys so no dev-only strings enter the translations.
const STORY_FLAG = 'lyftr:dev-stories'

export default function OverlayStory() {
  const { t } = useTranslation()
  const [picked, setPicked] = useState('')
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
      <View className="flex-row justify-end">
        <Menu label={t('workouts.card.optionsNamed', { name: t('common.notes') })} items={items} />
      </View>
    </View>
  )
}
