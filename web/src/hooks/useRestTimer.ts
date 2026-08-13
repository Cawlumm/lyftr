// Re-export shim. The logic moved to @lyftr/shared and is bound to web's session store
// in lib/lyftr.ts.
//
// Web's own copy derived the displayed seconds from useCountdown's state, which lags a
// render behind `restEndsAt` on resume — that made `active` false for one frame and
// unmounted the rest banner, flashing the screen underneath. Mobile had already fixed
// it by deriving from the absolute end time; adopting the shared version fixes web.
export { useRestTimer } from '../lib/lyftr'
