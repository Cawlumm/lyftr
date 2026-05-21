import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount anything rendered via Testing Library after each test, so mounted
// hooks/components don't leak across cases (a leaked hook keeps reacting to
// shared store updates and skews call counts).
afterEach(() => {
  cleanup()
})
