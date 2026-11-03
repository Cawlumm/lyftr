import { render } from '@testing-library/react-native'
import { ExerciseCacheAdmin } from './ExerciseCacheAdmin'

// jest-expo resolves the native file, so this is what a phone renders in Settings: nothing,
// and no request to the admin endpoints.
test('native renders no exercise-cache admin', async () => {
  const { toJSON } = await render(<ExerciseCacheAdmin />)
  expect(toJSON()).toBeNull()
})
