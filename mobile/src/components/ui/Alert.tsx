import type { ReactNode } from 'react'
import { View } from 'react-native'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native'
import { semanticInk } from '../../theme/theme'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

type Variant = 'error' | 'success' | 'warning' | 'info'

// Mirrors the web `.alert-*` primitives in web/src/index.css: tinted background at 10%,
// border at 20%, matching foreground, leading icon, same radius and padding.
//
// Mobile had no equivalent, so form-level messages were hand-rolled per screen as a bare
// icon-plus-text row — legible, but visibly lighter than the boxed alert the same message
// gets on web. AuthError in components/authui.tsx is the sign-in screens' own copy of this
// idea; screens built on the standard ui kit should use this one.
// The `Soft` tokens are the 400s — web's alerts colour their text and icon at 400, not
// the 500 used for the tint and border.
const ICONS: Record<Variant, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
}

const SURFACES: Record<Variant, string> = {
  error: 'bg-error-500/10 border-error-500/20',
  success: 'bg-success-500/10 border-success-500/20',
  warning: 'bg-warning-500/10 border-warning-500/20',
  info: 'bg-brand-500/10 border-brand-500/20',
}

interface Props {
  variant: Variant
  children: ReactNode
  className?: string
  /** 'compact' for dense surfaces — inside a sheet, where a full-size alert outweighs
   *  the copy it is qualifying and pushes the buttons off a short screen. */
  size?: 'default' | 'compact'
}

export function Alert({ variant, children, className = '', size = 'default' }: Props) {
  const { isDark } = useTheme()
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
      <AppText variant={compact ? 'caption' : 'body'} className="flex-1" style={{ color }}>
        {children}
      </AppText>
    </View>
  )
}
