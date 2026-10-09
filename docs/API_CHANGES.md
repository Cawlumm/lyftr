# API changes

Breaking changes to the HTTP API, recorded when they land so the next release's notes
can carry them. Self-hosters and anyone driving the API directly are the audience — the
first-party clients are updated in the same PR and never notice.

Newest first. Delete an entry once it has shipped in a release whose notes mention it.

**Recording an entry is part of the PR that breaks something, not part of cutting the
release.** Everything between `v0.1.0-beta.6` and the entries below was reconstructed by
auditing the diff at tag time, which found nine breaks where this file held none — and the
one entry it did hold had already shipped, unannounced, a release earlier. A diff audit
catches what the author knew and forgot; it cannot catch what the author never noticed.
If your PR changes a status code, narrows an accepted value, or renames a response field,
add the entry in that PR.

## `POST /api/v1/auth/register` — an address differing only in letter case is a duplicate

An address that differs from an existing account only in letter case (`Carter@example.com`
beside `carter@example.com`) now answers `409` `That email is already registered.`. It used
to answer `201` and create a second account.

Only ASCII letters fold. Stored spellings are never rewritten.

## Not breaking, but visible

Not entries — nothing to fix on a caller's side — but worth a line in the notes because
somebody will see the change.

- **Sign-in matches the address case-insensitively**, returning the spelling stored at
  registration. An install that already holds case-variant accounts keeps both: each still
  signs in with its exact spelling, and the boot log names them;
  `lyftr-api delete-account <exact address>` removes the one you do not want.
