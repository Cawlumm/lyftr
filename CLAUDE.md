# Lyftr — project context

Self-hosted workout tracker. Go backend, React/TypeScript frontend, SQLite, Docker.
GitHub: https://github.com/Cawlumm/lyftr

Written for everyone who works on this repo, human or agent. It is checked in, so it is
also what the automated PR review reads; `REVIEW.md` says how findings against these rules
should be weighed, and deliberately does not restate them.

Machine-specific setup — your own paths, ports, editor, hardware limits — does not belong
here. Put that in your personal `~/.claude/CLAUDE.md`, which is not shared.

Every rule below was paid for by a bug. Where one names a file, that file is the single
place the rule is enforced; adding a second is how the rule stops holding.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Go 1.26, Gin, SQLite (`_foreign_keys=on`) |
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, Recharts |
| Auth | JWT + refresh tokens (middleware/auth.go) |
| Deployment | Docker Compose, nginx reverse proxy |

---

## Project Structure

```
backend/
  main.go               — entry point, wires DB + routes + seed
  config/config.go      — env vars (JWT_SECRET, CORS_ORIGIN, PORT)
  controllers/          — one file per resource
  db/sqlite.go          — opens SQLite, enables WAL + foreign keys
  db/migrations.go      — schema migrations (run on startup)
  middleware/auth.go    — JWT validation middleware
  models/models.go      — all structs + request types
  routes/routes.go      — all routes, protected vs public
  seed/exercises.go     — async exercise seeding from free-exercise-db
  seed/users.go         — demo user seeding
  utils/response.go     — utils.OK / utils.BadRequest helpers

web/src/
  pages/                — one file per page/route
  services/api.ts       — all API calls (axios), typed
  types/index.ts        — shared TypeScript types
  App.tsx               — React Router routes
```

---

## Key Conventions

**Backend**
- All handlers use `utils.OK(c, data)` and `utils.BadRequest(c, msg)`
- Routes: public under `/api/v1/auth/`, protected under `/api/v1/` (JWT required)
- Admin routes: `protected.GET/POST("admin/...")` — requires auth, no separate role check yet
- Weight stored in **lbs** internally (backend stores raw numbers; the unit is a frontend convention). Frontend converts via `lbsToDisplay`/`displayToLbs` in `web/src/stores/settings.ts` based on `user_settings.weight_unit` — never store display values directly
- `exercise_id` FK references `exercises(id)` — **no ON DELETE CASCADE** — never wipe exercises table while workout/program data exists
- New migrations go in `db/migrations.go` — append only, never modify existing

**Frontend**
- API calls go through `web/src/services/api.ts` — add new endpoints there, not inline
- Always null-guard arrays before `.reduce`/`.forEach`: `(w.exercises ?? []).forEach(...)`
- Duration stored as **seconds** in DB — display as `Math.round(duration / 60)` min
- Light/dark theme via `localStorage.setItem('theme', 'light|dark')` + `document.documentElement.classList`
- Mobile-first: 90% of users on mobile, desktop is secondary
- New pages: create in `web/src/pages/`, add route in `App.tsx`, add API methods in `api.ts`

---

## Time & Calendar Days — read before touching any date

**The rule: a row records its own day. Nothing re-derives one from whoever is reading.**

An instant does not contain a day — a day is an instant *plus a place*. So every
day-scoped row stores both. This is the model Fitbit, Garmin, Strava and Android
Health Connect all use, and the reason travelling no longer rewrites history.

| Entity | Instant | Day attribution | Peer precedent |
|---|---|---|---|
| `food_logs`, `weight_logs` | `logged_at` (UTC) | `logged_on` — stored `YYYY-MM-DD` | Fitbit `logDate` |
| `workouts` | `started_at` (UTC) | `tz_offset_minutes` — offset at start | Strava `utc_offset`, Garmin `startTimeOffsetInSeconds` |

Diary entries store the day because the user *picks* it. Workouts store an offset
because the day *follows* from where the moment happened. Fitbit splits them the
same way.

**`user_settings.timezone` is not dead and is not the source of day attribution.**
It answers only questions about *now*, which no stored row can answer:
- "What is today?" for a read with no `date` param
- "30 days back from *your* today" — `/food/history`, `/weight/stats` send no dates
- The day/offset for a write from a client too old to send one (back-compat fallback)

