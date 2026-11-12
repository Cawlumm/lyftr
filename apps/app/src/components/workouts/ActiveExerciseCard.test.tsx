import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { i18n, useNumericText, type ActiveSessionExercise } from '@lyftr/shared'
import { ActiveExerciseCard, SupersetStatusToast } from './ActiveExerciseCard'

// Same preamble as the other component tests: expo-router can't load under bare jest, and
// the card reaches it directly and via useTheme -> lib/lyftr.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Regression guard for the defect review found in #146: sanitizeNumericInput was wired
// into ActiveExerciseCard, but the weight field had no useNumericText buffer. Its `value`
// is re-derived from a *number* in the session store on every keystroke, so typing "12."
// stored Number("12.") === 12, re-rendered as "12", and RN pushed that back into the
// native field — deleting the separator before the fractional digit could be typed.
//
// Net effect: #141 was declared fixed while the List view, which is the *default* workout
// layout (`workout_layout ?? 'list'`), still could not accept 12,5 or 12.5 at all.
//
// The helper's own rules live in packages/shared number.test.ts. What is worth pinning
// here is the part that was actually missing: the buffer has to survive a parent that
// round-trips the value through Number(). Rendering the whole card would need the theme,
// router and session store mocked to assert the same one thing.
describe('ActiveExerciseCard weight entry', () => {
  it('keeps a trailing separator when the parent re-derives value through Number()', async () => {
    const { result, rerender } = await renderHook((v: string) => useNumericText(v), {
      initialProps: '',
    })

    await act(async () => result.current[1]('12.'))
    expect(result.current[0]).toBe('12.')

    // Exactly what the card does: Number('12.') is 12, stored, handed back as '12'.
    await rerender(String(Number('12.')))

    // Without the buffer this reads '12' and the fraction is unreachable.
    expect(result.current[0]).toBe('12.')

    await act(async () => result.current[1]('12.5'))
    expect(result.current[0]).toBe('12.5')
  })

  it('still follows the parent when the weight genuinely changes elsewhere', async () => {
    const { result, rerender } = await renderHook((v: string) => useNumericText(v), {
      initialProps: '100',
    })
    await rerender('102.5')
    expect(result.current[0]).toBe('102.5')
  })
})

const exercise = {
  exercise_id: 1,
  exercise: { id: 1, name: 'Bench Press', muscle_group: 'chest' },
  notes: '',
  sets: [{ set_number: 1, target_reps: 8, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: false }],
} as unknown as ActiveSessionExercise

describe('ActiveExerciseCard copy', () => {
  it('reads its column headers and add-set label from the catalog in Spanish', async () => {
    await i18n.changeLanguage('es')
    const noop = () => {}
    const view = await render(
      <ActiveExerciseCard
        index={0} ex={exercise} isActive isLast wUnit="kg" weightUnit="kg"
        onCardLayout={noop} onRemoveExercise={noop} onNotesChange={noop} onAddSet={noop} onRemoveSet={noop}
        onUpdateSet={noop} onCompleteSet={noop} onJumpToExercise={noop} onRequestFinish={noop}
      />,
    )
    try {
      expect(screen.getByText('Peso (kg)')).toBeTruthy()
      expect(screen.getByText('Agregar serie')).toBeTruthy()
      expect(screen.getByText('0/1 series')).toBeTruthy()
      expect(screen.queryByText('Add Set')).toBeNull()
    } finally {
      // Unmount first: restoring English under a mounted tree is a state update outside act.
      await view.unmount()
      await i18n.changeLanguage('en')
    }
  })
})

describe('ActiveExerciseCard superset member', () => {
  const noop = () => {}
  const card = (extra: object) => (
    <ActiveExerciseCard
      index={0} ex={exercise} isActive isLast wUnit="kg" weightUnit="kg"
      onCardLayout={noop} onRemoveExercise={noop} onNotesChange={noop} onAddSet={noop} onRemoveSet={noop}
      onUpdateSet={noop} onCompleteSet={noop} onJumpToExercise={noop} onRequestFinish={noop}
      {...extra}
    />
  )

  it('tags the thumbnail with its place and no longer draws a rail or badge', async () => {
    await i18n.changeLanguage('en')
    await render(card({ supersetLetter: 'A', supersetPosition: 1, supersetTotal: 2 }))
    expect(screen.getByText('A1')).toBeTruthy()
    expect(screen.queryByText(/^Superset A/)).toBeNull()
  })

  it('shows the up-next pill only when asked', async () => {
    await i18n.changeLanguage('en')
    const view = await render(card({ supersetLetter: 'A', supersetPosition: 2, supersetTotal: 2, upNext: true }))
    expect(screen.getByText('Up next')).toBeTruthy()
    await view.unmount()
    await render(card({ supersetLetter: 'A', supersetPosition: 2, supersetTotal: 2 }))
    expect(screen.queryByText('Up next')).toBeNull()
  })

  it('offers "Superset with…" for an exercise on its own and "Remove from superset A" for a member', async () => {
    await i18n.changeLanguage('en')
    const onPairWith = jest.fn()
    const onRemoveFromSuperset = jest.fn()
    const view = await render(card({ onPairWith, onRemoveFromSuperset }))
    await fireEvent.press(screen.getByLabelText('More options'))
    await fireEvent.press(await screen.findByText('Superset with…'))
    await waitFor(() => expect(onPairWith).toHaveBeenCalledWith(0))
    await view.unmount()
    await render(card({ onPairWith, onRemoveFromSuperset, supersetLetter: 'A', supersetPosition: 1, supersetTotal: 2 }))
    await fireEvent.press(screen.getByLabelText('More options'))
    await fireEvent.press(await screen.findByText('Remove from superset A'))
    await waitFor(() => expect(onRemoveFromSuperset).toHaveBeenCalledWith(0))
  })

  it('has no menu without onPairWith', async () => {
    await i18n.changeLanguage('en')
    await render(card({}))
    expect(screen.queryByLabelText('More options')).toBeNull()
  })
})

describe('SupersetStatusToast', () => {
  it('lives in a polite status region and shows the message', async () => {
    await render(<SupersetStatusToast message="Bench done. Row is up, no rest." />)
    expect(screen.getByText('Bench done. Row is up, no rest.')).toBeTruthy()
    expect(screen.getByRole('status', { includeHiddenElements: true })).toBeTruthy()
  })
  it('renders nothing visible without one', async () => {
    await render(<SupersetStatusToast message={null} />)
    expect(screen.queryByText(/done/)).toBeNull()
  })
})
