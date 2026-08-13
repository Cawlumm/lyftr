// Re-export shim. The store is now the shared factory bound to web's localStorage
// adapter (src/lib/lyftr.ts), and the weight helpers live in @lyftr/shared — they were
// only ever here because web had no shared package to put them in.
//
// Kept so the ~17 call sites importing from '../stores/settings' are unchanged in the
// same commit that moves the implementation. Collapse in a later cleanup by pointing
// them at '../lib/lyftr' and '@lyftr/shared' directly.
export { useSettingsStore } from '../lib/lyftr'
export {
  weightShort,
  lbsToDisplay,
  displayToLbs,
  round1,
  displayWeight,
  displayVolume,
  maxWeight,
  weightError,
  isValidWeight,
  resolveWeightLbs,
  MAX_WEIGHT_LBS,
} from '@lyftr/shared'
