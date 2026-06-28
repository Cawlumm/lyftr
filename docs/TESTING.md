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

- **Frontend (Vitest):** `web/src/**/*.test.ts(x)`, jsdom environment.
  Examples: `normalizeServerUrl`, `isPositiveNumber`, `dateUtils`, `formatVersion`,
  Zustand store reducers, hook behavior (`useServerInfo`).
- **Backend (`go test`):** pure functions with no DB/gin dependency.
  Targets: `utils/jwt` (token generate/validate, expiry, wrong-secret, type
  enforcement), `utils/password` (bcrypt round-trip), and any calculation logic
  extracted out of handlers.
- **Run:** `cd web && npm run test:unit` · `cd backend && go test ./utils/...`
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
Playwright (`web/e2e/*.spec.ts`). For multi-step things a user actually does in
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

- **Run:** `cd web && npm run test:e2e`
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
  `stores/server.test.ts` now covers `normalizeServerUrl` directly.)
- **Every test pins a distinct case or path.** No filler, no testing the framework,
  no re-running the same assertion "through another door."
- **Determinism.** Pin `TZ` for any local↔UTC date logic (see `vitest.config.ts`).
  Don't share mutable state across tests that may run in parallel — each test owns
  its own data.
- **No hard waits in E2E.** Never `page.waitForTimeout(...)` — it's slow when the
  app is fast and flaky when it's slow. Wait on a *real signal* instead: a
  web-first assertion (`await expect(locator).toBeVisible()` auto-retries), a
  navigation (`waitForURL`), or the actual network call
  (`page.waitForResponse(r => r.url().includes('/api/v1/weight') && r.request().method() === 'POST')`).
- **WHY-comments.** Explain non-obvious test setup in the same explanatory style as
  the rest of the codebase.

## Running everything

| Layer | Command | Where |
|---|---|---|
| Frontend unit | `npm run test:unit` (`--coverage` for a report) | `web/` |
| Backend unit + integration | `go test ./...` | `backend/` |
| E2E (dev server) | `npm run test:e2e` | `web/` |
| E2E (docker stack) | `npm run test:e2e:docker` | `web/` |

CI runs all of these on every PR (see `.github/workflows/ci.yml`).

## Current state & roadmap

- ✅ **Frontend unit** layer established (Vitest).
- 🔜 **Backend unit** layer — pure-logic gaps to fill: `utils/jwt`, `utils/password`,
  and calculations currently inline in `GetDailyStats` / `GetWeightStats` (extract →
  unit-test the math).
- ✅ **Integration** — 82 Go controller tests.
- 🔧 **E2E** — being rebalanced (API-contract tests moving down to Go) and
  parallelized (per-test user isolation → multiple workers).

Tracked in the testing-architecture overhaul issue.
