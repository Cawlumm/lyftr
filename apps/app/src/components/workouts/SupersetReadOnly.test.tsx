import { render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { Text, View } from 'react-native'
import { ReadOnlyRest, SupersetList, supersetPlace } from './SupersetReadOnly'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

const rows = [{ superset_group: 1 }, { superset_group: 1 }, { superset_group: null }, {}]

describe('SupersetReadOnly (en)', () => {
  it('places members of a linked pair and leaves others alone', () => {
    expect(supersetPlace(rows, 0)).toMatchObject({ letter: 'A', position: 1, total: 2, first: true, last: false })
    expect(supersetPlace(rows, 1)).toMatchObject({ position: 2, last: true })
    expect(supersetPlace(rows, 2)).toBeNull()
    expect(supersetPlace(undefined, 0)).toBeNull()
  })

  it('renders a linked pair in one block with tags, a connector and one rest footer', async () => {
    const list = [
      { superset_group: 1, rest_seconds: 0, exercise: { name: 'Bench' }, sets: [{}, {}] },
      { superset_group: 1, rest_seconds: 75, exercise: { name: 'Row' }, sets: [{}, {}] },
      { superset_group: null, rest_seconds: 90, exercise: { name: 'Curl' }, sets: [{}] },
    ]
    await render(
      <SupersetList
        rows={list}
        restOn
        renderMember={(ex, slot) => (
          <View>
            <Text>{`${ex.exercise?.name}${slot.tag ? ` ${slot.tag}` : ''}`}</Text>
            <ReadOnlyRest place={null} restSeconds={slot.grouped ? 0 : ex.rest_seconds} />
          </View>
        )}
      />,
    )
    expect(screen.getAllByLabelText(/^Superset A, 2 exercises/)).toHaveLength(1)
    expect(screen.getByText('Bench A1')).toBeTruthy()
    expect(screen.getByText('Row A2')).toBeTruthy()
    expect(screen.getByText('Curl')).toBeTruthy()
    expect(screen.getByText(/Straight to Row/)).toBeTruthy()
    expect(screen.getAllByText(/Rest .* after Row/)).toHaveLength(1)
  })

  it('keeps "no rest" on a solo exercise', async () => {
    await render(<ReadOnlyRest place={null} restSeconds={0} />)
    expect(screen.getByText(/no rest/i)).toBeTruthy()
  })
})
