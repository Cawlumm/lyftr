import { groupOf, isLinkedToNext } from '@lyftr/shared'
import { useWorkoutSession } from './lyftr'

type Move = { from: number; to: number }

// pairWith for the live session, composed from the store's own actions (moveExercise keeps the
// rest timer and gym index following their exercise; there is no store action that takes rows).
// The result matches pairWith(exercises, i, j). Returns the moves made, in order, so the caller
// can carry its own positional state (the highlighted exercise) along.
export function pairLive(i: number, j: number): Move[] {
  const rows = () => useWorkoutSession.getState().session?.exercises ?? []
  const store = useWorkoutSession.getState()
  const n = rows().length
  if (i === j || i < 0 || j < 0 || i >= n || j >= n) return []
  const gi = groupOf(rows(), i)
  if (gi && j >= gi.start && j <= gi.end) return []
  if (j === i + 1) { store.linkWithNext(i); return [] }
  if (j === i - 1) { store.linkWithNext(j); return [] }
  // Landing mid-group would split it, and moveExercise's normalise dissolves a lone tail. So
  // j goes to the group's end first, and slides into place once it is a member.
  const anchor = gi ? gi.end : i
  const to = j < anchor ? anchor : anchor + 1
  const moves: Move[] = [{ from: j, to }]
  store.moveExercise(j, to)
  // j keeps its old label through the move. If it landed beside former group mates it would
  // still read as one of them, so cut it loose on both sides (pairWith clears it first too).
  if (isLinkedToNext(rows(), to - 1)) store.unlinkFromNext(to - 1)
  if (isLinkedToNext(rows(), to)) store.unlinkFromNext(to)
  store.linkWithNext(to - 1)
  if (gi && anchor !== i) {
    const dest = j < i ? i : i + 1
    moves.push({ from: to, to: dest })
    store.moveExercise(to, dest)
  }
  return moves
}
