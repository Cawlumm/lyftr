# Translating Lyftr

Lyftr's web UI is internationalised with [react-i18next](https://react.i18next.com/).
All UI strings live in **monolingual JSON** files under `web/src/locales/`, with
English (`en.json`) as the source language.

You do **not** need to be a developer to translate. The recommended path is
[Weblate](#translating-with-weblate-recommended), a web UI that opens the pull
request for you.

---

## How translations load

Every `web/src/locales/<code>.json` file is auto-discovered at build time
(`import.meta.glob` in `web/src/i18n.ts`). Adding a language is therefore just
**committing one JSON file** — no code change, no registration step. The new
language appears automatically in **Settings → Appearance**, labelled by its own
name (e.g. `Deutsch`, `Français`).

`<code>` is a [BCP-47](https://en.wikipedia.org/wiki/IETF_language_tag) code:
`de`, `fr`, `es`, `pt-BR`, `zh`, … Region-specific browser locales fall back to
the base language (`de-AT` → `de`), and anything untranslated falls back to
English.

---

## Translating with Weblate (recommended)

1. Open the Lyftr project on Weblate and pick (or **＋ Add**) your language.
2. Translate strings in the web editor. Weblate shows the English source beside
   each entry and flags anything that breaks a [placeholder](#keys-and-placeholders).
3. Your changes are committed to the translation file and pushed back to GitHub
   as a pull request automatically — no git knowledge required.

That's it. A maintainer reviews and merges the PR, and the language ships on the
next build.

---

## Translating manually (via a pull request)

For developers, or one-off contributions without a Weblate account:

1. Copy the source file to your language code:
   ```bash
   cp web/src/locales/en.json web/src/locales/de.json
   ```
2. Translate the **values** in `de.json`. Leave the keys and every
   `{{placeholder}}` exactly as-is (see below).
3. Build to confirm it loads and the language shows up in the switcher:
   ```bash
   cd web && npm run build
   ```
4. Commit and open a PR against `main` (branch name: `feature/i18n-<code>`).

No edit to `i18n.ts` or any other file is required — the JSON file is enough.

---

## Keys and placeholders

- **Never translate or rename keys.** Only translate the string on the right of
  the colon.
  ```jsonc
  // en.json                          // de.json
  "heading": "Welcome back"           "heading": "Willkommen zurück"
  ```
- **Keep `{{placeholders}}` verbatim.** They are filled in at runtime. Their
  position in the sentence may move, but the token must survive:
  ```jsonc
  "current": "Current: {{url}}"       "current": "Aktuell: {{url}}"
  "synced":  "Synced {{count}} exercises"   "synced": "{{count}} Übungen synchronisiert"
  ```
- **Plurals** use i18next's `_one` / `_other` suffixes on the same key, driven by
  `{{count}}`. Languages with more plural forms (e.g. Polish, Arabic) get extra
  suffixes — Weblate generates the right set for the target language
  automatically.
  ```jsonc
  "count_one":  "{{count}} exercise",
  "count_other": "{{count}} exercises"
  ```
- Keep punctuation/spacing that belongs to the sentence; adapt it to your
  language's norms (French, for instance, uses `:` differently).

---

## Maintainer: connecting Weblate

Configure one component in the Weblate project UI:

| Setting | Value |
|---|---|
| File format | **i18next JSON v4** |
| File mask | `web/src/locales/*.json` |
| Monolingual base language file | `web/src/locales/en.json` |
| Source language | English |
| New translations | Use the base file as template |

The `github` VCS backend ("GitHub pull request") makes Weblate push
translations back as pull requests instead of committing to `main` directly.
For that to work the instance needs GitHub credentials.

### Self-hosting the instance

Weblate runs as a Docker stack. Use the official compose — don't fork it:

```bash
git clone https://github.com/WeblateOrg/docker.git weblate-docker
cd weblate-docker
# edit ./environment — at minimum set:
#   WEBLATE_SITE_DOMAIN, WEBLATE_ADMIN_EMAIL, WEBLATE_ADMIN_PASSWORD
#   WEBLATE_SERVER_EMAIL, WEBLATE_DEFAULT_FROM_EMAIL
#   WEBLATE_GITHUB_USERNAME + WEBLATE_GITHUB_TOKEN   ← enables the PR backend
docker compose up -d
```

It must run on a **persistent host** with a real domain (not in CI / ephemeral
containers). See the [official self-hosting docs](https://docs.weblate.org/en/latest/admin/install/docker.html)
for the full env reference.

Once it's up, create the project + component without clicking through the UI:

```bash
WEBLATE_URL=https://weblate.example.com \
WEBLATE_TOKEN=<your admin API token> \
scripts/weblate-provision.sh
```

The script creates the project and component with the exact values from the
table above. If it rejects `file_format` or `vcs`, confirm the slugs against
your version (`GET <url>/api/file-formats/`) and pass overrides, e.g.
`FILE_FORMAT=… VCS=… scripts/weblate-provision.sh`.

### The `.weblate` CLI config

The repo-root `.weblate` file points the
[`wlc`](https://docs.weblate.org/en/latest/wlc.html) CLI at the server and
default component — update the `url` to your instance. **Never commit an API
token**; `wlc` reads it from `~/.config/weblate`.

---

## Testing a language locally

```bash
cd web && npm run dev
```

Open the app, go to **Settings → Appearance**, and switch the language. The
choice is saved to `localStorage` (`lyftr_lang`) and `<html lang>` updates so
screen readers and spellcheck follow along.
