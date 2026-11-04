#!/usr/bin/env bash
# retry.sh ATTEMPTS SECONDS CMD...
# Runs CMD up to ATTEMPTS times, killing any attempt that runs past SECONDS. A download
# that stalls fails in minutes and is retried, instead of holding the job to its timeout.
set -uo pipefail
attempts=$1 limit=$2
shift 2
for ((i = 1; i <= attempts; i++)); do
  timeout --kill-after=10 "$limit" "$@"
  rc=$?
  [ "$rc" -eq 0 ] && exit 0
  if [ "$rc" -eq 124 ]; then
    echo "::warning::attempt $i/$attempts timed out after ${limit}s: $*"
  else
    echo "::warning::attempt $i/$attempts failed (exit $rc): $*"
  fi
  [ "$i" -lt "$attempts" ] && sleep 5
done
echo "::error::gave up after $attempts attempts: $*"
exit 1
