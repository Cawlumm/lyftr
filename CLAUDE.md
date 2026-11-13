# Lyftr — project context

Self-hosted workout tracker: Go (Gin) + SQLite backend, Expo/React Native app (iOS, Android and the web export), Docker. GitHub: https://github.com/Cawlumm/lyftr

Written for humans and agents alike; it is checked in, so it is also what the automated PR review reads (`REVIEW.md` says how to weigh findings against it). Machine-specific setup — your paths, ports, editor, hardware limits — goes in `~/.claude/CLAUDE.md` or the gitignored `CLAUDE.local.md`, never here.

Every rule below was paid for by a bug. Where one names a file, that file is the single place the rule is enforced; adding a second is how the rule stops holding.

---

## Key Conventions

**Backend**
- Handlers use `utils.OK(c, data)` / `utils.BadRequest(c, msg)`. Routes: public under `/api/v1/auth/`, protected under `/api/v1/` (JWT). `admin/...` routes need auth but have no role check yet.
- Weight is stored in **lbs**; the unit is a frontend convention. Convert via `lbsToDisplay`/`displayToLbs` in `packages/shared/src/utils/weight.ts` using `user_settings.weight_unit` — never store display values.
- `exercise_id` FKs reference `exercises(id)` with **no ON DELETE CASCADE** — never wipe/DELETE from `exercises` while workout/program data exists. A row oedb stops listing is hidden (`exercises.upstream_missing_at`, hidden from `List` only), never deleted; `markUpstreamMissing` is the one place that decides, and it refuses an export under half of what is held (`ErrCatalogShrank`) unless an operator confirms with `?confirm_removals=true`.
- Migrations go in `db/migrations.go` — append only, never modify existing.

**Frontend**
- API calls go through the shared client (`packages/shared/src/client.ts`, bound in `apps/app/src/lib/lyftr.ts`) — never inline `axios`/`fetch`.
- Null-guard arrays before `.reduce`/`.forEach`: `(w.exercises ?? []).forEach(...)`.
- Duration is stored as **seconds** — display `Math.round(duration / 60)` min.
- Theme: `localStorage.setItem('theme', 'light|dark')` + `document.documentElement.classList`.
- Mobile-first (90% of users); desktop is secondary. New pages are a route file in `apps/app/app/` (serves native and web).

---

## Time & Calendar Days — read before touching any date

**The rule: a row records its own day. Nothing re-derives one from whoever is reading.**

An instant does not contain a day — a day is an instant *plus a place* — so every day-scoped row stores both, and travelling does not rewrite history.

- `food_logs`, `weight_logs`: `logged_at` (UTC) + `logged_on` (`YYYY-MM-DD`). The user *picks* the day.
- `workouts`: `started_at` (UTC) + `tz_offset_minutes` (offset at start). The day *follows* from where the moment happened.

**`user_settings.timezone` is not dead and is not the source of day attribution.** It answers only questions about *now*: "what is today?" for a read with no `date` param; "30 days back from your today" (`/food/history`, `/weight/stats` send no dates); and the day/offset for a write from a client too old to send one.

### Single points of truth — do not add a fifth way to get a day

- **Backend**: `backend/controllers/timezone.go` — `resolveDay` (writes), `resolveQueryDay` (reads), `daysAgoDay` (windows), `tzOffsetMinutes` (workouts). Every handler goes through one; no inline `time.Now().In(loc)` elsewhere.
- **Client**: `packages/shared/src/utils/dateUtils.ts`, one copy, imported from `@lyftr/shared`. `entryDay(e)` for diary rows, `workoutDay(w)` for workouts — never `new Date(x).getDate()` or `.toISOString().slice(0,10)` in a page. Writes go through `withLoggedOn` / `utcOffsetMinutes` in the API layer so no screen can forget the day.
- Editing a shared util is guarded by CI: the `mobile` paths filter in `ci.yml` includes `packages/shared/**`, so mobile's jest suite, the web export and the e2e gate run.

