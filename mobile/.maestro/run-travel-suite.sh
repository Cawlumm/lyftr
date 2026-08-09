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
display_day() {
  date -d "$1" '+%b %-d, %Y' 2>/dev/null || date -j -f %Y-%m-%d "$1" '+%b %-d, %Y'
}
EXPECTED_DAY="$(display_day "$DAY_BEFORE")"
echo "── expecting the entry to stay on: $EXPECTED_DAY"

set_tz "Asia/Tokyo"

# The day the device now thinks it is, which is the day the entry would drift to if a
# screen went back to deriving its label from the device. Asserting its ABSENCE is what
# separates a real fix from a list that renders both days — passing only EXPECTED_DAY
# would go green on a half-fixed screen.
DAY_AFTER="$(current_day)"
UNEXPECTED_DAY="$(display_day "$DAY_AFTER")"
if [ "$EXPECTED_DAY" = "$UNEXPECTED_DAY" ]; then
  echo "── the hop did not cross midnight ($EXPECTED_DAY both sides); nothing to prove, run it at a different hour" >&2
  exit 1
fi
echo "── device now thinks it is: $UNEXPECTED_DAY"

maestro test -e EXPECTED_DAY="$EXPECTED_DAY" -e UNEXPECTED_DAY="$UNEXPECTED_DAY" "$FLOWS/assert-day-after-travel.yaml"

echo "── entry held its day across a 13-hour move"
