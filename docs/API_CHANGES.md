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

## `GET /api/v1/admin/seed-status` — gains sync status (additive)

`count` is unchanged. The response now also carries `syncing` (a catalog pass is running),
`last_synced_at` (when the last clean pass ended), `last_attempt_at` (when the last pass
started), `next_attempt_at` (when the scheduled pass runs next, null while one runs),
`last_failed`, and `last_failure` (`"unreachable"` for an open-exercise-db outage,
`"other"` for anything else, null when the last pass was clean). Times are RFC3339 UTC and
may carry fractional seconds; unknown ones are null. The values live in memory, so they are
null after a restart until the boot pass finishes. Callers that read only `count` see no
change.

## `POST /api/v1/admin/reset-exercises` removed; `POST /api/v1/admin/sync-exercises` imports the whole catalog

`reset-exercises` no longer exists and answers 404, so a caller using it to drop unreferenced
rows has nothing to call: the server now keeps the whole catalog. A background pass at boot
and every 24h, retried with backoff on failure, imports every open-exercise-db exercise in
English, then translations for every held exercise in each catalog language.

`sync-exercises` runs that same pass on demand. It now fills an empty install, `refreshed`
is the number of exercises the English pass recorded, and it covers every language, so it
takes longer, and answers 409 `EXERCISE_SYNC_RUNNING` if a pass (this call or the daily one) is already running. A pass that fails partway keeps what it wrote and answers 503
`EXERCISE_CATALOG_UNREACHABLE` (upstream) or a database error code. `GET
/admin/seed-status` `count` is the whole catalog once a pass has completed.

## Every error response — gains a stable `code` beside `error`

Additive: `error` is byte-identical to before and still authoritative for any caller that
ignores `code`. Every error body is now `{"error": "...", "code": "UPPER_SNAKE"}`, with an
optional `params` object when the sentence has variables. The first-party clients key their
own (localized) wording on `code` and fall back to `error`.

Codes (72). Every error has its own code with a fixed status; there is no generic
`BAD_REQUEST`, `NOT_FOUND` or `SERVICE_UNAVAILABLE`.

