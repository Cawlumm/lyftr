package controllers

import (
	"time"

	// Embeds the IANA tz database in the binary. The production image is
	// golang:1.26-alpine, which ships no /usr/share/zoneinfo, so without this
	// time.LoadLocation would fail for every real zone and silently fall back to
	// UTC — the exact bug this feature exists to fix, in a form no test on a
	// developer machine (which does have zoneinfo) would ever reproduce.
	_ "time/tzdata"
)

// ParseLocation resolves an IANA zone name ("America/New_York") to a Location.
//
// Validation is deliberately "can the runtime load it" rather than a pattern
// match: the tz database is the only authority on what names exist, and it
// changes (zones are added, renamed, and merged between releases). An empty name
// means "not set" and resolves to UTC, which is what every row written before
// this feature was bucketed under.
func ParseLocation(name string) (*time.Location, error) {
	if name == "" {
		return time.UTC, nil
	}
	return time.LoadLocation(name)
}

// userLocation is the caller's stored zone, falling back to UTC.
//
// Read failures fall back rather than erroring: a missing settings row is normal
// for a new account, and a zone that no longer exists in a newer tz database
// shouldn't make the food diary return 500. Both cases degrade to the pre-feature
// behaviour instead of breaking the request.
//
// The zone is no longer what decides which day an entry belongs to — each row
// records that itself (food_logs/weight_logs.logged_on, workouts.tz_offset_minutes),
// so history does not move when the account's zone changes. What remains here are
// the two questions a stored day genuinely cannot answer:
//
//	1. "What is today?" — for a read with no date parameter.
//	2. "What day is this?" — for a write from a client too old to send one.
//
// Both are questions about *now*, where the current zone is the right answer.
func (h *Handler) userLocation(uid int64) *time.Location {
	st, err := h.s.User.GetSettings(uid)
	if err != nil {
		return time.UTC
	}
	loc, err := ParseLocation(st.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// resolveDay is the single place a write decides which calendar day an entry belongs
// to. Every create/update path goes through it, so there is one rule rather than one
// per handler.
//
// A client-supplied day wins. The device knows its own zone with certainty; the
// account zone is a cached copy that may not have synced yet, so preferring it would
// mean a user who just crossed a border files entries under the day they left. When
// no day is sent — every already-installed client — it falls back to deriving one
// from the account zone, which is exactly what the server did before this column
// existed. That fallback is what keeps old clients correct rather than blank.
func (h *Handler) resolveDay(uid int64, supplied string, instant time.Time) (string, bool) {
	if supplied != "" {
		if _, err := time.Parse("2006-01-02", supplied); err != nil {
			return "", false
		}
		return supplied, true
	}
	return instant.In(h.userLocation(uid)).Format("2006-01-02"), true
}

// resolveQueryDay picks the day a read is asking about: the supplied YYYY-MM-DD, or
// today in the user's zone when the parameter is omitted. "Today" is the one question
// that still needs a zone after this change — a stored day cannot tell you which day
// is the current one.
func (h *Handler) resolveQueryDay(uid int64, supplied string) (string, bool) {
	if supplied == "" {
		return time.Now().In(h.userLocation(uid)).Format("2006-01-02"), true
	}
	if _, err := time.Parse("2006-01-02", supplied); err != nil {
		return "", false
	}
	return supplied, true
}

// daysAgoDay is the calendar day `days` before the user's today, for the windows a
// chart or a rolling stat asks for.
//
// Named rather than inlined so every "N days back" bound in the app is the same
// subtraction against the same today. The history endpoint used to compute this
// expression by hand, which made it a fourth day-derivation rule living outside this
// file — the exact drift this file exists to prevent.
func (h *Handler) daysAgoDay(uid int64, days int) string {
	return time.Now().In(h.userLocation(uid)).AddDate(0, 0, -days).Format("2006-01-02")
}

// tzOffsetMinutes is the user's UTC offset at a given instant, for stamping onto a
// workout. Resolved through the zone at that instant rather than a fixed number, so
// a summer workout gets the summer offset.
func (h *Handler) tzOffsetMinutes(uid int64, instant time.Time) int {
	_, seconds := instant.In(h.userLocation(uid)).Zone()
	return seconds / 60
}


