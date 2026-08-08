# Releasing

Backend, web, and mobile ship under one tag now — there's no separate mobile
release train. Releases are cut manually (low cadence, doesn't need automation).

## Tag scheme

`vX.Y.Z` (or `vX.Y.Z-beta.N` while in beta). One tag covers every platform in
that release — don't create a `mobile-v*` tag for a mobile-only change; tag it
`v*` like everything else.

## Cutting a release

```bash
git tag v0.1.0-beta.4
git push origin v0.1.0-beta.4
```

Pushing the tag triggers two workflows:

- **`ci.yml`** — builds and pushes the backend/frontend Docker images tagged
  with this version (`git describe --tags`).
- **`eas-build.yml`** — builds the Android APK on the runner (`eas build --local`,
  so there's no hosted-EAS queue to wait behind) and attaches it to the GitHub
  Release for this tag. Budget ~30-45 min; it's a full Gradle build.

  To rehearse that build without publishing anything — after touching the mobile
  native config, say — run the workflow manually with **dry_run_release** checked.
  It builds the same APK and leaves it as a workflow artifact, touching no Release.

## Mobile version numbers

The tag is the version, on every platform. **There is nothing to bump** — the release
job passes the tag to the build as `LYFTR_VERSION`, and `mobile/app.config.js` reads
it, so the tag is the only place a release version exists.

`expo.version` in `mobile/app.json` is a dev placeholder (`0.0.0-dev`) used when
`LYFTR_VERSION` isn't set — local `expo start`, dev builds, dry runs. Leave it alone;
it is never what ships.

`versionCode` is a separate monotonic counter tracked on EAS
(`appVersionSource: remote`), bumped per build and never reset — the same split
Immich uses (`3.1.0+3057`). Android upgrades are gated on this number, not on the
version name. Don't hand-edit it to bump a release.

It's no longer in `app.json` at all. The field was briefly kept as a seed — EAS
initializes the remote counter from the app config the first time it builds under
`remote`, and this project had none — set to `4`, the highest already published. That
initialization has happened, so the field was inert and is now gone. Note that dry
runs share the counter, so release numbers will have gaps.

To inspect or correct it:

```bash
cd mobile
npx eas-cli build:version:get -p android
npx eas-cli build:version:set -p android   # only to repair drift
```

Note the version *name* may move backwards if the unified tag is below the mobile
app's old independent numbering — that's cosmetic. What must never go backwards is
`versionCode`, or Android will refuse the upgrade.

Neither workflow deploys the demo off a tag — that already happens on every
push to `main` (see `deploy-demo` in `ci.yml`). Tags exist purely to version
the images and cut the GitHub Release.

## Writing release notes

Once the tag is pushed, write (or edit) the GitHub Release for it:

```bash
gh release create v0.1.0-beta.4 --target main --prerelease --notes-file notes.md
# or, if eas-build.yml's job already created the release (APK build can finish first):
gh release edit v0.1.0-beta.4 --notes-file notes.md
```

Template — no emoji, keep it simple:

```markdown
One-line summary of the release.

## What's new

**Feature name** (#123)
One or two sentences on what it does.

## Fixes & improvements

- Fix or improvement, one line (#124)

## Contributors

@username (#123)
```

Credit goes next to the PR/issue it belongs to, not in a separate paragraph —
include PR authors, reviewers, and whoever originally reported an issue the PR
closes.

The `eas-build.yml` job appends its own "Android (side-load)" download blurb
to whatever body already exists (`append_body: true`), so it's safe to write
the notes before or after the APK finishes building — neither overwrites the
other.

## Historical note

Releases before this change used a separate `mobile-v*` tag namespace for
mobile (`mobile-v0.1.0`, `mobile-v0.2.0`). Those tags and releases are left as
they are — only new releases use the unified `v*` scheme.
