# Locale catalogs

One JSON catalog per language, shared by web and mobile. `en.json` is the source and the
fallback; every other file must carry exactly its keys (enforced by `../catalog.test.ts`).
JSON cannot hold comments, so the status of each translation is recorded here.

| Code | Language | Status | Source |
|------|----------|--------|--------|
| `en` | English  | source | written by hand |
| `es` | Español  | **machine-translated** (model-generated, 2026-10), not reviewed by a native speaker; corrections welcome | `en.json` |

The word **machine-translated** in the Status column must agree with `MACHINE_TRANSLATED` in
`../index.ts`. `../catalog.test.ts` fails when a supported language has no row, a row's name
differs from `LANGUAGE_NAMES`, or the status disagrees. Change `MACHINE_TRANSLATED` first; the
README follows.

How to add a language, and the key-naming rules: see the "Translations" section of
[CONTRIBUTING.md](../../../../../CONTRIBUTING.md).
