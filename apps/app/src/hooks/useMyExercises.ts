import { useCallback, useEffect, useRef, useState } from 'react'
import { customExercises, type Exercise } from '@lyftr/shared'
import { client, useServerInfo } from '../lib/lyftr'

export interface MyExercisesQuery {
  q?: string
  muscle_group?: string
  equipment?: string
}

export interface MyExercises {
  // False on a server older than custom exercises: hide Create, Mine and the custom group.
  supported: boolean
  items: Exercise[]
  // A failed fetch leaves items empty; the catalog list beside it reports its own failure.
  failed: boolean
  reload: () => void
}

// The signed-in user's own exercises matching a query, fetched apart from the catalog.
// GET /exercises without mine is the catalog alone, and its pages are counted by length
// (useServerList), so these cannot ride on page 1; callers show them as their own group.
// Pass an already-debounced query.
export function useMyExercises(query: MyExercisesQuery, limit = 20): MyExercises {
  const supported = customExercises(useServerInfo())
  const [items, setItems] = useState<Exercise[]>([])
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)
  const { q, muscle_group, equipment } = query

  useEffect(() => {
    const id = ++latest.current
    if (!supported) {
      setItems([])
      setFailed(false)
      return
    }
    client.exerciseAPI
      .list({ mine: true, limit, ...(q ? { q } : {}), ...(muscle_group ? { muscle_group } : {}), ...(equipment ? { equipment } : {}) })
      .then((data) => {
        if (id !== latest.current) return
        // A server that ignored mine=true answered with the catalog; none of it is ours.
        setItems((data ?? []).filter((e) => e.is_custom))
        setFailed(false)
      })
      .catch(() => {
        if (id !== latest.current) return
        setItems([])
        setFailed(true)
      })
  }, [supported, q, muscle_group, equipment, limit, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { supported, items, failed, reload }
}
