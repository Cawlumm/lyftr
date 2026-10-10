import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Check } from 'lucide-react-native'
import {
  useTranslation,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  LANGUAGE_ORDER,
  languageChoiceLabel,
  type Language,
  type LanguagePreference,
} from '@lyftr/shared'
import { AppText, ListRow, SearchField, Sheet } from '../ui'
import { useTheme } from '../../theme/useTheme'

// About 7 rows of ~48px fit in the 360px list below; search appears once the list stops fitting.
export const LANGUAGE_SEARCH_FROM = 8

// normalize() is missing or throws on some Hermes builds; plain lowercase still matches
// every unaccented query.
const fold = (s: string) => {
  try {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  } catch {
    return s.toLowerCase()
  }
}

export function filterLanguages(codes: readonly Language[], query: string): Language[] {
  const q = fold(query.trim())
  if (!q) return [...codes]
  return codes.filter((c) => fold(LANGUAGE_NAMES[c]).includes(q) || c.toLowerCase().includes(q))
}

interface Props {
  open: boolean
  value: LanguagePreference
  onSelect: (p: LanguagePreference) => void
  onClose: () => void
}

export function LanguageSheet({ open, value, onSelect, onClose }: Props) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const [query, setQuery] = useState('')
  const showSearch = SUPPORTED_LANGUAGES.length >= LANGUAGE_SEARCH_FROM
  const shown = filterLanguages(LANGUAGE_ORDER, showSearch ? query : '')

  const pick = (p: LanguagePreference) => {
    onClose()
    if (p !== value) onSelect(p)
  }
  const mark = (p: LanguagePreference) => (value === p ? <Check size={18} color={accent} /> : undefined)

  return (
    <Sheet open={open} onClose={onClose} haptic="selection">
      <View className="px-6">
        <View className="items-center pb-4">
          <AppText variant="heading">{t('settings.language.label')}</AppText>
        </View>
        {showSearch ? (
          <View className="pb-2">
            <SearchField value={query} onChangeText={setQuery} placeholder={t('settings.language.search')} />
          </View>
        ) : null}
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ListRow
            primary={languageChoiceLabel('system')}
            right={mark('system')}
            selected={value === 'system'}
            onPress={() => pick('system')}
          />
          {shown.map((code) => (
            <ListRow
              key={code}
              primary={<AppText variant="bodySemibold" accessibilityLanguage={code}>{LANGUAGE_NAMES[code]}</AppText>}
              right={mark(code)}
              selected={value === code}
              onPress={() => pick(code)}
            />
          ))}
          {shown.length === 0 ? (
            <AppText variant="caption" color="muted" className="py-3">{t('settings.language.noMatches')}</AppText>
          ) : null}
        </ScrollView>
      </View>
    </Sheet>
  )
}
