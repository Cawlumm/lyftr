# Testing Strategy

How Lyftr tests are organized, where a new test belongs, and how to run them. The
goal is a **test pyramid**: many fast unit tests, a solid layer of integration
tests, and a thin layer of end-to-end tests. Fast layers carry most of the
coverage so the suite stays quick and reliable as the app grows.

```
        ╱ E2E ╲            few   — real browser, real user journeys (minutes)
      ╱─────────╲
    ╱ Integration ╲        some  — API handler + real DB (sub-second)
  ╱─────────────────╲
╱       Unit          ╲    many  — pure logic, no I/O (milliseconds)
```

## The layers

### 1. Unit — pure logic, no I/O
A single function/module in isolation; no database, no network, no browser.

- **Frontend (jest):** `mobile/src/**/*.test.ts(x)` and `packages/shared/src/**/*.test.ts`.
  Examples: `normalizeServerUrl`, `isPositiveNumber`, `dateUtils`, `formatVersion`,
  Zustand store reducers, hook behavior (`useServerInfo`).
- **Backend (`go test`):** pure functions with no DB/gin dependency.
  Targets: `utils/jwt` (token generate/validate, expiry, wrong-secret, type
  enforcement), `utils/password` (bcrypt round-trip), and any calculation logic
  extracted out of handlers.
- **Run:** `npm run test -w @lyftr/mobile` · `npm run shared:test` · `cd backend && go test ./utils/...`
- **Speed:** milliseconds. Write lots of these.

### 2. Integration — API handler + router + real SQLite
Go `controllers/*_test.go`: table-driven, booting the real router against a real
(embedded, in-process) SQLite schema — **no mocks**. This is the home for **API
contract tests**: status codes, request validation, `user_id` ownership scoping,
response shape, and DB persistence.

- **Run:** `cd backend && go test ./...`
- **Speed:** ~0.2s for the whole suite — fast because SQLite is embedded, not a
  separate service.
- **Naming note:** the CI job is historically labelled "Go unit tests"; by this
  doc's taxonomy these are **integration tests** (they exercise more than one unit
  and do real DB I/O). Go has *both* a unit layer (above) and this integration
  layer.

### 3. E2E — real browser, real user journeys
Playwright (`mobile/e2e/*.spec.ts`, against the Expo web export). For multi-step things a user actually does in
the UI: register/login, log a workout, gym mode, the barcode scanner, the
Settings server editor.

**Two projects, asymmetric by design:**
- **chromium** runs the *full* suite — business logic is covered once here.
- **mobile** (iPhone-14) runs *only* tests tagged `@mobile` — the flows where the
  phone viewport itself is under test (gym mode, the barcode scanner) plus a
  critical auth smoke. We do **not** re-run viewport-independent tests on mobile.

Tag a test/`describe` `@mobile` when the **mobile viewport is the thing under
test** (responsive layout, touch interactions, camera, mobile nav) or it's a
thin critical smoke proving the app works at phone size. Otherwise leave it
chromium-only.

```ts
test.describe('Gym Mode', { tag: '@mobile' }, () => { ... })
test('scanner opens', { tag: '@mobile' }, async ({ page }) => { ... })
```

- **Run:** needs the nginx stack, not the Expo dev server. The target is the frontend image
  (`mobile/Dockerfile.web`, the Expo web export behind nginx, proxying `/api` to the backend),
  which compose publishes on `PORT`. Playwright's default is `http://localhost:8081`
  (`mobile/e2e/config.ts`: `APP_PORT` / `BASE_URL` / `API_URL` override). CI sets
  `JWT_SECRET`, `PORT=8081` and `CORS_ORIGIN=http://localhost,http://localhost:8081` in `.env`, then:
  ```bash
  PORT=8081 docker compose up -d --wait   # repo root; needs .env with JWT_SECRET
  cd mobile && npm run test:e2e
  ```
  `npx expo start` also listens on 8081 but is **not** the e2e target; stop it first or the
  stack cannot bind the port.
- **Speed:** minutes. Keep this layer **thin** — it's the slowest and most fragile.

## Where does a new test go?

> **Rule: push each test to the lowest layer that can meaningfully cover it.**

- Pure function — formatting, validation, a calculation, a store reducer → **unit**
- Endpoint behavior — status code, validation error, ownership scoping, what's
  persisted, response shape → **integration (Go)**
- A multi-step flow a user performs in the browser → **e2e**

Concretely: a "does `GET /food/search` return the right shape?" check is an
**integration** test, not E2E. "Is this URL string valid?" is a **unit** test, not
E2E. E2E is reserved for "the user opens the page, does X, and sees Y."

## Rules that keep the pyramid healthy

- **Move-then-verify, never delete-and-hope.** Don't remove a higher-layer test
  until equivalent lower-layer coverage exists *and is green*. (E.g. the
  `auth.spec` scheme/invalid-URL E2E cases are only safe to drop because
  `packages/shared/src/utils/serverUrl.test.ts` now covers `normalizeServerUrl` directly.)
- **Every test pins a distinct case or path.** No filler, no testing the framework,
  no re-running the same assertion "through another door."
- **Determinism.** Pin `TZ` for any local↔UTC date logic (see `packages/shared/jest.config.js`).
  Don't share mutable state across tests that may run in parallel — each test owns
  its own data.
