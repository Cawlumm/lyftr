import { AlertCircle } from 'lucide-react'
import type { Favorites } from '@lyftr/shared'
import { Toast } from './ui'

// A failed star has already snapped back, so all that is left to say is why. One component
// for the duration and dismissal keeps the diary and Log Food from drifting.
export default function FavoriteErrorToast({ favorites }: { favorites: Pick<Favorites, 'error' | 'setError'> }) {
  if (!favorites.error) return null
  return <Toast variant="error" icon={AlertCircle} title={favorites.error} autoDismissMs={6000} onDismiss={() => favorites.setError(null)} />
}
