import { useState } from 'react'
import { Image, View } from 'react-native'
import { exerciseThumbUrl } from '@lyftr/shared'
import { Dumbbell } from '../ui/icons'
import type { LucideIcon } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'
import { useImageRetry } from '../../hooks/useImageRetry'
import { useServerStore } from '../../lib/lyftr'
import { useExercisePhoto } from '../../hooks/useExercisePhoto'

type Size = 'row' | 'hero'

interface Props {
  url?: string
  /** 'row' = 44px (web w-11, list/exercise rows) · 'hero' = 56px (web w-14, detail header). */
  size?: Size
  /** Glyph shown when there's no image (web uses BookOpen for programs, Dumbbell for exercises). */
  fallbackIcon?: LucideIcon
  /** A custom exercise's own picture. With a photoId it replaces `url`; without one nothing changes. */
  photo?: { exerciseId: number; photoId?: string }
}

// Thumbnail URLs that already failed, for the life of the app: a server without the thumbs route
// fails every one, and remembering per row would retry it each time a row scrolls back in.
const brokenThumbs = new Set<string>()
export function forgetBrokenThumbs() {
  brokenThumbs.clear()
}

const BOX: Record<Size, { box: string; icon: number }> = {
  row: { box: 'w-11 h-11', icon: 20 },
  hero: { box: 'w-14 h-14', icon: 24 },
}

// Exercise thumbnail with the web's onError fallback: missing/broken image_url →
// brand-tinted Dumbbell chip. The web hides the <img> element on error; RN Images
// can't be restyled after failing, so we swap components via state instead.
// An oedb image is drawn from the server's 192px thumbnail (exerciseThumbUrl). If that fails
// once - a server older than the app has no such route - every row falls back to the original
// for good, and the original gets useImageRetry's usual single retry.
export function ExerciseImage({ url, size = 'row', fallbackIcon: Fallback = Dumbbell, photo }: Props) {
  // Icon color is an SVG prop (documented className exception) — accent keeps the
  // cyan legible on both themes.
  const { accent } = useTheme()
  const serverUrl = useServerStore((st) => st.serverUrl)
  const thumb = exerciseThumbUrl(url, serverUrl)
  const [, setBroken] = useState(0)
  const src = thumb && !brokenThumbs.has(thumb) ? thumb : url
  const { failed, key, onError } = useImageRetry(src)
  // The 192px thumbnail is plenty for the 44/56px box. Until it arrives, or if it never does,
  // the icon chip stands in.
  const own = useExercisePhoto(photo?.exerciseId ?? 0, 'thumb', photo?.photoId)

  const s = BOX[size]
  if (photo?.photoId) {
    if (own.uri) {
      return <Image source={{ uri: own.uri }} resizeMode="cover" className={`${s.box} rounded-xl bg-surface-muted`} />
    }
    return (
      <View className={`${s.box} rounded-xl bg-brand-500/10 border border-brand-500/20 items-center justify-center`}>
        <Fallback size={s.icon} color={accent} strokeWidth={2} />
      </View>
    )
  }
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
      onError={src === thumb ? () => { brokenThumbs.add(thumb); setBroken((n) => n + 1) } : onError}
      resizeMode="cover"
      // Android decodes an image at its full size unless told otherwise: an original (750x500, or
      // more) per 44px row kept hundreds of MB of bitmaps alive over a long scroll. iOS sizes it already.
      resizeMethod="resize"
      className={`${s.box} rounded-xl bg-surface-muted`}
    />
  )
}