- **No hard waits in E2E.** Never `page.waitForTimeout(...)` — it's slow when the
  app is fast and flaky when it's slow. Wait on a *real signal* instead: a
  web-first assertion (`await expect(locator).toBeVisible()` auto-retries), a
  navigation (`waitForURL`), or the actual network call
  (`page.waitForResponse(r => r.url().includes('/api/v1/weight') && r.request().method() === 'POST')`).
- **Isolation: one fresh user per worker + idempotent seeding.** Each worker
  registers its own account (`e2e/fixtures.ts`), so runs are hermetic. Seed via
  `cleanupSeed` (delete your exact seed names, then create) so a `beforeAll` is
  idempotent — it runs once *per project* (chromium + mobile), so on the shared
  workers:1 user it executes twice; idempotent seeding keeps the result to one set.
- **No strict-mode traps on list items.** For "this row is gone after filter/delete"
  use `await expect(page.getByText(name)).toHaveCount(0)` (auto-retries to zero) —
  NOT `.not.toBeVisible()`, which throws a strict-mode error (not retried) if a
  debounced list re-render transiently shows two matching nodes. Use `.first()` on
  "this row appears" checks for the same reason.
- **WHY-comments.** Explain non-obvious test setup in the same explanatory style as
  the rest of the codebase.

## Web polish checklist (Expo web)

What a web screen is held to before it ships, walked per route at **390, 768, 1280 and
1920** in **light and dark**. `mobile/e2e/polish.spec.ts` automates the first four rows on
every route and attaches a screenshot per width and theme to the report. Rows 5-13 are only
partly pinned by the specs named in the last column (not route by route), so the rest is a
person with a keyboard; a route not driven by hand is recorded as not walked. Fill it in per route in the PR description, not in the repo.

| # | Check | Pass when | Automated |
|---|---|---|---|
| 1 | Layout | No horizontal scroll; no text cut off at the window edge; columns centred at max width from 768 | polish.spec |
| 2 | Console | Zero `console.error` and zero uncaught errors on load and resize | polish.spec |
| 3 | Headings | Exactly one visible `h1`; sections are `h2` | polish.spec |
| 4 | Contrast | Text >= 4.5:1, UI parts and focus ring >= 3:1, both themes | a11y.spec (axe), interaction.test |
| 5 | Hover / active / disabled | Every pressable has a hover state (pointer devices only), press feedback, and a visibly disabled state that does not respond | primitives.spec, lists.spec (hover; partial) |
| 6 | Focus | `focus-visible` ring on every control, never on click; Tab order follows reading order | shell.spec, overlays.spec, primitives.spec (partial) |
| 7 | Keyboard | Enter/Space activate buttons, Escape closes dialogs and menus and returns focus, arrows move within menus and segmented controls | overlays.spec, sheet.spec, primitives.spec, shell.spec (partial) |
| 8 | Cursor | `pointer` on everything clickable, text cursor in fields, `not-allowed` or default when disabled | primitives.spec (cursor; partial) |
| 9 | Links | Navigation is a real `<a href>` (middle-click, open in new tab); Back and Forward walk the history | shell.spec, lists.spec, primitives.spec (partial) |
| 10 | Title | `document.title` names the screen | shell.spec (partial) |
| 11 | Scroll | Restored on Back; locked behind an open dialog or sheet | sheet.spec (scroll lock only; Back restore unpinned) |
| 12 | Tooltips | Icon-only controls have an accessible name; chart tooltips follow pointer and keyboard | a11y.spec structural axe (names); chart tooltips unpinned |
| 13 | Inputs | Right `type`/`inputmode`, `autocomplete`, `enterkeyhint`; a visible or accessible label | forms.spec, nutrition.spec, weight.spec, settings-layout.spec (partial) |
| 14 | Motion | Short and purposeful; none under `prefers-reduced-motion: reduce` | motion.spec |
| 15 | Icons | One set (lucide, per-icon imports through `<Icon>` or `ui/icons`); decorative ones `aria-hidden` | |

Run the walk against a local export (`npm run export:web -w @lyftr/mobile`, then any static
server with an `/api` proxy) rather than `expo start`: the dev server's overlay and HMR
client log to the console and fail row 2 for reasons that never reach production.

## Running everything

| Layer | Command | Where |
|---|---|---|
| Frontend unit | `npm run test -w @lyftr/mobile` · `npm run shared:test` | repo root |
| Backend unit + integration | `go test ./...` | `backend/` |
| E2E (Expo web export) | `npm run test:e2e` | `mobile/` |

CI runs all of these on every PR (see `.github/workflows/ci.yml`).

## Current state & roadmap

- ✅ **Frontend unit** layer established (jest).
- 🔜 **Backend unit** layer — pure-logic gaps to fill: `utils/jwt`, `utils/password`,
  and calculations currently inline in `GetDailyStats` / `GetWeightStats` (extract →
  unit-test the math).
- ✅ **Integration** — 82 Go controller tests.
- 🔧 **E2E** — being rebalanced (API-contract tests moving down to Go) and
  parallelized (per-test user isolation → multiple workers).

Tracked in the testing-architecture overhaul issue.
