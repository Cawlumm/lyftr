import type { ReactNode } from 'react'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Check, Eye, EyeOff, X } from 'lucide-react-native'
import type { RuleState } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { Field } from './Field'
import { AppText } from './Typography'

// One rule, shown while typing. Mirrors web's `Rule` in web/src/components/ui/PasswordField —
// same three states, same colours, and the state itself comes from the shared
// newPasswordRules so the two apps cannot disagree about what passes.
export function PasswordRule({ state, children }: { state: RuleState; children: ReactNode }) {
  const { colors, brand } = useTheme()
  const color = state === 'ok' ? brand.success : state === 'bad' ? brand.error : colors.txMuted

  return (
    <View className="flex-row items-center gap-1.5">
      {state === 'ok' ? <Check size={12} color={color} strokeWidth={2.6} />
        : state === 'bad' ? <X size={12} color={color} strokeWidth={2.6} />
        : <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: color, opacity: 0.4 }} />}
      <AppText variant="caption" className="flex-1" style={{ color }}>{children}</AppText>
    </View>
  )
}

interface Props {
  label: string
  value: string
  onChangeText: (value: string) => void
  /** `password` for the existing one, `newPassword` to let the keychain offer to save. */
  textContentType: 'password' | 'newPassword'
  /** Rule rows rendered under the field. */
  children?: ReactNode
}

// The reveal toggle the auth screens already have (see IconInput's `password` prop in
// src/components/authui.tsx), for the screens built on `Field` instead. Change password
// asks for three in a row with no way to check what went in, which is the case that
// needs it most — and without it a typo and a forgotten password are indistinguishable.
//
// No Caps Lock warning here, unlike web: a soft keyboard shows its own shift state, and
// React Native surfaces no modifier state to read anyway.
export function PasswordField({ label, value, onChangeText, textContentType, children }: Props) {
  const { colors } = useTheme()
  const [visible, setVisible] = useState(false)

  return (
    <View className="gap-1.5">
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        rightSlot={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          >
            {visible
              ? <EyeOff size={18} color={colors.txMuted} strokeWidth={2} />
              : <Eye size={18} color={colors.txMuted} strokeWidth={2} />}
          </Pressable>
        }
      />
      {children}
    </View>
  )
}
