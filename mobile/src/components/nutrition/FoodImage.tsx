import { useState } from 'react'
import { Image, View } from 'react-native'
import { Utensils } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'

// Product photos, on the two terms OpenFoodFacts actually offers them. Web's copy of
// this carries the full reasoning (web/src/components/FoodImage.tsx); in short:
//
// Half the catalogue has no photo — per query, milk 12%, bread 54% — and a real share of
// the rest never answer, so a picture that fails and a picture that was never there have
// to look the same. There is deliberately no onError: a photo appears once it has
// loaded, which handles both.
//
// Nothing stands in for it but a glyph. Peer apps are unanimous, and OpenNutriTracker's
// source says why it will not guess an icon from a branded product's category: it would
// often be wrong.

// A row's picture. Fixed square whether or not a photo arrives, so the list cannot jitter.
export function FoodThumb({ src, size = 44 }: { src?: string, size?: number }) {
  const { colors } = useTheme()
  const [loaded, setLoaded] = useState(false)
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-surface-muted"
    >
      <Utensils size={size * 0.45} color={colors.txMuted} />
      {src ? (
        <Image
          source={{ uri: src }}
          onLoad={() => setLoaded(true)}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </View>
  )
}

// The detail screen's picture, which takes no room until it has one to fill. The band it
// used to reserve pushed the amount field — the only control the screen is for — most of
// a phone down when there was no photo, which is half the time.
export function FoodHero({ src }: { src?: string }) {
  const [loaded, setLoaded] = useState(false)
  if (!src) return null
  return (
    <Image
      source={{ uri: src }}
      onLoad={() => setLoaded(true)}
      resizeMode="cover"
      className={loaded ? 'h-52 w-full border-b border-surface-border' : 'h-0 w-full'}
    />
  )
}
