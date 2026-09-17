# Review instructions

How the automated review on each PR should judge and report. Findings are advisory —
nothing here blocks a merge directly — but `main` requires review threads to be resolved,
so an unresolved finding does hold a merge until someone answers it.

**This file does not restate the project's standards.** Those live in `CLAUDE.md` at the
repository root, and the review already reads it. Duplicating a
rule here would create two copies to keep in step, and the copies would drift. This file
is only about severity, volume, evidence, and what to leave alone.

## What Important means here

Reserve 🔴 Important for a change that would **break behaviour, lose or corrupt user data,
or lock someone out of their own account**. Everything else — naming, structure, style,
tests for code already covered — is a nit at most.

Two classes sit above their usual severity in a self-hosted app someone trusts with their
own records:

- **A wrong value presented as a right one.** A substituted default, a stale cache or a
  swallowed failure rendered as though it were the user's data. Worse when that value can
  be written back, because then it is data loss rather than a display bug.
- **Anything that can end a session or destroy work the user has not finished.**

## Standards come from CLAUDE.md

Treat a newly introduced violation of `CLAUDE.md` as a finding, at the severity its
consequence deserves rather than automatically as a nit — those files exist because each
rule was paid for by a bug.

Also flag the reverse: a change that makes a statement in `CLAUDE.md` untrue. A stale rule
is worse than a missing one, because it is trusted.

## Cap the nits

At most five nits per review; summarise the rest as a count. Much of this repo's churn is
one pattern applied across many files, and forty style comments on such a diff bury the
finding that matters.

After the first review of a PR, report Important findings only. A small follow-up push
should not draw a fresh round of style notes.

## Evidence, not inference

A claim about behaviour needs a `file:line` citation in the source. If the only evidence is
that a name sounds wrong, say so plainly and lower the severity. A confident wrong finding
costs more than a missed nit: it sends someone to change working code.

## Regressions hide in moved code

When a diff moves, copies or re-applies existing code — a refactor, a cherry-pick, a file
taken from another branch — check that nothing already on the target branch was dropped in
the process. Type checks, linters and test suites all pass a silent revert, so review is
the only thing standing there.

## Feed the loop

When you flag something `CLAUDE.md` should have prevented, and it is the second time,
propose the `CLAUDE.md` correction as part of the review, so the standard improves instead
of the same finding recurring.

## Do not report

- Anything CI already enforces: type checks, linters, the unit and e2e suites. Check what
  CI actually runs before assuming — `CLAUDE.md` documents where its coverage stops, and
  the gaps move.
- Formatting, unless the PR itself introduced the inconsistency.
- Lockfiles and generated files.
- Test code that deliberately violates a production rule in order to exercise it.
- Pre-existing problems the PR merely sits near, unless it makes them materially worse —
  note them once as 🟣, never as blocking.
