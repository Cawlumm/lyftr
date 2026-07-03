import { ReactNode } from 'react'
import {
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../theme/useTheme'

// Screen wrapper — dark base surface + safe-area padding.
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className={`flex-1 px-5 ${className}`}>{children}</View>
    </SafeAreaView>
  )
}

// Card — raised surface with border, mirrors the web `.card` primitive.
export function Card({ children, className = '', ...rest }: ViewProps & { children: ReactNode; className?: string }) {
  return (
    <View className={`bg-surface-raised border border-surface-border rounded-xl p-4 ${className}`} {...rest}>
      {children}
    </View>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: 'bg-brand-500 active:bg-brand-700', text: 'text-white' },
  secondary: { bg: 'bg-surface-muted border border-surface-border', text: 'text-tx-primary' },
  ghost: { bg: '', text: 'text-tx-muted' },
  danger: { bg: 'bg-error-500/10 border border-error-500/20', text: 'text-error-400' },
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
}: {
  title: string
  onPress?: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  className?: string
}) {
  const v = VARIANT[variant]
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`h-12 rounded-lg flex-row items-center justify-center gap-2 ${v.bg} ${isDisabled ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className={`text-sm font-semibold ${v.text}`}>{title}</Text>
      )}
    </Pressable>
  )
}

// Labeled text field, mirrors the web `.input` + `.label` pattern.
export function Field({
  label,
  error,
  className = '',
  ...rest
}: TextInputProps & { label?: string; error?: string | null; className?: string }) {
  const { colors } = useTheme()
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-xs font-medium text-tx-secondary uppercase tracking-wide">{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.txMuted}
        className={`w-full px-3.5 h-12 bg-surface-overlay border rounded-lg text-tx-primary text-base ${error ? 'border-error-500' : 'border-surface-border'} ${className}`}
        {...rest}
      />
      {error ? <Text className="text-xs text-error-400">{error}</Text> : null}
    </View>
  )
}

// Section title.
export function H1({ children }: { children: ReactNode }) {
  return <Text className="text-2xl font-bold text-tx-primary">{children}</Text>
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-tx-secondary ${className}`}>{children}</Text>
}
