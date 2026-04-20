# Contributing to Lyftr

Bug reports, feature requests, and pull requests are welcome. Here's how to get involved without wasting your time or mine.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include logs. Don't skip steps to reproduce.

## Requesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Explain the problem first, not just the solution.

## Submitting a pull request

1. Open an issue first for anything non-trivial — alignment before code saves everyone time
2. Fork the repo and create a branch: `git checkout -b feat/your-thing`
3. Keep changes focused. One feature or fix per PR
4. Test it locally before opening the PR

## Local development

```bash
# Backend (Go, runs on :3000)
cd backend && go run main.go

# Frontend (React + Vite, runs on :5173)
cd web && npm install && npm run dev
```

See the [README](README.md) for full setup instructions.

## Code style

- Go: standard `gofmt` formatting
- TypeScript/React: existing patterns in the codebase — no new dependencies without discussion
- No half-finished features. If it's not ready, keep it on a branch

## Questions?

Open a [discussion](../../discussions) or an issue. Happy to help.
