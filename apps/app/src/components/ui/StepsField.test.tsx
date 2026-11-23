import { useState } from 'react'
import { Platform } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
import { StepsField } from './StepsField'

const labels = {
  placeholderFirst: 'First', placeholderNext: 'Next', add: 'Add step',
  step: (n: number) => `Step ${n}`, remove: (n: number) => `Remove step ${n}`,
}

const seen: string[][] = []
const latest = () => seen[seen.length - 1]
function Harness({ start = [''], max }: { start?: string[]; max?: number }) {
  const [v, setV] = useState(start)
  return <StepsField value={v} onChange={(next) => { seen.push(next); setV(next) }} labels={labels} max={max} />
}

const input = (n: number) => screen.getByLabelText(`Step ${n}`)

describe('StepsField', () => {
  beforeEach(() => { seen.length = 0 })
  it('starts with one empty step', async () => {
    await render(<Harness start={[]} />)
    expect(screen.getAllByLabelText(/^Step \d+$/)).toHaveLength(1)
    expect(screen.getByPlaceholderText('First')).toBeTruthy()
  })

  it('Enter adds a step after this one and focuses it', async () => {
    await render(<Harness start={['a', 'c']} />)
    await fireEvent.changeText(input(1), 'a')
    await fireEvent(input(1), 'submitEditing')
    expect(latest()).toEqual(['a', '', 'c'])
    expect(input(2).props.placeholder).toBe('Next')
    expect(input(2).props.value).toBe('')
  })

  it('Backspace on an empty step removes it; never the only one', async () => {
    await render(<Harness start={['a', '']} />)
    await fireEvent(input(2), 'keyPress', { nativeEvent: { key: 'Backspace' } })
    expect(latest()).toEqual(['a'])
    await fireEvent(input(1), 'keyPress', { nativeEvent: { key: 'Backspace' } })
    expect(seen).toHaveLength(1)
    await fireEvent.changeText(input(1), '')
    await fireEvent(input(1), 'keyPress', { nativeEvent: { key: 'Backspace' } })
    expect(latest()).toEqual([''])
  })

  it('Backspace on a step with text leaves it alone', async () => {
    await render(<Harness start={['a', 'b']} />)
    await fireEvent(input(2), 'keyPress', { nativeEvent: { key: 'Backspace' } })
    expect(seen).toHaveLength(0)
  })

  it('the x removes its step', async () => {
    await render(<Harness start={['a', 'b', 'c']} />)
    await fireEvent.press(screen.getByLabelText('Remove step 2'))
    expect(latest()).toEqual(['a', 'c'])
  })

  it('pasted text with line breaks splits into steps at that position, dropping numbering', async () => {
    await render(<Harness start={['x', 'tail']} />)
    await fireEvent.changeText(input(1), '1. one\n2. two\n\nthree')
    expect(latest()).toEqual(['one', 'two', 'three', 'tail'])
  })

  it('Add step appends; disabled at the cap', async () => {
    await render(<Harness start={['a']} max={2} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }))
    expect(latest()).toEqual(['a', ''])
    expect(screen.getByRole('button', { name: 'Add step' }).props.accessibilityState?.disabled ?? screen.getByRole('button', { name: 'Add step' }).props['aria-disabled']).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }))
    await fireEvent(input(2), 'submitEditing')
    expect(latest()).toEqual(['a', ''])
  })

  it('a paste past the cap is cut at it', async () => {
    await render(<Harness start={['a']} max={3} />)
    await fireEvent.changeText(input(1), 'a\nb\nc\nd\ne')
    expect(latest()).toEqual(['a', 'b', 'c'])
  })

  it('a web paste goes where the caret was, keeping what the step held', async () => {
    await render(<Harness start={['Stand tall', 'z']} />)
    await fireEvent(input(1), 'paste', {
      clipboardData: { getData: () => ', feet wide\nPress up' },
      preventDefault: jest.fn(),
      target: { selectionStart: 10, selectionEnd: 10 },
    })
    expect(latest()).toEqual(['Stand tall, feet wide', 'Press up', 'z'])
  })

  it('has no character cap on the inputs, so a long pasted list arrives whole', async () => {
    await render(<Harness />)
    expect(input(1).props.maxLength).toBeUndefined()
  })

  it('shows the error it is given under the steps', async () => {
    await render(<StepsField value={['a']} onChange={jest.fn()} labels={labels} error="Each step must be 300 characters or fewer." />)
    expect(screen.getByText('Each step must be 300 characters or fewer.')).toBeTruthy()
  })

  it('steps wrap instead of scrolling sideways, and Return still submits', async () => {
    await render(<Harness start={['a']} />)
    expect(input(1).props.multiline).toBe(true)
    expect(input(1).props.submitBehavior).toBe('submit')
  })

  it('on the web, Enter is the next step (the textarea would put a line break in)', async () => {
    const os = Platform.OS
    Platform.OS = 'web'
    try {
      await render(<Harness start={['a', 'c']} />)
      const preventDefault = jest.fn()
      await fireEvent(input(1), 'keyPress', { nativeEvent: { key: 'Enter' }, preventDefault })
      expect(preventDefault).toHaveBeenCalled()
      expect(latest()).toEqual(['a', '', 'c'])
      seen.length = 0
      await fireEvent(input(1), 'keyPress', { nativeEvent: { key: 'Enter' }, shiftKey: true, preventDefault: jest.fn() })
      expect(seen).toHaveLength(0)
    } finally {
      Platform.OS = os
    }
  })
})
