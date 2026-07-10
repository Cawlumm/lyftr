import { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { AppText } from './Typography'

interface Props {
  /** Strings get the standard row typography; pass a node for custom content. */
  primary: ReactNode
  secondary?: ReactNode
  /** Right-aligned slot — an IconButton, a value, a chevron. */
  right?: ReactNode
  onPress?: () => void
  className?: string
}

// Mobile-only extraction of the list-row pattern (weight history): primary +
// secondary text with a right-hand action, separated by hairline borders. Rendered
// as a Pressable only when tappable so non-interactive rows don't announce as
// buttons to screen readers.
export function ListRow({ primary, secondary, right, onPress, className = '' }: Props) {
  const body = (
    <>
      <View className="flex-1 pr-3">
        {typeof primary === 'string' ? (
          <AppText variant="bodySemibold">{primary}</AppText>
        ) : (
          primary
        )}
        {secondary ? (
          typeof secondary === 'string' ? (
            <AppText variant="caption">{secondary}</AppText>
          ) : (
            secondary
          )
        ) : null}
      </View>
      {right ?? null}
    </>
  )
  const rowClass = `flex-row items-center justify-between py-3 border-b border-surface-border ${className}`
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} className={`${rowClass} active:bg-surface-muted`}>
      {body}
    </Pressable>
  ) : (
    <View className={rowClass}>{body}</View>
  )
}
