import { createContext, type ComponentProps, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native'
import { router, usePreventRemove, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAsyncAction, useTranslation } from '@lyftr/shared'
import { ArrowLeft, Trash2 } from './icons'
import { Alert } from './Alert'
import { Field } from './Field'
import { AppText } from './Typography'
import { Button } from './Button'
import { ConfirmSheet } from './ConfirmSheet'
import { ContentColumn } from './ContentColumn'
import { IconButton } from './IconButton'
import { KEYBOARD_DONE_ID, KeyboardDoneAccessory } from './KeyboardDoneAccessory'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { useSessionPillInset } from '../workouts/SessionPill'

const KeyboardIdContext = createContext(KEYBOARD_DONE_ID)

// The id of the Done bar this page mounts, for its inputs' `inputAccessoryViewID`. Each page has
// its own, so a page left mounted under this one cannot answer for its fields.
export const useFormKeyboardId = () => useContext(KeyboardIdContext)

// The unsaved-changes guard. While `dirty`, anything that would leave the screen (the back arrow,
// the system back, a browser Back) stops at a "Discard changes?" sheet. A save that navigates
// away itself calls `allowLeave()` first, or it would be stopped by its own page.
export function useDiscardGuard(dirty: boolean) {
  const [open, setOpen] = useState(false)
  const repeatRef = useRef<(() => void) | null>(null)
  const disable = usePreventRemove(dirty, ({ repeat }) => { repeatRef.current = repeat; setOpen(true) })
  return {
    open,
    allowLeave: disable,
    stay: () => setOpen(false),
    discard: () => { setOpen(false); disable(); repeatRef.current?.() },
  }
}
// A `Field` whose iOS Done bar is the one this page mounts.
export function FormField(props: ComponentProps<typeof Field>) {
  return <Field inputAccessoryViewID={useFormKeyboardId()} {...props} />
}

export type DiscardGuard = ReturnType<typeof useDiscardGuard>

interface Props {
  title: string
  subtitle?: ReactNode
  /** Where Back goes; defaults to history back, or `fallback` when there is none. */
  onBack?: () => void
  fallback?: Href
  guard?: DiscardGuard
  primary: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }
  /** Replaces the primary button when the page needs another pair of actions after a save. */
  footer?: ReactNode
  /** What the last action said, shown above the button it came from. */
  error?: string | null
  onRetry?: () => void
  destructive?: { label: string; confirmTitle: string; confirmMessage: string; confirmLabel: string; onConfirm: () => Promise<void> | void; failedMessage: string }
  scrollRef?: RefObject<ScrollViewInstance | null>
  children: ReactNode
}

// The page every full-screen form is built from: header with Back, a scroll that gives way to the
// keyboard, and a footer pinned above it holding the one primary action and whatever it just said.
export function FormPage({
  title, subtitle, onBack, fallback, guard, primary, footer, error, onRetry, destructive, scrollRef, children,
}: Props) {
  const { t } = useTranslation()
  const { lg } = useBreakpoint()
  const wide = Platform.OS === 'web' && lg
  const pillInset = useSessionPillInset()
  const [keyboardUp, setKeyboardUp] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const keyboardId = `form-done-${useId()}`

  useEffect(() => {
    if (Platform.OS === 'web') return
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false))
    return () => { show.remove(); hide.remove() }
  }, [])

  const back = () => {
    if (onBack) onBack()
    else if (router.canGoBack()) router.back()
    else if (fallback) router.replace(fallback)
  }

  const remove = useAsyncAction(async () => {
    await destructive?.onConfirm()
    setConfirmOpen(false)
  }, destructive?.failedMessage ?? '')

  return (
    <KeyboardIdContext.Provider value={keyboardId}>
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <ContentColumn role={Platform.OS === 'web' ? 'main' : undefined} maxWidth="medium">
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* A tap on space that is not a control puts the keyboard away (native; the web has no
                soft keyboard to dismiss). Taps on controls still reach them. */}
            <Pressable accessible={false} onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss} className="gap-4 py-4">
              <View className="flex-row items-center gap-3">
                <IconButton icon={ArrowLeft} label={t('common.goBack')} variant="ghost" size="md" onPress={back} />
                <View className="flex-1">
                  <AppText variant="title" headingLevel={1}>{title}</AppText>
                  {subtitle}
                </View>
              </View>
              {children}
              {destructive ? (
                <Button variant="danger" title={destructive.label} onPress={() => setConfirmOpen(true)} />
              ) : null}
            </Pressable>
          </ScrollView>

          <View className="-mx-5 gap-3 border-t border-surface-border bg-surface-base px-5 pb-2 pt-3" style={{ marginBottom: keyboardUp ? 0 : pillInset }}>
            {error ? (
              <Alert variant="error" size="compact">{error}</Alert>
            ) : null}
            {footer ?? (
              <View className={wide ? 'flex-row justify-end gap-3' : 'flex-row gap-3'}>
                {error && onRetry ? <Button className={wide ? 'min-w-32' : 'flex-1'} variant="secondary" title={t('common.tryAgain')} onPress={onRetry} /> : null}
                <Button
                  className={wide ? 'min-w-40' : 'flex-1'}
                  title={primary.label}
                  onPress={primary.onPress}
                  loading={primary.busy}
                  disabled={primary.disabled}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </ContentColumn>

      {destructive ? (
        <ConfirmSheet
          open={confirmOpen}
          icon={Trash2}
          destructive
          title={destructive.confirmTitle}
          message={destructive.confirmMessage}
          confirmLabel={destructive.confirmLabel}
          busy={remove.busy}
          error={remove.error ?? undefined}
          onConfirm={() => { void remove.run() }}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
      {guard ? (
        <ConfirmSheet
          open={guard.open}
          destructive
          title={t('common.discardTitle')}
          message={t('common.discardMessage')}
          confirmLabel={t('common.discardConfirm')}
          cancelLabel={t('common.keepEditing')}
          onConfirm={guard.discard}
          onCancel={guard.stay}
        />
      ) : null}
      <KeyboardDoneAccessory nativeID={keyboardId} />
    </SafeAreaView>
    </KeyboardIdContext.Provider>
  )
}
