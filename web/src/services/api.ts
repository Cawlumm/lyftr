// Thin re-export of the shared client's API groups, so the ~29 call sites that import
// from '../services/api' keep working unchanged. The implementation now lives in
// packages/shared/src/client.ts and is shared with mobile.
//
// Kept as a shim rather than rewriting every import in the same change: this way the
// diff shows what actually moved. It can be collapsed later by pointing call sites at
// '../lib/lyftr' directly.
import { client } from '../lib/lyftr'

export const {
  authAPI,
  userAPI,
  workoutAPI,
  exerciseAPI,
  programAPI,
  weightAPI,
  foodAPI,
  savedFoodsAPI,
} = client

export { apiErrorMessage, testServerConnection, type ServerInfo } from '@lyftr/shared'
