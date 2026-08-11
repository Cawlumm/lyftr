// Re-export shim — see stores/settings.ts. The active-workout store is now the shared
// factory bound to web's localStorage adapter. Storage keys are unchanged
// (lyftr_active_session / lyftr_gym_ui), so a session in progress survives the upgrade.
export { useWorkoutSession } from '../lib/lyftr'
export { WORKOUT_SESSION_KEY, GYM_UI_KEY, type GymPhase } from '@lyftr/shared'
