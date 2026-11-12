import { useState } from 'react'
import { Image, View } from 'react-native'
import { exerciseThumbUrl } from '@lyftr/shared'
import { Dumbbell } from '../ui/icons'
import type { LucideIcon } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'
import { useImageRetry } from '../../hooks/useImageRetry'
import { useServerStore } from '../../lib/lyftr'

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
// An oedb image is drawn from the server's 192px thumbnail (exerciseThumbUrl). If that fails
// once - a server older than the app has no such route - it falls back to the original for
// good, and the original gets useImageRetry's usual single retry.
export function ExerciseImage({ url, size = 'row', fallbackIcon: Fallback = Dumbbell }: Props) {
  // Icon color is an SVG prop (documented className exception) — accent keeps the
  // cyan legible on both themes.
  const { accent } = useTheme()
  const serverUrl = useServerStore((st) => st.serverUrl)
  const thumb = exerciseThumbUrl(url, serverUrl)
  const [brokenThumb, setBrokenThumb] = useState<string>()
  const src = thumb && thumb !== brokenThumb ? thumb : url
  const { failed, key, onError } = useImageRetry(src)

  const s = BOX[size]
  if (!src || failed) {
    return (
      <View className={`${s.box} rounded-xl bg-brand-500/10 border border-brand-500/20 items-center justify-center`}>
        <Fallback size={s.icon} color={accent} strokeWidth={2} />
      </View>
    )
  }
  return (
    <Image
      key={key}
      source={{ uri: src }}
      onError={src === thumb ? () => setBrokenThumb(thumb) : onError}
      resizeMode="cover"
      className={`${s.box} rounded-xl bg-surface-muted`}
    />
  )
}
