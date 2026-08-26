// Dynamic Expo config. Everything static still lives in app.json; this file exists for
// one job: the app's version is whatever release is being built, and nothing else.
//
// The tag is the version (#77 unified the namespace across backend/web/mobile), so a
// version committed to app.json could only ever be a second copy of that fact — one
// that drifts the first time someone forgets to bump it, and that CI would have to
// overwrite on every build to be safe. Reading it from the environment removes the
// copy instead of policing it.
//
// LYFTR_VERSION is set by .github/workflows/eas-build.yml from the tag being built.
// Unset (local dev, a dry run, `npx expo start`) falls back to app.json's placeholder,
// which is deliberately not a real release number.
// Which CPU architectures to compile, per build profile. This has to be dynamic because
// the right answer differs by profile, and getting it wrong costs either download size or
// devices:
//
//   production  omit entirely. It builds an AAB, and Play generates per-device APKs from
//               it — "only the code and resources that are needed for a specific device
//               are downloaded". Restricting ABIs here buys nothing and only removes
//               devices you could otherwise serve. Play's 64-bit rule is ADDITIVE: every
//               32-bit ABI you ship needs a 64-bit counterpart, not the reverse, so
//               armeabi-v7a is still allowed and still has users.
//
//   preview     the one that matters. It builds a single universal APK, which is what
//               gets attached to a GitHub Release and side-loaded by testers, so every
//               ABI in it is in everyone's download. armeabi-v7a is kept for old phones;
//               x86_64 is kept because the same artifact has to install on the Android
//               emulator we test on. x86 is dropped — 32-bit emulator-only, and it was
//               47% of the download.
//
//   development the dev client only ever runs on a maintainer's device or emulator.
//
// Default when unset is all four: armeabi-v7a, arm64-v8a, x86, x86_64.
const BUILD_ARCHS = {
  development: ['arm64-v8a', 'x86_64'],
  preview: ['armeabi-v7a', 'arm64-v8a', 'x86_64'],
}

module.exports = ({ config }) => {
  const archs = BUILD_ARCHS[process.env.EAS_BUILD_PROFILE]
  return {
    ...config,
    version: process.env.LYFTR_VERSION || config.version,
    plugins: archs
      ? [...(config.plugins ?? []), ['expo-build-properties', { android: { buildArchs: archs } }]]
      : config.plugins,
  }
}
