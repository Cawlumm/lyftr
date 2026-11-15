import { View } from 'react-native'
import type { LucideIcon } from './icons'
import { useTheme } from '../../theme/useTheme'
import { AppText, Label } from './Typography'

// The heading over a form field: a muted glyph, the label, and an optional hint ("(required)").
// Muted rather than accent so a form of headers does not read busy; the accent stays for real signal.
export function FieldHeader({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
  const { colors } = useTheme()
  return (
    <View className="mb-2.5 flex-row items-center gap-2">
      <Icon size={14} color={colors.txMuted} strokeWidth={2.2} />
      <Label>{label}</Label>
      {hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}
    </View>
  )
}
