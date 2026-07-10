/** Jest config for the platform-agnostic shared core. Runs on Linux/node. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
}
