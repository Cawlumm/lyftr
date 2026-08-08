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
module.exports = ({ config }) => ({
  ...config,
  version: process.env.LYFTR_VERSION || config.version,
})
