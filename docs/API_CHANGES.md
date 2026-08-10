# API changes

Breaking changes to the HTTP API, recorded when they land so the next release's notes
can carry them. Self-hosters and anyone driving the API directly are the audience — the
first-party clients are updated in the same PR and never notice.

Newest first. Delete an entry once it has shipped in a release whose notes mention it.

## `GET /api/v1/weight` — `from` / `to` accept a calendar day only

Both bounds must now be `YYYY-MM-DD`, and anything else is rejected with `400`.

Previously the endpoint accepted either a bare day or a full RFC3339 timestamp, and a
malformed bound was ignored rather than refused — so a typo silently returned the whole
history instead of the window that was asked for.

The two modes answered the same question through different columns: the day mode filters
on the day a row is filed under, the timestamp mode filtered on the instant. Those agree
until a user changes timezone, which is exactly when a range query matters. No in-tree
client ever sent the timestamp form.

A third-party caller sending `from=2026-04-25T12:00:00Z` gets a `400` and should send
`from=2026-04-25`. Ignoring a bad bound was itself a bug — answering a narrow question
with the entire history reads as data loss in reverse — so the rejection is deliberate.
