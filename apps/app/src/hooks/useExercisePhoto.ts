import { useEffect, useState } from 'react'
import { client, useAuthStore } from '../lib/lyftr'

type Size = 'thumb' | 'full'

// Module-level, like useServerInfo's cache: a list of rows mounts and unmounts as it scrolls, and each
// remount must not refetch. photo_id changes on replace, so a stale entry is never read for a new picture.
// Each entry is a whole picture as a data URI, so it is capped (oldest out first) and emptied on
// sign-out: a long browse would otherwise hold every photo it ever drew.
const cache = new Map<string, string>()
const CACHE_MAX = 100
const key = (id: number, size: Size, photoId: string) => `${id}:${size}:${photoId}`

function remember(k: string, uri: string) {
  cache.delete(k)
  cache.set(k, uri)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}

useAuthStore.subscribe((s, prev) => {
  if (prev.isAuthenticated && !s.isAuthenticated) cache.clear()
})

function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

export function clearExercisePhotoCache() {
  cache.clear()
}

// An exercise photo needs the bearer token, which an <Image uri> cannot send, so it is fetched through
// the shared client and drawn from a data URI. No photoId means no request at all.
export function useExercisePhoto(exerciseId: number, size: Size, photoId?: string): { uri?: string; failed: boolean } {
  const k = photoId ? key(exerciseId, size, photoId) : ''
  const [state, setState] = useState<{ k: string; uri?: string; failed: boolean }>(() => ({ k, uri: cache.get(k), failed: false }))

  useEffect(() => {
    if (!photoId) return
    const hit = cache.get(k)
    if (hit) { setState({ k, uri: hit, failed: false }); return }
    let stale = false
    setState({ k, failed: false })
    client.exerciseAPI
      .photo(exerciseId, size, photoId)
      .then(toDataUri)
      .then((uri) => {
        remember(k, uri)
        if (!stale) setState({ k, uri, failed: false })
      })
      .catch(() => { if (!stale) setState({ k, failed: true }) })
    return () => { stale = true }
  }, [k, exerciseId, size, photoId])

  if (!photoId) return { failed: false }
  // Until the effect catches up with a new key, say nothing rather than show the previous picture.
  if (state.k !== k) return { uri: cache.get(k), failed: false }
  return { uri: state.uri, failed: state.failed }
}
