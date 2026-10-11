import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft, MailCheck } from 'lucide-react-native'
import { useAsyncAction, useTranslation, emailChanged, onlyLetterCaseChanged } from '@lyftr/shared'
import {
  Alert,
  AppText,
  Button,
  Card,
  Field,
  PageHeader,
  PasswordField,
  Screen,
} from '../../../src/components/ui'
import { useAuthStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'

// Its own screen, laid out like password.tsx and matching web's /settings/email. It needs
// the current password, so it cannot be an inline row like the name, and it confirms with a
// card rather than popping back because the sign-in identifier changed: a consequence the
// person has to be told about.
export default function ChangeEmailScreen() {
  const { t } = useTranslation()
  const { colors, brand } = useTheme()
  const user = useAuthStore((s) => s.user)
  const changeEmail = useAuthStore((s) => s.changeEmail)

  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [changedTo, setChangedTo] = useState<string | null>(null)
  const [caseOnly, setCaseOnly] = useState(false)

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'))

  const save = useAsyncAction(async () => {
    const onlyCase = onlyLetterCaseChanged(email, user?.email)
    const updated = await changeEmail(email, current)
    setCurrent('')
    setCaseOnly(onlyCase)
    setChangedTo(updated.email)
  }, t('settings.account.email.changeFailed'))

  const ready = emailChanged(email, user?.email) && !!current

  const submit = () => {
    if (!ready) return
    void save.run()
  }

  const backLink = (
    <Pressable
      onPress={back}
      hitSlop={8}
      className="flex-row items-center gap-1.5 self-start active:opacity-60"
    >
      <ArrowLeft size={16} color={colors.txMuted} />
      <AppText variant="body" color="muted">{t('settings.account.backLink')}</AppText>
    </Pressable>
  )

  if (changedTo !== null) {
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-5 py-4">
            {backLink}
            <Card className="items-center gap-3 p-6">
              <View className="h-12 w-12 items-center justify-center rounded-full border border-success-500/20 bg-success-500/10">
                <MailCheck size={24} color={brand.successSoft} strokeWidth={2.2} />
              </View>
              <View className="gap-1">
                <AppText variant="title" className="text-center">{t('settings.account.email.changedTitle')}</AppText>
                <AppText variant="body" color="muted" className="text-center">
                  {t('settings.account.email.signInWithPlain', { email: changedTo })}{' '}
                  {caseOnly
                    ? t('settings.account.email.caseOnly')
                    : t('settings.account.email.signedOutElsewhere')}
                </AppText>
              </View>
              <Button title={t('settings.account.backToSettings')} variant="secondary" onPress={back} className="mt-1" />
            </Card>
          </View>
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-5 py-4">
          {backLink}
          <PageHeader
            title={t('settings.account.email.pageTitle')}
            subtitle={t('settings.account.email.pageSubtitle')}
          />

          <Card className="gap-4">
            <View className="gap-1">
              <AppText variant="caption" color="muted">{t('settings.account.email.current')}</AppText>
              <AppText variant="body">{user?.email ?? '—'}</AppText>
            </View>

            <Field
              label={t('settings.account.email.new')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
            />
            <PasswordField
              label={t('settings.account.password.current')}
              value={current}
              onChangeText={setCurrent}
              textContentType="password"
            />

            {save.error ? <Alert variant="error">{save.error}</Alert> : null}

            <View className="flex-row gap-2">
              <Button
                title={t('settings.account.email.submit')}
                onPress={submit}
                loading={save.busy}
                disabled={!ready}
                className="flex-1"
              />
              <Button
                title={t('common.cancel')}
                variant="secondary"
                onPress={back}
                disabled={save.busy}
                className="flex-1"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  )
}
