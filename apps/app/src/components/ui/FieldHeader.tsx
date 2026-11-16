import { Platform, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import type { LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { SR_ONLY } from './interaction'
import { AppText, Label } from './Typography'

// A required field's "*". The star itself is decorative to assistive tech (W3C H90): it is never
// read as "star". The field's required state is said once, as "required": by the header here
// (hidden text on web, the label on native), or on web by the input's aria-required instead,
// when `input` says the field below carries WEB_REQUIRED, so it is not said twice.
export function RequiredMark({ input = false }: { input?: boolean }) {
  const { t } = useTranslation()
  if (Platform.OS === 'web') {
    return (
      <>
        <AppText variant="label" color="error" aria-hidden>*</AppText>
        {input ? null : <AppText style={SR_ONLY}>{t('common.required')}</AppText>}
      </>
    )
  }
  return <AppText variant="label" color="error" accessibilityLabel={t('common.required')}>*</AppText>
}

// The one line at the top of a form that says what the star means (WCAG 3.3.2).
export function RequiredLegend() {
  const { t } = useTranslation()
  return (
    <View className="flex-row items-center gap-1">
      <AppText variant="caption" color="error" aria-hidden accessibilityElementsHidden importantForAccessibility="no">*</AppText>
      <AppText variant="caption" color="muted">{t('common.requiredLegend')}</AppText>
    </View>
  )
}

// The heading over a form field: a muted glyph, the label, a "*" when it is required, and an
// optional hint ("One step per line"). Unmarked means optional; nothing says so in words.
// `required`: the header says "required" (a group of choices, a list). `requiredInput`: the text
// field below has WEB_REQUIRED, which says it on web, so there the star is all the header adds.
// Muted rather than accent so a form of headers does not read busy; the accent stays for real signal.
export function FieldHeader({ icon: Icon, label, required, requiredInput, hint }: { icon: LucideIcon; label: string; required?: boolean; requiredInput?: boolean; hint?: string }) {
  const { colors } = useTheme()
  return (
    <View className="mb-2.5 flex-row items-center gap-2">
      <Icon size={14} color={colors.txMuted} strokeWidth={2.2} />
      <View className="flex-row items-center gap-0.5">
        <Label>{label}</Label>
        {required || requiredInput ? <RequiredMark input={!!requiredInput} /> : null}
      </View>
      {hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}
    </View>
  )
}
