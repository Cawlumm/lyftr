import { render, screen } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

jest.mock('react-native-body-highlighter', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ side }: { side: string }) => <View testID={`figure-${side}`} accessibilityLabel={`male-body-${side}`} /> }
})
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
import { MuscleDiagram } from './MuscleDiagram'

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'],
  category: 'strength', equipment: 'barbell', description: '',
}

describe('MuscleDiagram accessibility', () => {
  it('is one labelled card with the figures hidden from a screen reader', async () => {
    await render(<MuscleDiagram exercise={bench} />)
    expect(screen.getByLabelText('Works Chest; also Triceps, Shoulders')).toBeTruthy()
    const figures = screen.getByTestId('figure-front', { hidden: true }).parent?.parent
    expect(figures?.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(figures?.props.accessibilityElementsHidden).toBe(true)
  })

  it('names only the primary muscle when there are no secondary ones', async () => {
    await render(<MuscleDiagram exercise={{ ...bench, secondary_muscles: [] }} />)
    expect(screen.getByLabelText('Works Chest')).toBeTruthy()
  })
})
