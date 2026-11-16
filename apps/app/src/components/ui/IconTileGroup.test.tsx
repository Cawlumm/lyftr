import { fireEvent, render, screen } from '@testing-library/react-native'
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
import { Dumbbell } from './icons'
import { IconTileGroup } from './IconTileGroup'

const options = [
  { value: 'a', label: 'Alpha', icon: Dumbbell },
  { value: 'b', label: 'Beta', icon: Dumbbell },
  { value: 'c', label: 'Gamma' },
] as const

describe('IconTileGroup', () => {
  it('single: radios in a named group, one checked, pressing another moves the choice', async () => {
    const onChange = jest.fn()
    await render(<IconTileGroup label="Letters" options={options} value="a" onChange={onChange} layout="tile" />)
    expect(screen.getByLabelText('Letters')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Alpha', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Beta', checked: false })).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('multiple: checkboxes that add to and remove from the selection', async () => {
    const onChange = jest.fn()
    await render(<IconTileGroup multiple label="Letters" options={options} value={['a']} onChange={onChange} />)
    expect(screen.getByRole('checkbox', { name: 'Alpha', checked: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Gamma' }))
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c'])
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('multiple with a max: once reached the rest are disabled, and the chosen ones can still be unchosen', async () => {
    const onChange = jest.fn()
    await render(<IconTileGroup multiple max={2} label="Letters" options={options} value={['a', 'b']} onChange={onChange} />)
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Gamma' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Gamma', disabled: true })).toBeTruthy()
    expect(JSON.stringify(screen.getByRole('checkbox', { name: 'Gamma', disabled: true }).props.className ?? '')).toContain('opacity-40')
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('a locked option is shown, not dimmed, and cannot be chosen', async () => {
    const onChange = jest.fn()
    await render(<IconTileGroup multiple label="Letters" options={[...options.slice(0, 2), { value: 'c', label: 'Gamma', locked: { swatch: '#22d3ee' } }]} value={[]} onChange={onChange} />)
    expect(JSON.stringify(screen.getByRole('checkbox', { name: 'Gamma' }).props.className ?? '')).not.toContain('opacity-40')
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Gamma', disabled: true }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('every option is at least 44px tall, in both layouts', async () => {
    for (const layout of ['tile', 'chip'] as const) {
      const { unmount } = await render(<IconTileGroup label="L" options={options} value={null} onChange={jest.fn()} layout={layout} />)
      for (const o of options) {
        const style = screen.getByRole('radio', { name: o.label }).props.style
        const flat = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style
        expect(flat.minHeight).toBeGreaterThanOrEqual(44)
      }
      unmount()
    }
  })
})
