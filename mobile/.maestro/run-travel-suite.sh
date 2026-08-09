#!/usr/bin/env bash
# Runs the day-attribution suite across a timezone change on a real Android runtime.
#
# Maestro cannot change a device's timezone, so this wraps it: log an entry in one
# zone, move the device, assert the entry did not move with it. The hop is 13 hours
# (New York -> Tokyo), deliberately past 12 — under 12 the old device-derived label
# happened to survive for entries written near midday, which is why the bug hid for
# so long.
#
# Usage: mobile/.maestro/run-travel-suite.sh [avd-serial]
set -euo pipefail

SERIAL="${1:-emulator-5554}"
ADB="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}/platform-tools/adb"
FLOWS="$(cd "$(dirname "$0")" && pwd)"

set_tz() {
  echo "── device timezone -> $1"
  "$ADB" -s "$SERIAL" shell service call alarm 3 s16 "$1" >/dev/null
  sleep 2
}

current_day() {
  # The device's own idea of today, formatted the way the app renders a row.
  "$ADB" -s "$SERIAL" shell date +%Y-%m-%d | tr -d '\r'
}

restore() { set_tz "America/New_York"; }
trap restore EXIT

set_tz "America/New_York"
DAY_BEFORE="$(current_day)"
echo "── device day before travel: $DAY_BEFORE"

maestro test "$FLOWS/day-labels.yaml"
maestro test "$FLOWS/log-weight.yaml"

# Reformat to the app's display form: "Aug 9, 2026".
EXPECTED_DAY="$(date -d "$DAY_BEFORE" '+%b %-d, %Y' 2>/dev/null || date -j -f %Y-%m-%d "$DAY_BEFORE" '+%b %-d, %Y')"
echo "── expecting the entry to stay on: $EXPECTED_DAY"

set_tz "Asia/Tokyo"
maestro test -e EXPECTED_DAY="$EXPECTED_DAY" "$FLOWS/assert-day-after-travel.yaml"

echo "── entry held its day across a 13-hour move"
