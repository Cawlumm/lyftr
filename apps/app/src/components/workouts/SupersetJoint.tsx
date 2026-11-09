import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { Icon } from '../ui/Icon'
import { Link2, Unlink2 } from '../ui/icons'
import { WEB_BUTTON, touchTarget } from '../ui/interaction'
import { useTheme } from '../../theme/useTheme'

interface Props {
  linked: boolean
  aName: string
  bName: string
  onToggle: () => void
  disabled?: boolean
}

const BOX = 32
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

// The icon changes with the state and the label names the action, so linked-ness is never
// carried by colour alone. The pressable is padded to 44x44; the layout only gives up 32.
export function SupersetJoint({ linked, aName, bName, onToggle, disabled = false }: Props) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const hit = touchTarget(BOX, BOX, { disabled })
  const label = t(linked ? 'workouts.superset.unlinkNext' : 'workouts.superset.linkNext', { a: aName, b: bName })
  // Native screens speak the change with announceForAccessibility, a no-op on web; there the
  // joint carries its own live region, set only when the state actually flips.
  const [announcement, setAnnouncement] = useState('')
  const prev = useRef(linked)
  useEffect(() => {
    if (prev.current === linked) return
    prev.current = linked
    setAnnouncement(t(linked ? 'workouts.superset.linkedA11y' : 'workouts.superset.unlinkedA11y', { a: aName, b: bName }))
  }, [linked, aName, bName, t])
  return (
    <View className="items-center">
      <Pressable
        accessibilityRole={WEB_BUTTON ?? 'button'}
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        onPress={onToggle}
        disabled={disabled}
        style={hit.style}
        className={`items-center justify-center ${disabled ? 'opacity-40' : ''} ${hit.outer}`}
      >
        <View
          className={`h-8 w-8 items-center justify-center rounded-full border ${linked ? 'border-brand-500/40 bg-brand-500/10' : 'border-surface-border bg-surface-muted'} ${hit.inner}`}
        >
          <Icon icon={linked ? Unlink2 : Link2} size="md" color={linked ? accent : colors.txMuted} />
        </View>
      </Pressable>
      {Platform.OS === 'web' ? (
        <View accessibilityLiveRegion="polite" style={SR_ONLY}>
          <AppText>{announcement}</AppText>
        </View>
      ) : null}
    </View>
  )
}
