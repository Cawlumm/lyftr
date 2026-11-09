import { render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { View } from 'react-native'
import { ReadOnlyRest, SupersetCardBadge, supersetPlace } from './SupersetReadOnly'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

const rows = [{ superset_group: 1 }, { superset_group: 1 }, { superset_group: null }, {}]

describe('SupersetReadOnly (en)', () => {
  it('places members of a linked pair and leaves others alone', () => {
    expect(supersetPlace(rows, 0)).toMatchObject({ letter: 'A', position: 1, total: 2, first: true, last: false })
    expect(supersetPlace(rows, 1)).toMatchObject({ position: 2, last: true })
    expect(supersetPlace(rows, 2)).toBeNull()
    expect(supersetPlace(undefined, 0)).toBeNull()
  })

  it('renders the linked pair: badges, rest only on the last member', async () => {
    await render(
      <View>
        {[0, 1, 2].map((i) => {
          const place = supersetPlace(rows, i)
          return (
            <View key={i}>
              <SupersetCardBadge place={place} />
              <ReadOnlyRest place={place} restSeconds={90} />
            </View>
          )
        })}
      </View>,
    )
    expect(screen.getByLabelText('Superset A, exercise 1 of 2')).toBeTruthy()
    expect(screen.getByLabelText('Superset A, exercise 2 of 2')).toBeTruthy()
    expect(screen.getAllByText('A1')).toHaveLength(1)
    expect(screen.getAllByText(/Rest after round/)).toHaveLength(1)
    expect(screen.getAllByText(/1:30|90/)).toHaveLength(2)
  })

  it('keeps "no rest" on a solo exercise', async () => {
    await render(<ReadOnlyRest place={null} restSeconds={0} />)
    expect(screen.getByText(/no rest/i)).toBeTruthy()
  })
})
