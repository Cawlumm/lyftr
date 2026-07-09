import { useState } from 'react'
import { Image, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'

type Size = 'row' | 'hero'

interface Props {
  url?: string
  /** 'row' = 44px (web w-11, list/exercise rows) · 'hero' = 56px (web w-14, detail header). */
  size?: Size
  /** Glyph shown when there's no image (web uses BookOpen for programs, Dumbbell for exercises). */
  fallbackIcon?: LucideIcon
}

const BOX: Record<Size, { box: string; icon: number }> = {
  row: { box: 'w-11 h-11', icon: 20 },
  hero: { box: 'w-14 h-14', icon: 24 },
}

// Exercise thumbnail with the web's onError fallback: missing/broken image_url →
// brand-tinted Dumbbell chip. The web hides the <img> element on error; RN Images
// can't be restyled after failing, so we swap components via state instead.
export function ExerciseImage({ url, size = 'row', fallbackIcon: Fallback = Dumbbell }: Props) {
  // Icon color is an SVG prop (documented className exception) — accent keeps the
  // cyan legible on both themes.
  const { accent } = useTheme()
  const [failed, setFailed] = useState(false)

  const s = BOX[size]
  if (!url || failed) {
    return (
      <View className={`${s.box} rounded-xl bg-brand-500/10 border border-brand-500/20 items-center justify-center`}>
        <Fallback size={s.icon} color={accent} strokeWidth={2} />
      </View>
    )
  }
  return (
    <Image
      source={{ uri: url }}
      onError={() => setFailed(true)}
      resizeMode="cover"
      className={`${s.box} rounded-xl bg-surface-muted`}
    />
  )
}