### Gotchas

- SQLite `date(started_at, ...)` returns NULL: the modernc driver writes Go's `String()` form (`2026-04-25 03:30:00 +0000 UTC`). Use `substr(x, 1, 19)` first.
- `time/tzdata` must stay imported — Alpine has no zoneinfo, so `LoadLocation` silently falls back to UTC in production only.
- Day arithmetic uses `AddDate(0, 0, n)`, never `Add(24 * time.Hour)` (DST).

---

## Numbers & Locale — read before rendering or reading a number

**The rule: the app stores canonical, the screen shows the user's notation, and one module owns the conversion both ways.**

Many locales write `12,5`, and on Android `decimal-pad` there is often no full stop at all, so stripping "anything that isn't a digit or a dot" makes decimals unenterable (#141). React Native's `ReactEditText` permits all keyboard input, so `keyboardType` constrains what is *drawn*, never what arrives — sanitizing is mandatory.

- DB, API, stores, arithmetic, and a numeric field's buffer: canonical `.`.
- Anything a person reads: the locale's notation.

### Single points of truth — do not add a fourth way to write a number

In `packages/shared/src/utils/number.ts`, imported from `@lyftr/shared`: **`sanitizeNumericInput(raw, mode)`** — typed text → canonical. Every numeric `TextInput` on mobile goes through it; there is no second copy.

The display half (stored number → reader's notation) is **not merged yet**, so there is no shared formatter. A screen that needs one is writing the first: put it in this module, not the screen. Do not document it here before it lands.

### Gotchas

- **Numbers not for reading stay canonical** — SVG path data, keys, ids, query params. `DashboardCharts.tsx` builds paths with `toFixed(1)`; localise that and the parser reads the comma as a coordinate separator and the chart collapses.
- **Whitespace is never a separator.** `fr`, `ru`, `sv`, `pl`, `cs`, `fi`, `nb`, `uk` use a space as the *group* character and `expo-localization` passes it through; treating it as a candidate made a trailing space read as a decimal point.
- **Grouping is never detected.** A `TextInput` re-sends the whole field each keystroke, so `"1,"` arrives with nothing after it and is read as a decimal. `1,200` on en-US is `1.2` whether typed or pasted — they agree on purpose (pinned by `number.test.ts`).
- **Non-ASCII digits are folded arithmetically** (U+0660–0669, U+06F0–06F9), not via `normalize('NFKC')`, which folds fullwidth digits but leaves Arabic-Indic alone — a test with `１２` passes while the real case logs a weight of 0.
- **A locale-dependent test must say which locale it asserts.** `packages/shared` is plain `ts-jest` with no locale set, so an unlabelled test is an en-US test, the one locale where separator bugs never appear.

---

## UI Strings — read before adding screen copy

**The rule: screen copy goes through `t()`, with keys in `packages/shared/src/i18n/locales/en.json`.**

- Single points of truth: `i18n/index.ts` (init, language registry, `resolveLanguage`, and the picker's entries/order/label: `LANGUAGE_ORDER`, `languageChoiceLabel`), `stores/language.ts` (device-level preference), `i18n/catalog.test.ts` (key, placeholder and plural parity across locales).
- The OS per-app language list is `supportedLocales` in `apps/app/app.json`, held to the registry by a mobile test; it only changes with an EAS build.
- Hermes has no `Intl.PluralRules`; `apps/app/src/lib/polyfills.ts` imports the polyfill.
- **The guard is lint.** `eslint-plugin-i18next` (`no-literal-string`) plus three `no-restricted-syntax` selectors fail mobile lint on a hard-coded string in JSX text or a string prop, and on copy passed to `apiErrorMessage`, `useAsyncAction`, `useServerList`, a `set…Error` setter or a `label`/`placeholder`/`title` default. Rule data is `packages/shared/i18n-lint.cjs`: a prop or word that is not copy is allowlisted there, once. A hit is copy to migrate, not something to silence (CONTRIBUTING.md, "Translations", has key-naming rules).
- Numbers and dates are never formatted through i18next (see Numbers & Locale).

---

## Failing Requests — read before touching the API client

**The rule: every request settles, and only the server may end a session.**

A promise that never settles is a dead app: anything gated on it (`saving`, `isLoading`, a disabled button) stays that way until the process is killed (#145 — a token refresh on bare `axios`, which has `timeout: 0`).

| the failure | what we do |
|---|---|
| timeout, dropped connection, 5xx, proxy 502/504 (no answer) | keep the session, surface the error, let them retry |
| refresh answers 400/401/403 (server revoked it) | clear the tokens, `onAuthFailure` |

Silence is not a verdict: signing out on it ends a live workout whenever someone passes a dead spot in gym wifi, and a self-hosted backend restart answering 502 must not evict anyone.

### Single points of truth

- **`packages/shared/src/client.ts`** — one axios instance, `REQUEST_TIMEOUT` on every call *including the refresh*, `sessionWasRevoked` for the table above, `refreshOnce` so a burst of 401s shares one round-trip instead of racing to rotate the same token. Native and web share it.
- **`apiErrorMessage(err, fallback)`** — the only way to turn an error into words. Never read `err.response.data.error` at a call site: the failures that matter most have no response. It routes those to `networkFailureMessage`, which names cleartext blocks, bad certificates and timeouts from the native detail RN hides on the XHR.
- **Say it where the tap was.** `ConfirmSheet` takes an `error` and stays open, so a failed confirm shows why with the retry under the same finger; a banner at the top of a scrolled list is saying nothing.

### Gotchas

- **A bare `axios.*` call is not the client:** it skips the timeout, auth header and interceptor. `client.ts` has exactly two on purpose — the `/info` probe (8s, fails fast) and the refresh (cannot use `api` without recursing into its own interceptor). Both pass an explicit `timeout`; a third without one re-opens #145.
- **RN does not report timeouts like the web:** no `ECONNABORTED`, no `request._timedOut` — just the literal string `timeout` on the XHR's `_response`. `classifyNetworkError` matches it.
- **Reproduce network failure with a black hole, not a stopped server.** A stopped server gives an instant ECONNREFUSED and hides every bug of this class; a proxy that accepts and never replies is the faithful model.

---

## Demo mode and registration

- Demo account: `demo@lyftr.local` / `password123`, with a PPL program + 8 weeks of workouts. **Seeded only when `DEMO_MODE` is on, and it is off by default everywhere, development included** (`ENV` itself defaults to `"development"`, so keying off it seeded a published password). Opt in with `DEMO_MODE=true go run .`; Compose passes `${DEMO_MODE:-false}`, `fly.toml` sets it true.
- The same flag drives the login screen's demo button, exposed as `demo_mode` on `/api/v1/info` and read via `demoMode()` from `@lyftr/shared`. Never gate the button on `import.meta.env.DEV` — it is decided at build time.
- CI's e2e runs against the production default with **no** demo account; the suite registers its own throwaway user in `globalSetup`.
- `REGISTRATION` = `open` (default) | `first-user` | `closed`, enforced in `controllers/auth.go` before any hashing and advertised as `registration_open` on `/api/v1/info`. `first-user` re-counts inside the insert transaction (`stores.UserStore.CreateFirst`) — the handler's pre-check alone loses the race. An invalid value is a startup failure, never a fallback to open.

---

## Web (react-native-web)

The web is the Expo app's `--platform web` export, not a separate app. Platform splits are `.web.tsx` / `.native.tsx` beside the shared file. Dev (`npx expo start --web`, :8081) calls the backend on :3000 directly; the backend allows all origins while `ENV=development`. Production and e2e use the nginx stack, which proxies `/api`.

Single points of truth:
- `apps/app/src/theme/breakpoints.json` — read by `tailwind.config.js` and `useBreakpoint`.
- `apps/app/src/theme/motion.ts` + `useMotion` — durations, easing, reduced motion.
- `apps/app/src/components/ui/icons.ts` + `Icon.tsx` — per-icon registry; no lucide barrel imports.
- `apps/app/src/components/ui/interaction.ts` — `WEB_BUTTON`, `interactive`, `currentStep`, `touchTarget`/`touchPad`: every control's own box is at least 44x44 (react-native-web ignores `hitSlop`); `e2e/touch-targets.spec.ts` holds it.
- `apps/app/src/components/ui/link.ts` — `linkProps`: a real `<a>` on web.
- `apps/app/nginx.security-headers.conf` — CSP and the other response headers, included by the server block **and every location that sets its own `add_header`** (nginx drops inherited ones there); shared by `nginx.conf.template` and `fly/nginx.fly.conf`. HSTS is Fly-only (`fly/nginx.hsts.conf`). A new inline script or a new external origin needs a matching change here; check the browser console for CSP errors.
- `apps/app/src/lib/legacyRoutes.ts` — generates `apps/app/nginx.legacy-redirects.conf`; regenerate with `UPDATE_NGINX_REDIRECTS=1 npx jest src/lib/legacyRedirects` in `apps/app/`.
- Web quality checklist: `docs/TESTING.md`.

**Later:** splitting the shared core (i18n core/react, exports map, injected TZ) is deferred until a CLI/MCP client exists.

---

## Dev Setup

```bash
cd backend && go run .                  # :3000 — `.`, not main.go: package main spans several files
cd apps/app && npx expo start --web     # :8081, point it at :3000
docker compose up -d                    # prod, needs .env with JWT_SECRET
```

- Go 1.26 required — Dockerfile must use `golang:1.26.11-alpine`.
- Build the backend via `backend/build.sh` (both Dockerfiles invoke it) — never `go build` by hand. It is the single source of the version ldflag (`-X …/config.buildVersion=${VERSION:-dev}`) that CI's `version-smoke` asserts on. Note `.`, not `./...`.

### Mobile builds — MANDATORY

**Never build the app locally.** No `expo run:android`/`run:ios`, no `expo prebuild` + Gradle, no `eas build --local` (`prebuild` writes an untracked `apps/app/android/` and rewrites the `android`/`ios` scripts in `package.json`). Build through the **EAS CLI** (cloud) or a CI runner:

```bash
cd apps/app && eas build --platform android --profile preview
```

`apps/app/eas.json` defines **`preview` and `production` only** — no `development` profile, so nothing produces a `developmentClient` build; add one if you need native modules on device. For JS-only work, **Expo Go plus `npx expo start` loads the working tree directly**.

Emulator: the backend is at `http://10.0.2.2:3000`, or over an `adb reverse` tunnel — check `adb reverse --list` first. Maestro flows are not in the repo (`apps/app/.maestro/` is gitignored).

---

## Code Style

- Go: `gofmt`, no unnecessary abstractions, errors wrapped with context. TypeScript: existing patterns, no new deps without discussion.
- No comments unless WHY is non-obvious.
- No half-finished features on main. Each PR: one feature or fix, focused diff.

---

## Git — MANDATORY

**Never force-push. Never rewrite published history.** No `git push --force`, no `--force-with-lease`, no `git rebase` of a pushed branch, no `git commit --amend` on a pushed commit. Fix things by adding a commit on top.

**Bring a branch up to date by merging, not rebasing:** `git merge origin/main`.

**Squash-merge PRs** — `gh pr merge --squash`, not `--merge` or `--rebase`. This does not contradict the no-force-push rule: GitHub writes a new commit onto `main` rather than rewriting any.

---

## Test Requirements — read before commit or push

**CI is the e2e gate. Local runs are the fast checks CI does not cover.**

`ci.yml` triggers on `push: branches: ['**']`, so every push runs Playwright. Running it locally too buys minutes of earlier warning at real cost on a small machine: a Chromium fleet plus Metro can exhaust RAM, and the resulting `worker process exited unexpectedly` reads exactly like a broken test. If your machine has room, run it; a failure there is not automatically a failure in the code.

Before a commit or push:

```bash
cd backend && go test ./... -timeout 180s   # ./... — see the gap below
cd backend && go vet ./...                  # CI does not run this
# formatting: use the normalised loop below, NOT bare `gofmt -l .`
npm run lint -w @lyftr/mobile
npm run shared:test && npm run type-check -w @lyftr/mobile
npm run test -w @lyftr/mobile -- --ci --maxWorkers=4
```

Then push and **watch the run** (`gh pr checks <n>` or a Monitor). Pushing is not finishing.

### Where CI's coverage stops — do not over-trust it

- **Go: all packages** (`go test ./...`). Keep new packages inside `./...` rather than a hand-maintained list — `utils/validation.go`, which owns every API error sentence, was once invisible to CI.
- **No `gofmt`, no `go vet`, no `govulncheck`** — formatting is yours to verify. Not with bare `gofmt -l .` on a Windows checkout: git hands you CRLF, gofmt emits LF, so it reports every file. Normalise first (local-only dodge; on Linux/LF plain `gofmt -l` is correct):

  ```bash
  for f in $(git ls-files '*.go'); do
    diff -q <(tr -d '\r' < "$f") <(tr -d '\r' < "$f" | gofmt) >/dev/null || echo "$f"
  done
  ```

- **App jobs:** Playwright runs against the compose stack (nginx + Expo web export + backend) as three `e2e-shard` jobs (`--shard=N/3`) in the official `mcr.microsoft.com/playwright` image tagged to the lockfile's `@playwright/test`; `e2e-app` only aggregates them and carries the required check name. Never put `playwright install-deps` back — apt against the runner's mirror trickled at ~80 KB/s and timed the job out. `perf.spec.ts` holds LCP/CLS tripwires; `polish.spec.ts` walks every route at four widths in both themes. `web-export` builds the export and enforces the bundle budget in `apps/app/perf-budget.json`.
- **The e2e stack never calls the hosted open-exercise-db** (metered free tier; an empty `OEDB_BASE_URL` means production). `apps/app/e2e/oedb-stub/` is overlaid on the compose stack, and a CI step fails the shard if the stub never served the backend's snapshot manifest. Run e2e locally with that overlay too (docs/TESTING.md).
- **e2e is path-filtered** to `backend/**` or `apps/app/**` (and `packages/shared/**` via the mobile filter). A native-only change still runs it; jest and type-check stand behind native code.
- **Markdown-only *pushes* run nothing** (`paths-ignore`), but pull requests always run, deliberately: `main` requires these checks, and a workflow skipped at the trigger leaves them Pending forever, so a docs-only PR could never merge. The per-job `changes` filter keeps that run near-free.

**Rules:**
- Never push a change you have seen fail. Red CI is fixed forward, never abandoned.
- Fix the root cause; never skip or comment out a failing test.
- Run e2e locally when you want the signal first or are reproducing red CI — free the RAM first (`dev-doctor.ps1`, close Metro/Expo).

---

## Working without a specific brief

1. Work from the issue tracker, not from this file — priorities live where they can be closed.
2. Follow conventions exactly; no new patterns without reason.
3. Mobile layout primary, desktop secondary.
4. Run the empty-state + null-guard checklist before marking done.
5. After a backend change: verify the migration runs clean and curl the endpoint.
6. After a frontend change: verify 390px width, no overflow.
7. Run the local checks above, push, and watch CI — done means the run is green, not that the push succeeded.
