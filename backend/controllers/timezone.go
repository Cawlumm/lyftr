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

// localDayRange turns a YYYY-MM-DD day into the half-open instant range
// [local midnight, next local midnight) for loc.
//
// The end is derived with AddDate(0, 0, 1) rather than Add(24*time.Hour) so it
// lands on the next local midnight even when the day is 23 or 25 hours long. On a
// DST spring-forward day the naive version would end an hour early and drop the
// last hour's entries; on fall-back it would end an hour late and borrow the next
// day's first hour.
func localDayRange(day string, loc *time.Location) (time.Time, time.Time, bool) {
	t, err := time.ParseInLocation("2006-01-02", day, loc)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	// Returned in UTC. The instants are identical either way, but the SQLite driver
	// serializes a time.Time's zone into the value it binds, so a boundary carrying
	// "-0400 EDT" compares as text against UTC-stored rows and silently matches
	// nothing. Normalizing here keeps every comparison in one representation.
	return t.UTC(), t.AddDate(0, 0, 1).UTC(), true
}
