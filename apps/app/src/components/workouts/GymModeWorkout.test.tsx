import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { i18n, type ActiveSession } from '@lyftr/shared'
import { useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { GymModeWorkout } from './GymModeWorkout'
import { SHEET_ANIM_MS } from '../ui/Sheet'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
  usePathname: () => '/workouts/active',
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))

const session = (): ActiveSession => ({
  name: 'Workout', started_at: new Date().toISOString(), tz_offset_minutes: 0,
  exercises: [{
    exercise_id: 1,
    exercise: { id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [], category: 'strength', equipment: 'barbell', description: '' },
    notes: '', rest_seconds: 90,
    sets: [1, 2, 3].map((set_number) => ({
      set_number, target_reps: 8, target_weight: 100, actual_reps: 8, actual_weight: 100,
      completed: set_number === 1,
    })),
  }],
})

beforeEach(async () => {
  jest.useFakeTimers()
  await i18n.changeLanguage('en')
  useSettingsStore.setState(({ settings }) => ({ settings: { ...settings, rest_enabled: true } }))
  useWorkoutSession.setState({ session: session(), gymPhase: 'exercise', gymExIdx: 0, gymSetIdx: 1 })
  useWorkoutSession.getState().startRest(90, 0, 0)
})

afterEach(() => {
  useWorkoutSession.getState().cancelSession()
  jest.useRealTimers()
})

it.each([false, true])('can complete the next set during rest (paused: %s)', async (paused) => {
  if (paused) useWorkoutSession.getState().pauseRest()
  const view = await render(<GymModeWorkout />)
  await act(async () => { jest.advanceTimersByTime(15_000) })

  await fireEvent.press(screen.getByText('Complete Set'))

  const state = useWorkoutSession.getState()
  expect(state.session!.exercises[0].sets.map((set) => set.completed)).toEqual([true, true, false])
  expect(state.gymSetIdx).toBe(2)
  expect(state.restSetIdx).toBe(1)
  expect(state.restEndsAt).toBe(Date.now() + 90_000)
  expect(state.restPausedRemainingMs).toBeNull()
  expect(screen.getByText('Complete Set')).toBeTruthy()

  // Undoing the set that owns the new timer still clears that timer.
  await act(async () => { state.setGymState('exercise', 0, 1) })
  await fireEvent.press(screen.getByText('Completed'))
  expect(useWorkoutSession.getState().restEndsAt).toBeNull()
  expect(useWorkoutSession.getState().session!.exercises[0].sets[1].completed).toBe(false)
  await view.unmount()
})