### Single points of truth — do not add a fifth way to get a day

- **Backend**: `backend/controllers/timezone.go`. `resolveDay` (writes),
  `resolveQueryDay` (reads), `daysAgoDay` (windows), `tzOffsetMinutes` (workouts).
  Every handler goes through one of these. No inline `time.Now().In(loc)` elsewhere.
- **Client**: `packages/shared/src/utils/dateUtils.ts` — **one copy, imported by both
  apps** from `@lyftr/shared`. `entryDay(e)` for diary rows, `workoutDay(w)` for
  workouts — never `new Date(x).getDate()` or `.toISOString().slice(0,10)` in a page.
  Writes go through `withLoggedOn` / `utcOffsetMinutes` in the API layer, so no screen
  can forget to send the day.
- There is no longer a web-side fork to keep in step (and no `dateUtils.fork.test.ts`).
  What protects the shared copy now is CI: the `web` paths filter in `ci.yml` includes
  `packages/shared/**`, so editing a shared util runs web's unit suite, build and e2e
  as well as mobile's.

### Gotchas

- SQLite `date(started_at, ...)` returns NULL: the modernc driver writes Go's
  `String()` form (`2026-04-25 03:30:00 +0000 UTC`). Use `substr(x, 1, 19)` first.
- `time/tzdata` must stay imported — Alpine ships no `/usr/share/zoneinfo`, so
  `LoadLocation` would silently fall back to UTC in production only.
- Day arithmetic uses `AddDate(0, 0, n)`, never `Add(24 * time.Hour)` (DST).

---

## Numbers & Locale — read before rendering or reading a number

**The rule: the app stores canonical, the screen shows the user's notation, and one
module owns the conversion both ways.**

Half of Europe writes twelve and a half as `12,5`. Android's `decimal-pad` shows the
*locale's* separator, and on those keypads there is often no full stop at all — so a field
that strips "anything that isn't a digit or a dot" makes decimals unenterable for those
users. That was #141. React Native makes the sanitizing mandatory rather than defensive:
`ReactEditText` replaces Android's `KeyListener` specifically to *"permit all keyboard
input through"*, so `keyboardType` constrains what is **drawn**, never what arrives.

| Layer | Notation | Why |
|---|---|---|
| DB, API, stores, arithmetic | canonical `.` | one machine-readable form; `Number()` works everywhere |
| A numeric field's buffer | canonical `.` | so no caller has to learn a second notation |
| Anything a person reads | the locale's | what they typed is what they see |

### Single points of truth — do not add a fourth way to write a number

All in `packages/shared/src/utils/number.ts`, imported by both apps:

- **`configureNumberLocale({ decimal, group })`** — called **once**, from
  `mobile/src/lib/lyftr.ts`, with `expo-localization`'s native values. Injected rather
  than detected for the same reason `detectTimezone` is: Hermes leaves
  `Intl.NumberFormat#formatToParts` unimplemented on iOS (`PlatformIntlApple.mm` is a
  literal `llvm_unreachable`), so detecting the separators would crash on half the fleet.
  Web never calls it and keeps the en-US default — `<input type="number">` is localised by
  the browser.
- **`sanitizeNumericInput(raw, mode)`** — typed text → canonical. Every numeric
  `TextInput` on mobile goes through it; there is no second copy.
- **`toLocaleText(canonical)`** — a field's canonical buffer → what that field draws.
- **`formatNumber(n, { decimals, grouped })`** — a stored number → text a person reads.
  Cards, chips, captions, chart ticks. Grouping is opt-in.

Never `String(n)`, `n.toFixed(1)` or `` `${n}` `` for text a user reads — that is the
fourth way, and it is how one row came to show `83,4` in the field and `83.4` in the
caption beside it.

### Gotchas

- **Numbers that are not for reading stay canonical.** SVG path data, keys, ids, query
  params. `DashboardCharts.tsx` builds paths with `toFixed(1)`; localise that and the
  path parser reads the comma as a coordinate separator and the chart collapses.
