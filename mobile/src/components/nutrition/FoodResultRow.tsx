import { Image, Pressable, View } from 'react-native'
import { ChevronRight, Star, Utensils } from 'lucide-react-native'
import type { FoodSearchResult } from '@lyftr/shared'
import { AppText, BarbellBroken } from '../ui'
import { semanticInk } from '../../theme/theme'
import { useTheme } from '../../theme/useTheme'
import { MACRO_TEXT } from './nutritionMeta'

interface Props {
  item: FoodSearchResult
  /** Tap the row → pick this food and go to the detail step. */
  onPress: () => void
  /** Filled star. */
  favorited: boolean
  /** Toggle the star. Every list this row appears in offers favouriting. */
  onToggleFavorite: () => void
  /** Star is mid-request — dimmed and inert so a double tap can't race itself. */
  togglingFavorite?: boolean
}

// The search / Recent / Favorites result row.
//
// The star is the whole favourites mechanic: one tap on, one tap off, from wherever the
// food appears. It replaces the ⋮ → ActionSheet → ConfirmSheet this row briefly had,
// which was three interactions to undo something a second tap undoes — and which only
// existed on the Favorites tab, so a food found by search could not be favourited at all
// without logging it first.
//
// No confirmation, deliberately. A favourite is a bookmark, not a record: the row is not
// data being destroyed, and tapping again restores it. This is what Cronometer does.
export function FoodResultRow({
  item, onPress, favorited, onToggleFavorite, togglingFavorite = false,
}: Props) {
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center gap-3 border-b border-surface-border px-4 py-3.5 active:bg-surface-muted"
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} className="h-11 w-11 rounded-xl border border-surface-border" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
          <Utensils size={20} color={colors.txMuted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <AppText variant="bodySemibold" numberOfLines={1}>{item.name}</AppText>
        {item.brand ? <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">{item.brand}</AppText> : null}
        <View className="mt-1 flex-row flex-wrap items-center gap-x-1.5">
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(item.calories)} kcal</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.protein, fontVariant: ['tabular-nums'] }}>{item.protein.toFixed(0)}g P</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.carbs, fontVariant: ['tabular-nums'] }}>{item.carbs.toFixed(0)}g C</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.fat, fontVariant: ['tabular-nums'] }}>{item.fat.toFixed(0)}g F</AppText>
          {item.serving_size ? (<><Dot /><AppText variant="caption" color="muted" style={{ fontSize: 10 }}>{item.serving_size}</AppText></>) : null}
        </View>
      </View>

      <FavoriteStar
        favorited={favorited}
        busy={togglingFavorite}
        name={item.name}
        onPress={onToggleFavorite}
      />
      <ChevronRight size={16} color={colors.txMuted} />
    </Pressable>
  )
}

// Shared by the row and the detail screen so the two cannot drift on colour, fill or
// wording — the label is what a screen reader announces, and "Favorite"/"Unfavorite"
// carries the toggle state that the fill conveys visually.
export function FavoriteStar(
  { favorited, busy = false, name, onPress, size = 'sm' }:
  { favorited: boolean; busy?: boolean; name: string; onPress: () => void; size?: 'sm' | 'md' | 'header' },
) {
  const { colors, accent } = useTheme()
  // Same box, hit slop and press feedback as ui/IconButton — written out rather than
  // reusing it because a filled star needs an SVG `fill`, and adding a fill prop to the
  // shared primitive for one toggle is the wrong place to put it.
  // `header` matches the h-9 icon actions every detail screen's header uses (weight,
  // workouts and nutrition [id]), so the star reads as one of that set.
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'header' ? 'h-9 w-9 rounded-lg active:bg-surface-muted' : 'w-10 h-10 rounded-xl'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: favorited }}
      accessibilityLabel={favorited ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
      onPress={onPress}
      disabled={busy}
      hitSlop={size === 'header' ? 6 : 8}
      className={`items-center justify-center active:scale-95 ${box} ${busy ? 'opacity-40' : ''}`}
    >
      <Star
        size={size === 'sm' ? 18 : size === 'header' ? 17 : 22}
        color={favorited ? accent : colors.txMuted}
        fill={favorited ? accent : 'transparent'}
        strokeWidth={2.2}
      />
    </Pressable>
  )
}

// The star's slot when the favourites list could not be loaded: the dropped barbell, the
// app's one failure mark (see ui/StatFailure), standing where the star would be at the
// star's own size. An empty star there would claim "not a favourite", which we don't know.
// No words and no retry, for the same reason a stat tile has none: no room. The reason
// rides on the accessibility label. Mirrors web FavoriteStarUnavailable.
export function FavoriteStarUnavailable({ size = 'sm' }: { size?: 'sm' | 'md' | 'header' }) {
  const { isDark } = useTheme()
  const box = size === 'sm' ? 'w-8 h-8' : size === 'header' ? 'h-9 w-9' : 'w-10 h-10'
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Couldn't load your favourites" className={`items-center justify-center ${box}`}>
      <BarbellBroken size={size === 'sm' ? 18 : size === 'header' ? 17 : 22} color={semanticInk[isDark ? 'dark' : 'light'].error} />
    </View>
  )
}

function Dot() {
  return <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>·</AppText>
}