- Sign-in and session: `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `REGISTRATION_CLOSED`,
  `PASSWORD_TOO_LONG`, `PASSWORD_UNCHANGED`, `WRONG_CURRENT_PASSWORD`, `ACCOUNT_NOT_FOUND`,
  `PASSWORD_CHANGED_ELSEWHERE`, `PASSWORD_CHANGED_SIGN_IN_AGAIN`,
  `EMAIL_CHANGED_SIGN_IN_AGAIN`, `SIGN_IN_REQUIRED`, `SESSION_INVALID`, `SESSION_EXPIRED`,
  `WRONG_TOKEN_TYPE`.
- Server: `INTERNAL_ERROR`, `DATABASE_BUSY`, `RATE_LIMITED`.
- Validation (`422`, and the violation codes inside it): `VALIDATION_FAILED`, `REQUIRED`,
  `INVALID_EMAIL`, `TOO_SHORT`, `TOO_LONG`, `TOO_MANY_ITEMS`, `BELOW_MINIMUM`,
  `NOT_ABOVE_MINIMUM`, `ABOVE_MAXIMUM`, `NOT_AN_OPTION`, `TOO_MANY_WORKOUT_SETS`,
  `TOO_MANY_PROGRAM_ROWS`, `INVALID_FIELD`.
- Request body (`400`): `INVALID_FIELDS`, `NOT_A_NUMBER`, `NOT_TEXT`, `NOT_TRUE_OR_FALSE`,
  `NOT_A_LIST`, `NOT_AN_OBJECT`, `BODY_WRONG_TYPE`, `BODY_NOT_JSON`, `BODY_EMPTY`,
  `BODY_UNREADABLE`.
- Resources: `INVALID_ID`, `INVALID_EXERCISE_ID`, `INVALID_PROGRAM_ID`, `INVALID_WORKOUT_ID`
  (`400`); `ENTRY_NOT_FOUND`, `SAVED_FOOD_NOT_FOUND`, `EXERCISE_NOT_FOUND`,
  `PROGRAM_NOT_FOUND`, `WORKOUT_NOT_FOUND` (`404`); `UNKNOWN_EXERCISES`, `NO_EXERCISE_CATALOG`
  (`400`); `EXERCISE_CATALOG_UNREACHABLE` (`503`, with `Retry-After: 2`); `EXERCISE_SYNC_RUNNING` (`409`).
- Dates: `INVALID_DATE`, `INVALID_LOGGED_ON`, `INVALID_FROM_DATE`, `INVALID_TO_DATE` (`400`).
- Food: `FOOD_NAME_TOO_LONG`, `FOOD_BRAND_TOO_LONG`, `SERVING_SIZE_TOO_LONG`,
  `BARCODE_TOO_LONG`, `IMAGE_URL_TOO_LONG`, `SEARCH_TERM_REQUIRED`, `INVALID_BARCODE` (`400`);
  `PRODUCT_NOT_FOUND` (`404`); `FOOD_DATABASE_TIMEOUT`, `FOOD_DATABASE_UNREACHABLE`,
  `FOOD_SEARCH_UNAVAILABLE`, `BARCODE_LOOKUP_UNAVAILABLE` (`503`, with `Retry-After: 2`).
- Settings: `DISPLAY_NAME_CONTROL_CHARS`, `TIMEZONE_EMPTY`, `UNKNOWN_TIMEZONE` (`400`).

Parameters are JSON values: the length-limit codes carry `params.max` as a number,
`UNKNOWN_TIMEZONE` carries `params.timezone`, and the request-body codes (`NOT_A_NUMBER`,
`NOT_TEXT`, `NOT_TRUE_OR_FALSE`, `NOT_A_LIST`, `NOT_AN_OBJECT`) carry `params.field`, the
dotted JSON path of the field (`exercises.sets.weight`).

A `422` carries `params.violations`, one `{code, params}` per failed rule, with raw JSON
field names and limits as JSON numbers:

```json
{
  "error": "Email must be a valid email address. Password must be at least 8 characters in length.",
  "code": "VALIDATION_FAILED",
  "params": {
    "violations": [
      { "code": "INVALID_EMAIL", "params": { "field": "email" } },
      { "code": "TOO_SHORT", "params": { "field": "password", "min": 8 } }
    ]
  }
}
```

`PUT /api/v1/settings` and `PUT /api/v1/active-session` reject a field that breaks a rule
with `400` `INVALID_FIELDS`, the `400` twin of `VALIDATION_FAILED`: the same sentence and the
same `params.violations`, with the status those endpoints always had. Their body was
previously `BAD_REQUEST`, which no release shipped.

New codes may appear in later releases: treat an unknown `code` as "show `error`".

## `GET /api/v1/food/search`, `GET /api/v1/food/barcode/:code` — optional `locale` names the product in the reader's language

Both accept `?locale=<tag>` (`es`, `pt-BR`; only the primary language is used). Open Food Facts
holds a name per language, and the server now asks for the reader's, then English, then the
product's main name. A missing or malformed `locale` means `en`. The response shape is unchanged,
but a caller that never sends `locale` can see a different name: English is now preferred over the
product's main-language name, so a product whose `product_name` is Thai and whose English name is
"Homogenized Milk" is now named the latter.

Saving a favourite still matches on name and brand on the server, so a product saved without a
`barcode` from a Spanish and an English search is two favourites. The shared client now sends the
`barcode` when starring and matches on it first, which keeps barcoded products to one.

## `POST /api/v1/auth/register` — an address differing only in letter case is a duplicate

An address that differs from an existing account only in letter case (`Carter@example.com`
beside `carter@example.com`) now answers `409` `That email is already registered.`. It used
to answer `201` and create a second account.

Only ASCII letters fold. Stored spellings are never rewritten.

## `POST /api/v1/food`, `PUT /api/v1/food/:id` — `servings` is capped at 100

Anything above 100 is rejected with `422`. There was no ceiling before.

A single diary entry with 500 servings is a fat-fingered amount, not a meal, and it
dominates every total and chart it appears in for the rest of that day. `servings` is the
right thing to bound rather than the gram amount the client collects, because the
multiplier is what the macros are scaled by.

A caller sending `{"name":"Oats","meal":"breakfast","servings":500}` got a `201` and a
stored row; it now gets a `422`. Bulk importers writing large multipliers are the
realistic casualty — divide into separate entries, or scale the per-serving macros up and
the count down.

## `POST /api/v1/food`, `PUT /api/v1/food/:id`, `POST /api/v1/food/saved` — `name` and `brand` are trimmed before validation

Two consequences, one from each side of the trim.

A whitespace-only name is now refused. `{"name":"   ","meal":"breakfast"}` collapses to
`""`, which trips the `required` rule that was always there, so it answers `422` where it
used to answer `201` and store a row that rendered as nothing.

A name with surrounding whitespace now round-trips differently: `{"name":"  Oats  ",
"brand":" Quaker "}` returns `"Oats"` and `"Quaker"` in the response, not the string that
was sent. A caller matching stored names against its own records by exact string will
mismatch on anything it sent padded.

This is what makes one food one favourite — `saved_foods` carries
`UNIQUE(user_id, name, brand)`, and `"Oats"` and `"Oats "` are two rows to an index and
one food to a person.

## `POST /api/v1/food/saved` — a repeat star answers `200` with the existing row

Starring a food that is already starred returns `200`, not `201`, and the body is the row
that already existed rather than the one the request described.

So `POST {"name":"Oats","brand":"Quaker","calories":400}` after an earlier save with
`"calories":380` answers `200` carrying `calories: 380` and the first row's `id`. The
request's macros are discarded. That reads as a write that did not write, and it is the
one sharp edge in this change: there is no edit path on saved foods, so correcting a
favourite's macros means deleting it and saving it again.

A client branching on `201` to mean success stops seeing it. Treat `200` and `201` alike
and read the `id` out of the body.

Two more things follow from the unique index this added. Starring is now idempotent rather
than duplicating, which is the point. And the boot migration that made the index possible
**deletes duplicate rows**, keeping the lowest `id` in each `(user_id, name, brand)` group
— so a caller holding an id that lost that dedupe gets a `404` from
`DELETE /api/v1/food/saved/:id`. Duplicates could only arise from starring the same food
twice, so at most they differed in macros from two search hits for one product.

## `GET /api/v1/exercises` — taxonomy filters and values are slugs

`equipment`, `category` and `muscle_group` are hyphenated and lower-case now, in the
filter and in the response, and a boot migration rewrites the stored values in place.

The old values match nothing. `?equipment=body only` returned hundreds of rows and now
returns `[]` — a `200` with an empty list, not a `400`, so a caller gets silence rather
than an error. The full set that moved:

| was | is |
|---|---|
| `equipment=body only` | `body-only` |
| `equipment=e-z curl bar` | `e-z-curl-bar` |
| `equipment=medicine ball`, `exercise ball`, `foam roll` | `medicine-ball`, `exercise-ball`, `foam-roll` |
| `equipment=` (empty) | `none` |
| `category=olympic weightlifting` | `olympic-weightlifting` |
| `muscle_group=lower back`, `middle back` | `lower-back`, `middle-back` |

The strings inside `secondary_muscles` read as slugs too. One vocabulary, in the query and
in the payload, so a value out of a response can go straight back into a filter.

## `GET /api/v1/exercises`, `GET /api/v1/exercises/:id` — the catalog is served live from open-exercise-db

The 800-row copy of free-exercise-db that used to be seeded into the database on first
boot is gone. Exercises are now queried from an open-exercise-db instance and cached
locally as they are read.

For a third-party caller this is a different dataset behind the same two routes: different
names, different ids, different `description`, and `image_url` rebased onto the upstream
instance. Three specifics worth planning for:

- A fresh install starts with an empty table and fills as searches run, instead of
  answering with the whole library after a background seed.
- Rows are refreshed on read. `GET /api/v1/exercises/:id` for an id stored at beta.6 can
  return a different `description` and `image_url` under the same id, because
  materialising an upstream row upserts over the cached one.
- Results are no longer `ORDER BY name` when they come from upstream — they arrive in the
  order the catalog returned them. A caller that relied on alphabetical ordering must sort
  its own, and note the ordering differs depending on whether the upstream was reachable.

`exercise_id` foreign keys are unaffected: nothing deletes a row that workout or program
data references.

## `POST /api/v1/admin/sync-exercises` — `{"synced","total"}` became `{"refreshed"}`, and it no longer imports

Response fields `synced` and `total` are gone, replaced by `refreshed` — the number of
cached rows that picked up an upstream edit.

It is not a re-import any more. It re-reads rows this instance already holds; it does not
populate an empty one. A caller using this to fill a fresh install gets `{"refreshed":0}`
and an instance that is still empty — search populates the cache now, so there is nothing
to call. New failure mode: `400` with "This server has no exercise catalog configured."
when no upstream is set.
When the upstream is configured but cannot be reached, or answers with an error, it answers
`503` `EXERCISE_CATALOG_UNREACHABLE` "Couldn't reach the exercise catalog."; it used to
answer `400` "The request couldn't be read."

## `POST /api/v1/admin/reset-exercises` — `{"reset","message"}` became `{"cleared"}`, and it no longer re-seeds

Response fields `reset` and `message` are gone, replaced by `cleared`, a count.

The behaviour inverted. It used to wipe the `exercises` table and re-seed in the
background; it now deletes only cached rows that nothing references, and re-seeds nothing.
A caller using it as "rebuild my exercise library" gets a partly-emptied cache and no
rebuild. That is the safe direction — the old version wiped rows that workout history
pointed at — but it is not the same operation.

## `GET /api/v1/admin/seed-status` — `in_progress` removed

The body is `{"count": N}`. There is no `in_progress` any more, because there is no
background seed to be in the middle of.

A caller polling `data.in_progress` to wait for a seed to finish now reads `undefined`
forever and never exits its loop. `count` survives the rename but answers a different
question: how many catalog rows this instance has cached, not how large the library is.

## `POST /api/v1/auth/refresh` — a structurally valid refresh token can be refused

Refresh was stateless: a token with a good signature and `type: "refresh"` minted a new
pair. It is now checked against the account's token version, so two requests that returned
`200` return `401`:

- A refresh token for an account deleted since it was issued. It used to keep minting
  access tokens for the remainder of its 30 days.
- Any refresh token issued before that account's password changed, whether through
  `PUT /api/v1/me/password` or the `reset-password` CLI. Changing a password is now
  supposed to end other sessions, and that is the mechanism.

Tokens issued before this release survive the upgrade itself: they decode with no version
claim, which is normalised to match the column default. This is a deliberate security fix,
but it is a behaviour change a caller can observe, and a client holding a long-lived
refresh token must handle `401` by signing in again rather than retrying.

---

## Already shipped, unannounced

### `GET /api/v1/weight` — `from` / `to` accept a calendar day only

**Shipped in `v0.1.0-beta.6`, whose notes do not mention it.** It is kept here rather than
deleted because the file's rule is to delete an entry once a release's notes have carried
it, and nothing has. Fold it into the next release's notes as a late correction, then
delete it; do not present it as new.

Both bounds must be `YYYY-MM-DD`, and anything else is rejected with `400`.

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

---

## Not breaking, but visible

Not entries — nothing to fix on a caller's side — but worth a line in the notes because
somebody will see the change.

- **A revoked access token now answers `401` on the next request.** The auth middleware
  checks the token's session version against the account on every request, so a deleted
  account, or a session ended by a password or email change, is rejected on its next request
  instead of lingering until the token expires (an hour by default; reads used to come back empty and writes
  failed with a `500`). Clients already read a `401` as "try a refresh", and the refresh
  fails the same check, so they sign out. A caller holding a long-lived access token for a
  deleted or revoked account will now see the `401`.
- **Sign-in matches the address case-insensitively**, returning the spelling stored at
  registration. An install that already holds case-variant accounts keeps both: each still
  signs in with its exact spelling, and the boot log names them;
  `lyftr-api delete-account <exact address>` removes the one you do not want.
- **Every error message was rewritten into a sentence.** No status code, route, field name
  or field type moved. A caller regex-matching error *strings* will break, but error
  wording is not part of the contract and never was.
- **`serving_size` on food search and barcode results** reads `"100 g"` or `"100 ml"`
  instead of `"per 100g"`. A display label; the macro figures behind it are unchanged.
- **`DEMO_MODE` no longer defaults on in development.** A deployment default rather than an
  HTTP contract, and the published config docs already said `false`, but a dev instance
  that relied on signing in as `demo@lyftr.local` must now set `DEMO_MODE=true`.
- **`locale` on exercise text.** `GET /exercises`, `GET /exercises/:id`, the workout reads
  and writes and the program reads and writes accept an optional `locale` query parameter
  (a BCP-47 tag such as `es` or `es-MX`). Exercise `name` and `description` come back in
  that locale where this instance holds a translation, falling back field by field to the
  base language and then to English. With no `locale`, or a malformed one, responses are
  unchanged: English, status `200`. Local search also matches translated names in that
  locale.
  At startup and every 24 hours after, the instance re-reads every exercise it already holds
  in every language the catalog lists at oedb's `/api/v1/meta/locales`, English included:
  English through one export request, every other language with one request per 100
  exercises. That is how workout and program history follow a language switch and how
  upstream corrections arrive. No request triggers this pass or waits for it, and it adds no
  exercises the instance did not already hold. If the catalog cannot be reached, the pass is
  retried at the next interval and responses are served from what is already held. Nothing
  changes for an instance with no catalog configured.
