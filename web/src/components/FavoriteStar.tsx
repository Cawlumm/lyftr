import { Star } from 'lucide-react'

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
