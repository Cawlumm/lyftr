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

On first run the backend seeds a demo account and exercise database automatically.

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
- **Tests:** Go controller tests and Playwright E2E must pass before any PR.

```bash
# Backend
cd backend && go test ./controllers/ -timeout 30s

# Frontend E2E (requires backend on :3000 and frontend on :5173)
cd web && npm run test:e2e
```

Never commit with failing tests. Fix root cause — don't skip or comment out.

---

## Pull Requests

- One feature or fix per PR — focused diffs only
- Reference the related issue if one exists
- PRs without passing tests will not be merged

## Questions?

Open a [discussion](../../discussions) or an issue.
