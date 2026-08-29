# Review instructions

How the automated review on each PR should judge and report, and what to look for beyond
the obvious. Findings are advisory — nothing here blocks a merge directly — but `main`
requires review threads to be resolved, so an unresolved finding holds a merge until
someone answers it.

**This file does not restate the project's standards.** Those live in `CLAUDE.md`, which
the review already reads. Duplicating a rule here would create two copies to keep in step,
and the copies would drift. This file is about how to weigh a violation, and about the
defect classes worth hunting that no linter finds.

Write findings for the author, not for a report. Each one names what breaks, cites the
evidence, and — where it is not obvious — says what to do instead.

## What Important means here

Reserve 🔴 Important for a change that would **break behaviour, lose or corrupt user data,
or lock someone out of their own account**. Everything else is a nit at most.

Two classes sit above their usual severity in an app someone trusts with their own records:

- **A wrong value presented as a right one.** A substituted default, a stale cache or a
  swallowed failure rendered as though it were the user's data. Worse when that value can
  be written back, because then it is data loss rather than a display bug.
- **Anything that can end a session or destroy work the user has not finished.**

## Standards come from CLAUDE.md

Treat a newly introduced violation of `CLAUDE.md` as a finding, at the severity its
consequence deserves rather than automatically as a nit — those rules exist because each
was paid for by a bug.

Flag the reverse too: a change that makes a statement in `CLAUDE.md` untrue. A stale rule
is worse than a missing one, because it is trusted.

## Fix the bug class, not the bug

- **Find the sibling sites.** When a fix lands in one place, grep for the same shape
  elsewhere: the sync and async twins, the two platforms' branches, the copy-pasted block,
  every caller of a changed helper. Same-class sites are one concern, not scope creep.
  Prefer moving the guard into the shared helper over repeating it.
- **Enumerate the input space.** Empty, zero and unset are three different states — gate on
  presence, not truthiness. Check what happens at the boundary, one past it, and with input
  that becomes empty after processing.
- **Every line added must be demonstrably live.** Trace new state to a real consumer;
  parsed-but-never-read is a red flag. Check for an unconditional overwrite after a new
  conditional. If a guard's purpose is to fail, confirm something can still reach it.

## Every line is a liability

Code that does not exist cannot break. Prefer deleting to adding, and reuse to reinvention.

- **Look for the copy before accepting a new one.** A helper that already does this, a hook
  that already owns this state, a utility one directory over. Duplication is not only
  wasted lines; it is two places to fix and one that will be forgotten.
- **Question each new construct.** A wrapper that only forwards, a flag with one caller, an
  abstraction with one implementation, state derivable from what is already there. Ask what
  breaks if it is removed — if nothing, say so.
- **Simpler is a finding, but readable beats short.** Do not push for density. Nested
  ternaries, clever one-liners and over-merged functions trade a reader's time for a line
  count, and reviews that chase brevity produce code nobody can debug at 2am. Flag
  complexity that hides intent, not length itself.
- **Do not invent abstraction for the future.** Two similar call sites are not yet a
  pattern; the third one tells you what the abstraction should have been.

## Refactors are guilty until proven behaviour-preserving

When a diff moves, copies, re-applies or reformats existing code, the risk is not what it
adds but what it quietly drops.

- **Diff the old path's full behaviour**: error-path side effects, condition polarity,
  defaults, an unconditional operation becoming conditional.
- **Check nothing on the target branch was lost.** A file taken from another branch, a
  cherry-pick, a merge resolved the wrong way — type checks, linters and test suites all
  pass a silent revert, so review is the only thing standing there.
- **Before deleting odd-looking code, find out why it exists.** It is usually load-bearing.
  If neighbouring code does the same thing differently, that difference may be the point.

## One source of truth

When a fact lives in two places — mirrored constants, an encode/decode pair, a document and
the code it describes — derive one from the other or flag the pair. Renames and signature
changes need every consumer updated in the same PR; a stale call site can compile fine and
silently miss the new behaviour.

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

Where a rule is a matter of taste rather than correctness, say which it is.

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
- Speculative future-proofing: "this will not scale" without a concrete path to the load.
