# Contributing to Lyftr

Bug reports, feature requests, and pull requests are welcome. Open an issue before submitting large changes.

---

## Local Development Setup

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/)

### Backend

```bash
cd backend
go run .
# API listens on http://localhost:3000
```

On first run the backend seeds the exercise database automatically. The demo account is
**not** seeded unless you ask for it — its password is published right below, so the
default is off everywhere, development included:

```bash
DEMO_MODE=true go run .
```

That same flag puts the one-tap "Try demo account" button on the login screen, so the
button only ever appears where the account exists.

**Demo credentials**
```
Email:    demo@lyftr.local
Password: password123
```

To seed additional food log history for the demo account:

```bash
python3 scripts/seed_food.py
```

### Frontend

```bash
cd web
npm install
npm run dev
# App at https://localhost:5173
```

The dev server uses a self-signed HTTPS certificate (via `@vitejs/plugin-basic-ssl`). Your browser will show a security warning on first visit — accept it to proceed. HTTPS is required so the barcode scanner can access the device camera on mobile.

**Testing on a mobile device**

1. Run `npm run dev` — Vite binds to all network interfaces (`host: true`)
2. Find your machine's LAN IP: `ipconfig` (Windows) / `ifconfig` (macOS/Linux)
3. Open `https://<your-lan-ip>:5173` on the phone
4. Accept the self-signed cert warning once
5. Barcode scanner and camera will work

### Production

Production HTTPS is handled by a reverse proxy (nginx, Caddy, etc.) with a real TLS certificate — no Vite or self-signed certs involved. The `basicSsl` plugin is dev-only and has no effect on `vite build` output.

```
Internet → nginx/Caddy (real TLS cert)
              ├── /       → dist/  (vite build output)
              └── /api    → localhost:3000
```

---

## Branch Naming

| Prefix | Use for | Example |
|--------|---------|---------|
| `feature/` | New functionality | `feature/csv-import` |
| `bugfix/` | Non-urgent bug fixes | `bugfix/weight-unit-display` |
| `hotfix/` | Urgent production fixes — branch off `main` directly | `hotfix/auth-token-expiry` |
| `chore/` | Deps, tooling, CI, config — no behavior change | `chore/bump-go-1.27` |
| `docs/` | Documentation only | `docs/vps-setup-guide` |
| `release/` | Version bump + changelog prep | `release/v0.2.0` |

Lowercase, hyphen-separated, specific enough to be self-explanatory.

---

## Workflow

```bash
# Start from an up-to-date main
git checkout main && git pull --rebase
git checkout -b feature/your-feature

# Work, commit, push
git push -u origin feature/your-feature

# Open a PR against main
```

Rebase against main before opening a PR if the branch has been open a while:

```bash
git fetch origin
git rebase origin/main
```

---

## Translations

UI strings live in one catalog per language in `packages/shared/src/i18n/locales`, shared
by web and mobile. `en.json` is the source and the fallback. The languages the app ships
are listed in `locales/README.md`.

**Adding a language**
1. Copy `en.json` to `<code>.json` and translate the values.
2. Add it to `resources` and `LANGUAGE_NAMES` (its own name, untranslated) in
   `i18n/index.ts`; TypeScript flags a missing entry, and the picker's order follows
   automatically.
3. List it in `locales/README.md` (`catalog.test.ts` fails if the table and the registry
   disagree).
4. Add the code to both `supportedLocales` lists of the `expo-localization` plugin in
   `mobile/app.json`, so the language appears in the iOS/Android per-app language settings.
   Mobile's `supportedLocales.test.ts` fails until you do; it reaches phones only with the
   next EAS build.
5. Run `npm run shared:test` and `npm run test -w @lyftr/mobile -- --ci --maxWorkers=4`. `catalog.test.ts` fails by key name on a missing or extra key,
   a changed `{{placeholder}}`, or a missing plural form.

**Key rules**
- Semantic dotted keys by screen, section, item and role (`settings.account.name.label`).
  Never the English sentence as the key.
- One key per context. Do not reuse a key because the English happens to match; the other
  language may not. Web and mobile share a key only when the role and the English are both
  identical.
