# Review instructions

Policy for the automated review that runs on every PR
(`.github/workflows/claude-code-review.yml`). Findings are advisory — nothing here
blocks a merge directly — but `main` requires review threads to be resolved, so an
unresolved finding does stop a merge until someone answers it.

Keep this file short. Every rule here competes for attention with the others; general
project context belongs in `CLAUDE.md`, which this review also reads.

## What Important means here

Reserve 🔴 Important for a change that would **break behaviour, lose data, or end a
session**. This is a self-hosted workout tracker: the expensive failures are a lost
training log and a user signed out mid-workout, not a badly named variable.

Everything else — naming, structure, style, missing tests on code that is already
covered — is a nit at most.

Escalate to Important, above their usual severity:

- A failed read that renders as data. A caught error that falls back to `[]`, `0`, or a
  defaults object draws "no workouts yet" over "we could not reach the server", and the
  user cannot tell. If that substituted value can then be **written back**, it is data
  loss, not a display bug — that is exactly how a failed settings GET came to overwrite
  real macro targets.
- Anything that could sign a user out on a network failure. Only a 400/401/403 from the
  refresh may end a session; a timeout, a dropped connection or a 5xx must not.

## Always check

Named conventions, because a rule that names the function is the one that gets applied:

- **No bare `axios.*`.** It skips the client's timeout, auth header and interceptor.
  `client.ts` has exactly two deliberate exceptions and both pass an explicit `timeout`.
- **No `err.response.data.error` at a call site.** The failures that matter most have no
  response at all. `apiErrorMessage(err, fallback)` is the only way to turn an error into
  words.
- **No `format(dayToLocalDate(x), …)`.** `dayToLocalDate` is not total: given a non-day it
  returns an Invalid Date, and date-fns throws. Use `formatDay`, which reads `—`.
- **Days are stored, not re-derived.** A day-scoped row carries its own day; nothing
  recomputes one from the reader's clock. Server-side that means `resolveDay` /
  `resolveQueryDay`; client-side `entryDay` / `workoutDay`.
- **Numbers a person reads go through `formatNumber` / `toLocaleText`.** Never
  `String(n)`, `n.toFixed(1)` or a template literal. Numbers that are *not* for reading —
  SVG path data, keys, query params — stay canonical.
- **A promise that can hang.** Every request must settle. Anything gated on one — a
  `saving` flag, a disabled button — must have a path back.

## Taking code from another branch

A file taken from a long-lived branch must not revert what `main` gained in the meantime.
Extracting `web/src/index.css` from a stale branch silently reverted three
`@fontsource` imports and dropped every custom font in the app — and `tsc`, lint, three
unit suites and the whole of CI passed. Flag any hunk that removes something `main` has
without saying why.

## Cap the nits

At most five nits per review; summarise the rest as a count. Several PRs here are one
mechanical pattern repeated twenty times, and forty style comments on such a diff buries
the one finding that matters.

After the first review of a PR, report Important findings only. A one-line fix should not
reach round seven on style.

## Verification bar

A claim about behaviour needs a `file:line` citation in the source, not an inference from
a name. If the only evidence is that something *sounds* wrong, say so and drop the
severity.

## Feed the loop

When you flag a mistake that `CLAUDE.md` should have prevented, and it is the second time,
propose the `CLAUDE.md` correction as part of the review. Flag any change that has made
`CLAUDE.md` outdated — it carries hard-won rules and a stale one has already caused
published copy to understate the project.

## Do not report

- Anything CI already enforces: `tsc`, ESLint, `go vet`, the unit and e2e suites.
- Formatting. `gofmt` is checked locally; four files on `main` are known-unformatted and
  are not this PR's problem unless it touches them.
- `web/package-lock.json` and other lockfiles.
- Test code that deliberately violates production rules in order to test them.
