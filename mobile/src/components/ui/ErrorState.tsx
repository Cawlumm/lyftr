import type { ReactNode } from 'react'
import { View } from 'react-native'
import { semanticInk } from '../../theme/theme'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'
import { Button } from './Button'
import { BarbellBroken } from './BarbellBroken'

// A load that failed, said as a state rather than as an alert over the wreckage.
// Mirrors web ui/ErrorState beat for beat — same mark, same anatomy, same sizes — so the
// two platforms do not merely behave alike, they read as one screen.
//
// Empty and error are different outcomes: empty means we heard back and there is nothing,
// error means we did not hear back at all. Drawing the screen's components anyway — a KPI
// tile reading 0, a ring at 0 kcal — states the first while the second is true.
//
// `size` follows the rule the design systems converge on: page when the whole screen is
// unusable, section when one region inside a working screen failed. A failed list keeps
// its search field and its create button, so that is a section.
interface Props {
  /** What we were trying to load, in the app's words: "Couldn't load your dashboard". */
  title: string
  /** The cause, from apiErrorMessage — already specific, so the mark stays constant. */
  message: string
  size?: 'page' | 'section'
  onRetry?: () => void
  retryLabel?: string
  /** One escape hatch at most, for when retrying is not the answer. */
  secondary?: ReactNode
}

export function ErrorState({
  title,
  message,
  size = 'section',
  onRetry,
  retryLabel = 'Try again',
  secondary,
}: Props) {
  const { isDark } = useTheme()
  // Status colour, not the muted grey of an empty state — and via semanticInk because
  // the raw 400s fail AA on this app's light surface (see alertContrast.test.ts).
  const ink = semanticInk[isDark ? 'dark' : 'light'].error
  const page = size === 'page'

  return (
    <View
      accessibilityRole="alert"
      className={`items-center justify-center px-6 ${page ? 'flex-1 py-16 gap-3' : 'py-10 gap-2.5'}`}
    >
      <BarbellBroken size={page ? 64 : 44} color={ink} />
      <View className="gap-1">
        <AppText variant={page ? 'title' : 'bodySemibold'} className="text-center">
          {title}
        </AppText>
        <AppText variant="body" color="muted" className="text-center">
          {message}
        </AppText>
      </View>
      {onRetry || secondary ? (
        <View className="mt-1 flex-row flex-wrap items-center justify-center gap-2">
          {onRetry ? <Button title={retryLabel} onPress={onRetry} /> : null}
          {secondary}
        </View>
      ) : null}
    </View>
  )
}