- One catalog file per language; the area is the top-level key (`settings`, `food`, ...).
- Never build a sentence by concatenation. Use `{{placeholders}}` and keep them verbatim in
  every language.
- Counts use plural keys (`key_one`, `key_other`, ...). Each language provides exactly the
  categories `Intl.PluralRules` gives it: Spanish needs `_one`, `_many` and `_other`.
- Numbers and dates never go through i18next. Format them with `utils/number.ts` /
  `dateUtils.ts` and pass the result in as a placeholder.
- Copy with inline markup or a link uses `<Trans>` with named components, not a sentence cut
  into pieces around a tag.
- Never translate at module load. A constant that calls `t()` is evaluated once, in English,
  and never follows a language switch. Store the key (or a `UiMessage`) and call `t()` where
  it renders.

**When lint flags a string.** Web and mobile lint fail, as errors, on a literal in JSX text or
a string prop (`eslint-plugin-i18next`), and on copy handed to `apiErrorMessage`,
`useAsyncAction`, `useServerList`, a `set…Error` setter or a `label`/`placeholder`/`title`
default. Decide, in this order:
1. It is copy a person reads: add a key to `en.json` and `es.json` and render it with `t()`.
2. It is not copy (a style value, a field name, an enum token): add the prop, word or callee
   to `packages/shared/i18n-lint.cjs` with a comment saying why. Both apps read that file.
   Do not add an `eslint-disable` comment.
3. It cannot be fixed cleanly in this change: baseline that file with
   `npx eslint <file> --suppress-rule i18next/no-literal-string`, which writes
   `eslint-suppressions.json`. This is a last resort and the file only shrinks: when you
   migrate in an app that has one, run `npx eslint . --prune-suppressions` there and commit
   the smaller file.

**Renaming keys.** A key's identity is its translation memory (the lesson from Jellyfin).
Renaming a key for tidiness throws away every translation of it and forces retranslation.
Fix a typo by editing the English value in place; change the key only when the meaning
changes, because that is exactly when you want it retranslated.

---

## Commit Messages

Follow conventional commits:

```
feat(scope): short description
fix(scope): short description
chore(scope): short description
docs(scope): short description
```

Examples:
- `feat(weight): add CSV export`
- `fix(auth): handle expired refresh token`
- `chore(deps): bump Go to 1.27`

---

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include logs. Don't skip steps to reproduce.

## Requesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Explain the problem first, not just the solution.

---

## Code Standards

- **Backend:** `gofmt` before committing. Errors wrapped with context. No unnecessary abstractions.
- **Frontend:** Follow existing patterns. No new npm dependencies without discussion.
- **Tests:** Go controller tests, Vitest unit tests, and Playwright E2E must pass before any PR.

```bash
# Backend
cd backend && go test ./controllers/ -timeout 30s

# Frontend unit tests (fast, no servers needed)
cd web && npm run test:unit          # add --coverage for a report

# Frontend E2E (requires backend on :3000 and frontend on :5173)
cd web && npm run test:e2e
```

**Unit (Vitest) vs E2E (Playwright):** unit-test pure logic, stores, hooks, and
isolated components — anything that runs without a real backend or cross-page
navigation; reserve E2E for full user journeys against the running stack. Unit
files are `src/**/*.test.ts(x)`; E2E specs are `e2e/**/*.spec.ts`. Keep the two
suffixes/locations distinct so the runners never pick up each other's files.

For the full layer model (unit / integration / e2e), where a new test belongs, and
how to run each, see [docs/TESTING.md](docs/TESTING.md).

Never commit with failing tests. Fix root cause — don't skip or comment out.

---

## Pull Requests

- One feature or fix per PR — focused diffs only
- Reference the related issue if one exists
- PRs without passing tests will not be merged

## Questions?

Open a [discussion](../../discussions) or an issue.

## Not a coder?

Bug reports, doc fixes and telling other self-hosters it exists all help. If you'd rather
help with the running costs, see [Support Lyftr](https://lyftr-app.pages.dev/support/).
