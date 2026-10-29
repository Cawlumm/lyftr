# Dependency patches

Applied by `patch-package` from the root `postinstall`, so they land after every
`npm install` / `npm ci`, including the ones CI and EAS run before a build.

## expo-localization+58.0.5.patch

`expo-localization`'s Android config plugin finds where to insert
`resourceConfigurations` by matching `versionName "[\d.]+"`, which only allows digits and
dots. Our builds stamp the tag as the version (`0.1.0-beta.9`, or `0.0.0-dryrun.N` for the
release rehearsal), so prebuild fails with `Failed to match "/versionName "[\d.]+"/"`.

The patch loosens the pattern to `versionName "[^"]+"`. It touches only the config plugin,
which runs on the build machine; nothing from it ships in the app.

Introduced upstream by expo/expo#48092 (SDK 57). Delete this patch, and pin back to a
`~` range, once the `expo-localization` we run has the fix.
