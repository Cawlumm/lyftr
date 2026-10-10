# Locale catalogs

One JSON catalog per language, shared by web and mobile. `en.json` is the source and the
fallback; every other file must carry exactly its keys (enforced by `../catalog.test.ts`).
The languages the app ships are listed here.

| Code | Language | Source |
|------|----------|--------|
| `en` | English  | written by hand |
| `es` | Español  | `en.json` |

`../catalog.test.ts` fails when a supported language has no row here, or a row's name differs
from `LANGUAGE_NAMES`.

How to add a language, and the key-naming rules: see the "Translations" section of
[CONTRIBUTING.md](../../../../../CONTRIBUTING.md).