- **Whitespace is never a separator.** `fr`, `ru`, `sv`, `pl`, `cs`, `fi`, `nb`, `uk` use
  a space as the *group* character and `expo-localization` passes it through verbatim.
  Treating it as a separator candidate made a trailing space read as a decimal point.
- **Grouping is never detected.** A `TextInput` re-sends the whole field each keystroke, so
  `"1,"` arrives with nothing after it and is read as a decimal. `1,200` on en-US is `1.2`
  **whether typed or pasted** — they agree on purpose. An earlier grouping-aware rule made
  them disagree (`1.2` typed, `1200` pasted), so the same characters meant different numbers
  depending on how they arrived. Pinned by `number.test.ts` and `number.fuzz.test.ts`.
- **Non-ASCII digits are folded arithmetically** (U+0660–0669, U+06F0–06F9), not via
  `normalize('NFKC')` — NFKC folds fullwidth digits but leaves Arabic-Indic alone, so a
  test written with `１２` passes while the real case still logs a weight of 0.
- **A locale-dependent test must say so.** `packages/shared` is plain `ts-jest` and the
  en-US default comes from the module literal, so a test that does not call
  `configureNumberLocale` is an en-US test — which is the one locale the bug never
  appears in. See `NumberField.locale.test.tsx` for the rendered-component shape.

---

## Failing Requests — read before touching the API client

**The rule: every request settles, and only the server may end a session.**

A promise that never settles is not a slow app, it is a dead one. Anything gated on it —
`saving`, `isLoading`, a disabled button — stays that way until the process is killed,
while the render loop carries on at 60fps around it. That is #145: the reporter filmed a
workout timer ticking beside five taps on a dead button, and it took a full restart to
clear. The hang was a token refresh issued on the bare `axios` export, which inherits
axios's own `timeout: 0` instead of the client's bound.

| the failure | what it means | what we do |
|---|---|---|
| timeout, dropped connection, 5xx, proxy 502/504 | we never got an answer | keep the session, surface the error, let them retry |
| refresh answers 400/401/403 | the server revoked it | clear the tokens, `onAuthFailure` |

