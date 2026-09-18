import { Star } from 'lucide-react'
import BarbellBrokenSVG from './BarbellBrokenSVG'

// Shared by the food rows, the food detail header and the diary so they cannot drift.
// aria-pressed carries the toggle state that the fill conveys visually.
export default function FavoriteStar(
  { favorited, busy = false, name, onClick, size = 'sm' }:
  { favorited: boolean; busy?: boolean; name: string; onClick: () => void; size?: 'compact' | 'sm' | 'md' },
) {
  // `compact` is IconButton's `sm`, box and icon, for rows whose other actions are
  // IconButtons (the diary). `sm` and `md` are the Log Food rows and detail header.
  const box = size === 'md' ? 'w-10 h-10' : 'w-8 h-8'
  const icon = size === 'compact' ? 'w-3.5 h-3.5' : size === 'sm' ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={favorited}
      aria-label={favorited ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
      className={`${box} flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-surface-muted active:scale-95 disabled:opacity-40 ${favorited ? 'text-brand-500' : 'text-tx-muted'}`}
    >
      <Star className={icon} fill={favorited ? 'currentColor' : 'none'} strokeWidth={2.2} />
    </button>
  )
}

// The star's slot when the favourites list could not be loaded: the dropped barbell, the
// app's one failure mark (see ui/StatFailure), standing where the star would be at the
// star's own size. An empty star there would claim "not a favourite", which we don't know.
// No words and no retry, for the same reason a stat tile has none: no room. The reason
// rides on the accessible name.
export function FavoriteStarUnavailable({ size = 'sm' }: { size?: 'compact' | 'sm' | 'md' }) {
  const box = size === 'md' ? 'w-10 h-10' : 'w-8 h-8'
  const icon = size === 'compact' ? 'w-3.5 h-3.5' : size === 'sm' ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'
  return (
    <span role="img" aria-label="Couldn't load your favourites" className={`${box} flex items-center justify-center flex-shrink-0`}>
      <BarbellBrokenSVG className={`${icon} text-[color:var(--alert-error)]`} />
    </span>
  )
}
