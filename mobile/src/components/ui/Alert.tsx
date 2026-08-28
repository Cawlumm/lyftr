import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native'
import { semanticInk } from '../../theme/theme'
import type { SemanticTone } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'


// Mirrors the web `.alert-*` primitives in web/src/index.css: tinted background at 10%,
// border at 20%, matching foreground, leading icon, same radius and padding.
//
// Foreground comes from semanticInk, not a fixed shade: the 400s these classes were
// written with fail WCAG AA on a light surface, and this app is light-first. See
// packages/shared's alertContrast test, which holds every pairing to 4.5:1.
const ICONS: Record<SemanticTone, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
}

const SURFACES: Record<SemanticTone, string> = {
  error: 'bg-error-500/10 border-error-500/20',
  success: 'bg-success-500/10 border-success-500/20',
  warning: 'bg-warning-500/10 border-warning-500/20',
  info: 'bg-brand-500/10 border-brand-500/20',
}

const FILLS: Record<SemanticTone, string> = {
  error: 'bg-error-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  info: 'bg-brand-500',
}

interface Props {
  variant: SemanticTone
  children: ReactNode
  className?: string
  /** 'compact' for dense surfaces — inside a sheet, where a full-size alert outweighs
   *  the copy it is qualifying and pushes the buttons off a short screen. */
  size?: 'default' | 'compact'
  /** Turns the alert into an inline confirm. Both weight-logging surfaces ask "already
   *  logged today, log again anyway?" and both had hand-rolled this row — identically,
   *  including the amber-on-amber confirm that measured 1.4:1 and had to be fixed twice.
   *  `primary` is the one that commits: solid fill, so it reads as the answer, not a hint. */
  actions?: { label: string; onPress: () => void; primary?: boolean }[]
}

export function Alert({ variant, children, className = '', size = 'default', actions }: Props) {
  const { isDark, brand } = useTheme()
  const Icon = ICONS[variant]
  const color = semanticInk[isDark ? 'dark' : 'light'][variant]
  const compact = size === 'compact'

  return (
    <View
      accessibilityRole="alert"
      className={`flex-row items-start rounded-lg border ${
        compact ? 'gap-2.5 px-3 py-2.5' : 'gap-3 p-3.5'
      } ${SURFACES[variant]} ${className}`}
    >
      <Icon size={compact ? 15 : 18} color={color} strokeWidth={2.2} style={{ marginTop: compact ? 1.5 : 1 }} />
      <View className="min-w-0 flex-1">
        <AppText variant={compact ? 'caption' : 'body'} style={{ color }}>
          {children}
        </AppText>
        {actions?.length ? (
          <View className="mt-2 flex-row gap-2">
            {actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={a.onPress}
                className={`rounded-lg px-3 py-1 ${
                  a.primary
                    ? `${FILLS[variant]} active:opacity-80`
                    : 'border border-surface-border bg-surface-overlay active:opacity-70'
                }`}
              >
                {a.primary ? (
                  // Near-black on a solid tint. The obvious `text-warning-400` here is the
                  // pairing that measured 1.4:1 — amber on amber.
                  <Text className="font-sans-semibold text-xs" style={{ color: brand.warningText }}>
                    {a.label}
                  </Text>
                ) : (
                  <AppText variant="caption" color="secondary">{a.label}</AppText>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}