describe('top bar', () => {
  const second = () => ({
    ...session().exercises[0], exercise_id: 2,
    exercise: { ...session().exercises[0].exercise, id: 2, name: 'Squat' },
  })
  beforeEach(() => {
    useWorkoutSession.getState().clearRest()
    const s = session()
    useWorkoutSession.setState({ session: { ...s, exercises: [...s.exercises, second()] }, gymPhase: 'exercise', gymExIdx: 0, gymSetIdx: 1 })
  })

  it('opens the exercises sheet from the exercise heading and jumps to the first set still to do', async () => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercises, 1 of 2, Bench Press, chest, 1/3 sets done' }))
    await fireEvent.press(screen.getByLabelText('2. Squat, 1/3 sets done'))
    const state = useWorkoutSession.getState()
    // Squat's set 1 is logged, so it opens on set 2.
    expect([state.gymPhase, state.gymExIdx, state.gymSetIdx]).toEqual(['exercise-info', 1, 1])
    expect(screen.queryByLabelText(/^1\. Bench Press/)).toBeNull()
    // The info phase's title is the same switcher, so the way back is the sheet.
    expect(screen.getByRole('button', { name: 'Exercises, 2 of 2, Squat, chest, Barbell, strength' })).toBeTruthy()
    await view.unmount()
  })

  it('names the exercise once, with its position under it', async () => {
    const view = await render(<GymModeWorkout />)
    expect(screen.getAllByText('Bench Press')).toHaveLength(1)
    expect(screen.getByText('1/2')).toBeTruthy()
    expect(screen.getByText('1/3 sets done')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    await view.unmount()
  })

  it('reorders from the exercise screen, and the screen stays on the same exercise', async () => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercises, 1 of 2, Bench Press, chest, 1/3 sets done' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reorder exercises' }))
    await fireEvent.press(screen.getByLabelText('Move Bench Press down'))
    const state = useWorkoutSession.getState()
    expect(state.session!.exercises.map((e) => e.exercise.name)).toEqual(['Squat', 'Bench Press'])
    expect(state.gymExIdx).toBe(1)
    await view.unmount()
  })

  it('minimizes from the ⌄ button, not from the menu', async () => {
    useWorkoutSession.setState({ gymOpen: true })
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByText('Minimize')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Minimize' }))
    expect(useWorkoutSession.getState().gymOpen).toBe(false)
    await view.unmount()
  })

  it('lists the workout actions in the menu; Discard is last and still asks first', async () => {
    const view = await render(<GymModeWorkout />)
    expect(screen.queryByRole('button', { name: 'Discard workout' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }))
    const labels = ['Add exercise', 'Reorder exercises', 'All exercises', 'Workout overview', 'Discard workout']
    for (const l of labels) expect(screen.getByText(l)).toBeTruthy()
    expect(screen.getByText('Workout · 2/6 sets')).toBeTruthy()
    await fireEvent.press(screen.getByText('Discard workout'))
    await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(screen.getByText('Discard workout?')).toBeTruthy()
    expect(useWorkoutSession.getState().session).not.toBeNull()
    await view.unmount()
  })

  it.each([
    ['Reorder exercises', 'Move Bench Press down'],
    ['All exercises', '2. Squat, 1/3 sets done'],
  ])('the menu item %s opens the exercises sheet on its view', async (item, inSheet) => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }))
    await fireEvent.press(screen.getByText(item))
    await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(screen.getByLabelText(inSheet)).toBeTruthy()
    await view.unmount()
  })

  it('reaches the overview from the menu', async () => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }))
    await fireEvent.press(screen.getByText('Workout overview'))
    await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(useWorkoutSession.getState().gymPhase).toBe('overview')
    // Sets are logged, so it continues where the workout is rather than restarting at 1.
    await fireEvent.press(screen.getByText('Continue Workout'))
    const state = useWorkoutSession.getState()
    expect([state.gymPhase, state.gymExIdx, state.gymSetIdx]).toEqual(['exercise-info', 0, 1])
    await view.unmount()
  })

  it('tapping the exercise being worked only closes the sheet', async () => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercises, 1 of 2, Bench Press, chest, 1/3 sets done' }))
    await fireEvent.press(screen.getByLabelText('1. Bench Press, current exercise, 1/3 sets done'))
    const state = useWorkoutSession.getState()
    expect([state.gymPhase, state.gymExIdx, state.gymSetIdx]).toEqual(['exercise', 0, 1])
    await view.unmount()
  })

  it('asks before removing an exercise that has logged sets', async () => {
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByLabelText('Remove this exercise'))
    await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(useWorkoutSession.getState().session!.exercises).toHaveLength(2)
    expect(screen.getByText('Bench Press and its 1 completed set will be removed from this workout.')).toBeTruthy()
    await fireEvent.press(screen.getByText('Remove'))
    expect(useWorkoutSession.getState().session!.exercises.map((e) => e.exercise.name)).toEqual(['Squat'])
    await view.unmount()
  })

  it('removes an exercise with nothing logged at once', async () => {
    const s = useWorkoutSession.getState().session!
    useWorkoutSession.setState({
      session: { ...s, exercises: s.exercises.map((e) => ({ ...e, sets: e.sets.map((st) => ({ ...st, completed: false })) })) },
    })
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByLabelText('Remove this exercise'))
    expect(useWorkoutSession.getState().session!.exercises.map((e) => e.exercise.name)).toEqual(['Squat'])
    await view.unmount()
  })

  it('offers Remove this set only on a set not yet logged', async () => {
    useWorkoutSession.setState({ gymSetIdx: 0 })
    const view = await render(<GymModeWorkout />)
    expect(screen.queryByText('Remove this set')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Set 2'))
    expect(screen.getByText('Remove this set')).toBeTruthy()
    await view.unmount()
  })

  it('draws one progress segment per exercise', async () => {
    const view = await render(<GymModeWorkout />)
    expect(screen.getByTestId('gym-progress-seg-0', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('gym-progress-seg-1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('gym-progress-seg-2', { includeHiddenElements: true })).toBeNull()
    await view.unmount()
  })

  it('ticks the elapsed clock from the session start', async () => {
    const s = useWorkoutSession.getState().session!
    useWorkoutSession.setState({ session: { ...s, started_at: new Date(Date.now() - 90_000).toISOString() } })
    const view = await render(<GymModeWorkout />)
    expect(screen.getByLabelText('Workout time 01:30')).toBeTruthy()
    expect(screen.getByText('2/6 sets')).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(1_000) })
    expect(screen.getByText('01:31')).toBeTruthy()
    await view.unmount()
  })
})

describe('Finish sheet', () => {
  const setCompleted = (done: boolean[]) => {
    const s = session()
    useWorkoutSession.setState({
      session: { ...s, exercises: [{ ...s.exercises[0], sets: s.exercises[0].sets.map((st, i) => ({ ...st, completed: done[i] })) }] },
    })
  }
  const openFinish = async () => {
    useWorkoutSession.getState().clearRest()
    const view = await render(<GymModeWorkout />)
    await fireEvent.press(screen.getByText('Finish Workout'))
    await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    return view
  }

  it('says unfinished sets will not be saved', async () => {
    const view = await openFinish()
    expect(screen.getByText("1 of 3 sets completed. 2 unfinished sets won't be saved.")).toBeTruthy()
    await view.unmount()
  })

  it('keeps the plain message when every set is done', async () => {
    setCompleted([true, true, true])
    const view = await openFinish()
    expect(screen.getByText('3 of 3 sets completed. Workout will be saved.')).toBeTruthy()
    await view.unmount()
  })

  it('offers Discard, not an empty save, when nothing is completed', async () => {
    setCompleted([false, false, false])
    const view = await openFinish()
    expect(screen.getByText('Nothing to save yet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Discard'))
    expect(useWorkoutSession.getState().session).toBeNull()
    await view.unmount()
  })
})
