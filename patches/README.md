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

Introduced upstream by expo/expo#48092 and first shipped in SDK 58 (58.0.0); SDK 54 and 57
do not have it. Fix proposed in expo/expo#52512. Delete this patch, and pin back to a
`~` range, once the `expo-localization` we run has the fix.

## react-native-body-highlighter+3.2.0.patch

The library marks its `<Svg>` and outline `<Path>`s `accessible={true}` and gives every body
region an `onPress`, even with no `onBodyPartPress`. react-native-svg's web build forwards both
onto DOM nodes: React DOM warns "Received `true` for a non-boolean attribute `accessible`" and
"Unknown event handler property `onStartShouldSetResponder`" on every page with a body map (dev
only; the production export hides it). It also overwrites any `onClick` with `onPress`, so a
web press cannot be wired through the library.

The patch drops `accessible`, attaches `onPress` only when `onBodyPartPress` is given, and never
on web: `components/workouts/BodyMapPicker` reads a web tap from the clicked `<path id>` itself.
`components/workouts/bodyHighlighterPatch.test.tsx` fails if the patch stops applying. Delete
both once upstream stops forwarding these props.
