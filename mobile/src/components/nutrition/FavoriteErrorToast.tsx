import { AlertCircle } from 'lucide-react-native'
import type { Favorites } from '@lyftr/shared'
import { Toast } from '../ui'

// A failed star has already snapped back, so all that is left to say is why. Render as the
// last child of <Screen>, which is what Toast docks against.
export function FavoriteErrorToast({ favorites }: { favorites: Pick<Favorites, 'error' | 'setError'> }) {
  if (!favorites.error) return null
  return <Toast variant="error" icon={AlertCircle} title={favorites.error} autoDismissMs={6000} onDismiss={() => favorites.setError(null)} />
}
