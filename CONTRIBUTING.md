# Contributing to Lyftr

Bug reports, feature requests, and pull requests are welcome. Open an issue before submitting large changes.

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
