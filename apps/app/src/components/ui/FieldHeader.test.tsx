import { render, screen } from '@testing-library/react-native'
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
import { Pencil } from './icons'
import { FieldHeader, RequiredLegend } from './FieldHeader'

describe('FieldHeader', () => {
  it('a required field shows a star that a screen reader hears as "required"', async () => {
    await render(<FieldHeader icon={Pencil} label="Name" required />)
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByLabelText('required').props.children).toBe('*')
  })

  it('an optional field has no marker and says nothing about being optional', async () => {
    await render(<FieldHeader icon={Pencil} label="Notes" hint="One step per line" />)
    expect(screen.queryByText('*')).toBeNull()
    expect(screen.queryByText(/optional/i)).toBeNull()
    expect(screen.getByText('One step per line')).toBeTruthy()
  })

  it('the legend explains the star, and its own star is not read out', async () => {
    await render(<RequiredLegend />)
    expect(screen.getByText('Required')).toBeTruthy()
    expect(screen.getByText('*', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no')
  })

  it('on native the header says "required" even when the input carries it on web', async () => {
    await render(<FieldHeader icon={Pencil} label="Name" requiredInput />)
    expect(screen.getByLabelText('required').props.children).toBe('*')
  })
})
