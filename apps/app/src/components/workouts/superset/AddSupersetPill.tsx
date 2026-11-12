import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../../ui'
import { Icon } from '../../ui/Icon'
import { Plus } from '../../ui/icons'
import { WEB_BUTTON, interactive, touchTarget } from '../../ui/interaction'
import { useTheme } from '../../../theme/useTheme'

export interface AddSupersetPillProps {
  /** Names for the accessible label: "Superset Bench with Row". */
  aName: string
  bName: string
  onPress: () => void
  disabled?: boolean
}

const W = 104
const H = 32

// Between two unlinked neighbours in an editor: a labelled "+ Superset" that opens the sheet
// preselected. Visually 32px tall, hit area padded to 44.
export function AddSupersetPill({ aName, bName, onPress, disabled = false }: AddSupersetPillProps) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const hit = touchTarget(W, H, { disabled })
  return (
    <View className="items-center">
      <Pressable
        accessibilityRole={WEB_BUTTON ?? 'button'}
        accessibilityLabel={t('workouts.superset.addPillLabel', { a: aName, b: bName })}
        accessibilityState={{ disabled }}
        onPress={onPress}
        disabled={disabled}
        style={hit.style}
        className={`items-center justify-center ${disabled ? 'opacity-40' : ''} ${hit.outer} ${interactive('', { disabled })}`}
      >
        <View
          className={`h-8 flex-row items-center justify-center gap-1 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 group-hover/hit:bg-brand-500/20 ${hit.inner}`}
        >
          <Icon icon={Plus} size={14} color={accent} strokeWidth={2.6} />
          <AppText variant="caption" className="font-sans-bold" style={{ color: accent }}>{t('workouts.superset.addPill')}</AppText>
        </View>
      </Pressable>
    </View>
  )
}