Silence is not a verdict. Signing out on it ends a live workout every time someone walks
past a dead spot in their gym's wifi — which is who self-hosts this. wger's Flutter client
lands in the same place ("pure network errors keep the session intact so offline use
continues to work"), though it clears on 5xx where we keep; a self-hosted backend restart
answering 502 must not evict anyone.

### Single points of truth

- **`packages/shared/src/client.ts`** — one axios instance, `REQUEST_TIMEOUT` on every
  call *including the refresh*, `sessionWasRevoked` for the table above, and `refreshOnce`
  so a burst of 401s shares one round-trip rather than racing to rotate the same token.
  Both apps import it, so a fix here is a fix on web and mobile at once.
- **`apiErrorMessage(err, fallback)`** — the only way to turn an error into words. Never
  read `err.response.data.error` at a call site: the failures that matter most have no
  response at all, and the raw read falls through to a generic string. It routes those to
  `networkFailureMessage`, which names cleartext blocks, bad certificates and timeouts
  from the native detail RN hides on the XHR.
- **Say it where the tap was.** `ConfirmSheet` takes an `error` and stays open, so a failed
  confirm shows why with the retry under the same finger. Dismissing to a banner at the top
  of a scrolled list is the same as saying nothing.

### Gotchas

- **A bare `axios.*` call is not the client.** It skips the instance's timeout, the auth
  header and the interceptor. `client.ts` has exactly two on purpose — the `/info` probe
  (8s, fails fast by design) and the refresh (cannot use `api` without recursing into the
  interceptor that calls it). Both pass an explicit `timeout`. Adding a third without one
  re-opens #145.
- **RN does not report timeouts the way the web does.** No `ECONNABORTED`, no
  `request._timedOut` — just the literal string `timeout` on the XHR's `_response`.
  Measured on Android against a black-holed refresh; `classifyNetworkError` matches it.
- **Reproduce network failure with a black hole, not a stopped server.** A stopped server
  gives an instant ECONNREFUSED and hides every bug of this class. Gym wifi accepts the
  connection and says nothing; a proxy that accepts and never replies is the faithful
  model, and it is what turned #145 from intermittent into a one-tap repro.

## Data Models (summary)

- `User` → `UserSettings` (calorie/macro targets, weight unit)
- `Workout` → `WorkoutExercise[]` → `Set[]`
- `Program` → `ProgramExercise[]` → `ProgramSet[]` (target reps/weight)
- `Exercise` (seeded, 800+, shared across users)
- `FoodLog` (meal, macros, per day)
- `WeightLog` (bodyweight over time)

---

## Known Constraints

- SQLite FK: `workout_exercises` and `program_exercises` reference `exercises(id)` with no cascade. Never DELETE from exercises while user data exists.
- Go 1.26 required — Dockerfile must use `golang:1.26-alpine`
- Build command: `go build -ldflags="-s -w" -o lyftr-api .` (not `./...`)
- Exercise seeding uses `sync/atomic.Bool` to prevent concurrent seeds

---

## Demo mode

- Email: `demo@lyftr.local` / Password: `password123`
- Pre-seeded: PPL program + 8 weeks of workouts
- **Only seeded when `DEMO_MODE` is on, and it is off by default everywhere — development
  included.** It used to default to `ENV == "development"`, and `ENV` itself defaults to
  `"development"`, so a bare `go run .` seeded this account with a password published in
  the docs. Now it is explicit opt-in: `DEMO_MODE=true go run .`. Compose passes
  `${DEMO_MODE:-false}` and `fly.toml` sets it true, so no real deployment changed.
- The same flag drives the one-tap demo button on the login screen, exposed as `demo_mode`
  on `/api/v1/info` and read via `demoMode()` from `@lyftr/shared`. The button follows the
  account because both read one flag — never gate it on `import.meta.env.DEV`, which is
  decided at build time and so was absent from the public demo (a production build) and
  present against servers with no demo account.
- CI's e2e job runs against the production default with **no** demo account; the suite
  registers its own throwaway user in `globalSetup`, so it depends on nothing being seeded.

## Registration modes

`REGISTRATION` = `open` (default) | `first-user` | `closed`, enforced in
`controllers/auth.go` before any hashing and advertised as `registration_open` on
`/api/v1/info`. `first-user` re-counts inside the insert transaction
(`stores.UserStore.CreateFirst`) — the handler's pre-check alone loses the race it exists
to prevent. An invalid value is a startup failure, never a fallback to open.

---

## Dev Setup

```bash
cd backend && go run .                # :3000 — `.`, not main.go: package main spans several files
cd web && npm install && npm run dev  # :5173, proxies /api → :3000
docker compose up -d                  # prod, needs .env with JWT_SECRET
```

### Mobile builds — MANDATORY

**Never build the app locally.** No `expo run:android`/`run:ios`, no `expo prebuild` +
Gradle, no `eas build --local`. Build through the **EAS CLI** (cloud) or a CI runner:

```bash
cd mobile && eas build --platform android --profile development
```

A first local build is 10–25 min of toolchain download before it compiles anything, and
`prebuild` writes an untracked `mobile/android/` and rewrites the `android`/`ios` scripts in
`mobile/package.json`. The `development` profile (`mobile/eas.json`) is `developmentClient:
true`, so it is a **one-time** cost — after installing it, JS changes load over `npx expo
start` with no rebuild.

Emulator notes: the backend is `http://10.0.2.2:3000` (the emulator's own loopback is
itself). Maestro flows live in `mobile/.maestro/`.

---

## Code Style

- Go: `gofmt`, no unnecessary abstractions, errors wrapped with context
- TypeScript: existing patterns, no new deps without discussion
- No comments unless WHY is non-obvious
- No half-finished features on main branch
- Each PR: one feature or fix, focused diff

---

## Git — MANDATORY

**Never force-push. Never rewrite published history.** No `git push --force`, no
`--force-with-lease`, no `git rebase` of a branch that has already been pushed, no
`git commit --amend` on a pushed commit. Once a commit is on the remote it is
permanent — fix things by adding a commit on top.

**Bring a branch up to date by merging, not rebasing:**

```bash
git checkout feature/my-branch
git merge origin/main          # not: git rebase origin/main
```

**Squash-merge PRs** — `gh pr merge --squash`. Not `--merge`, not `--rebase`. One
commit per PR keeps `main` readable; the individual commits stay on the PR if anyone
needs them.

Squashing on merge is not a contradiction of the no-force-push rule above: GitHub
writes a new commit onto `main` rather than rewriting anything already published.

---

## Test Requirements — read before commit or push

**CI is the e2e gate. Local runs are the fast checks CI does not cover.**

`ci.yml` triggers on `push: branches: ['**']`, so every push to any branch runs
Playwright, not just PRs. Running the suite locally *as well* buys a few minutes of
earlier warning at real cost on a memory-constrained machine: a Chromium fleet and a Metro
bundler together will exhaust a laptop with a modest amount of RAM, and the resulting
`worker process exited unexpectedly` — out of memory — reads exactly like a broken test.
Chasing that has cost more than it has ever caught. If your machine has room, run it; the
point is that a failure there is not automatically a failure in the code.

Before a commit or push, run what is fast and what CI will not run for you:

```bash
cd backend && go test ./... -timeout 180s   # ./... — see the gap below
cd backend && go vet ./...                  # CI does not run this
# formatting: use the normalised loop below, NOT bare `gofmt -l .`
cd web && npm run test:unit && npm run lint
npm run shared:test && npm run type-check -w @lyftr/mobile
npm run test -w @lyftr/mobile -- --ci --maxWorkers=4
```

Then push, and **watch the run** — `gh pr checks <n>` or a Monitor. Pushing is not
finishing; a red check you walked away from is the same as a failing local test you
ignored.

### Where CI's coverage stops — do not over-trust it

- **Go: all packages, since CI moved to `go test ./...`.** It ran three of seven for a
  long time, which left `utils/`, `stores/`, `config/` and `oedb/` invisible — and
  `utils/validation.go`, which owns every error sentence the API emits, was among them.
  Keep new packages inside `./...` rather than adding a hand-maintained list.
- **No `gofmt`, no `go vet`, no `govulncheck`.** Space-indented Go has been pushed and
  merged unnoticed. Until CI gains the check, formatting is yours to verify — but
  **not with bare `gofmt -l .`** on a Windows checkout: git hands you CRLF, gofmt only
  emits LF, so it reports *every* Go file and the real nits drown in the noise. On a
  checkout with LF endings plain `gofmt -l` is correct. To be safe either way, normalise
  first:

  ```bash
  for f in $(git ls-files '*.go'); do
    diff -q <(tr -d '' < "$f") <(tr -d '' < "$f" | gofmt) >/dev/null || echo "$f"
  done
  ```

  A CI check runs on Linux, where the checkout is LF, so plain `gofmt -l` is correct
  there. This dodge is local-only.
- **e2e is path-filtered** to `backend/**` or `web/**` (and `packages/shared/**`, which
  the web filter includes). A mobile-only change correctly runs no Playwright — mobile is
  not in that suite, so its guards and jest suite are the only thing standing there.
- **Markdown-only *pushes* run nothing** (`paths-ignore` on the `push` trigger).
  Pull requests always run, deliberately: `main` requires these checks, and a workflow
  skipped at the trigger leaves them Pending forever rather than skipped, so a docs-only PR
  could never merge. The per-job `changes` filter keeps such a run near-free.

**Rules:**
- Never push a change you have seen fail. Red CI is fixed forward, never abandoned.
- Fix the root cause; never skip or comment out a failing test.
- Run e2e locally when you want the signal before pushing, or when CI is red and you are
  reproducing — free the RAM first (`dev-doctor.ps1`, then close Metro/Expo).

---

## Working without a specific brief

For anyone — contributor or agent — picking up work with no ticket in hand:
1. Work from the issue tracker, not from this file. Priorities and status live where they
   can be closed; a list here goes stale silently and has done before.
2. Follow conventions exactly — no new patterns without reason
3. Mobile layout always primary, desktop secondary
4. Run through empty state + null guard checklist before marking done
5. After any backend change: verify migration runs clean, test endpoint with curl
6. After any frontend change: verify mobile 390px width, no overflow
7. Run the local checks above, push, and watch CI — a task is done when its run is green,
   not when the push succeeds
