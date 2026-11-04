# Google Play

What the Play Console asks for, answered from the code, plus the listing draft and the
owner's steps. Package `local.lyftr.app`. Checked against the linked Google pages on
4 November 2026; recheck anything marked *unverified* when you fill the form.

## Build and upload

- `apps/app/eas.json` → `build.production`: `app-bundle`, `autoIncrement`, store
  distribution; `cli.appVersionSource: remote`, so EAS owns `versionCode` (shared with
  preview APKs, so it only ever goes up). `submit.production.android`: track `internal`,
  `releaseStatus: draft`.
- Target API: Expo SDK 58 builds with compileSdk 37 / **targetSdk 36**
  ([Expo SDK table](https://docs.expo.dev/versions/latest/)), which meets Play's rule for
  new apps from 31 Aug 2026
  ([target API requirements](https://developer.android.com/google/play/requirements/target-sdk)).
  Nothing in the repo overrides it.
- `.github/workflows/play-submit.yml` (manual only): builds the AAB on the runner with the
  EAS keystore, checks it, then `eas submit` to internal as a draft. Needs `EXPO_TOKEN` and
  a Play service-account key uploaded to EAS (never committed; the workflow header has the
  steps). Releasing a draft to testers is done in Play Console.
- Do not use `eas-build.yml`'s manual `production` option for Play: it builds on hosted
  EAS, where `LYFTR_VERSION` from the runner never arrives
  ([Expo: config mismatch](https://github.com/expo/fyi/blob/main/eas-config-mismatch.md)),
  so the bundle would be named `0.0.0-dev` (`app.config.js` falls back to `app.json`).
- Signing: the upload key is the EAS-held keystore. With Play App Signing, Play re-signs
  for users, so Play installs and GitHub-release APKs have **different signatures** and
  cannot update one another. Tell users to pick one source.

## Permissions (final manifest)

`INTERNET`, `VIBRATE` (haptics), `CAMERA` (barcode scanner, requested when the scanner
opens, with a "denied" state that explains how to re-enable). `app.json`
`android.blockedPermissions` strips `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`
(template and `expo-file-system` defaults the app never uses) and `RECORD_AUDIO`.
AndroidX and Play-services libraries can still merge normal permissions (for example
`ACCESS_NETWORK_STATE`): check the list Play shows under App bundle explorer after the
first upload.

## Data safety

Google counts data as *collected* when it leaves the device, including to a server that
is not yours, and counts SDK traffic too
([Data safety help](https://support.google.com/googleplay/android-developer/answer/10787469)).
Lyftr sends user data only to the server the user enters, which the project does not run
(the hourly-wiped demo aside), so a narrow reading would declare nothing; peers such as
Home Assistant and Immich declare only device IDs. The answers below take the safer
reading and declare what reaches *any* server. Not shared: every transfer is to the
user's own server or user-initiated.

| Data type | Collected | Shared | Optional | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info → Email address | Yes | No | No | Account management, App functionality | sign-in identity |
| Personal info → Name | Yes | No | Yes | App functionality | display name |
| Personal info → User IDs | Yes | No | No | Account management | server account id |
| Health and fitness → Fitness info | Yes | No | No | App functionality | workouts, programs |
| Health and fitness → Health info | Yes | No | Yes | App functionality | bodyweight, food diary |
| App activity → Other user-generated content | Yes | No | Yes | App functionality | notes, saved foods |
| App activity → In-app search history | Yes | No | Yes | App functionality | food searches go to the server, which asks Open Food Facts |
| App info and performance → Diagnostics | Yes | No | Yes | Analytics | Google ML Kit, only when the barcode scanner runs ([ML Kit disclosure](https://developers.google.com/ml-kit/android-data-disclosure)) |
| Device or other IDs | Yes | No | Yes | Analytics | ML Kit per-installation id, same condition |
| Photos and videos | No | | | | camera frames are processed on device only |
| Location, Contacts, Financial, Messages, Audio, Files, Calendar, Web browsing | No | | | | |

- **Encrypted in transit:** owner decision, see `owner-questions` / the PR. ML Kit uses
  HTTPS; app↔server traffic is HTTPS only when the user's server is `https://`, and the
  app allows `http://` for LAN servers. The strictly true answer is **No**.
- **Account deletion:** Yes. In app: Settings → Delete account (`DELETE /api/v1/me`,
  cascades every user table). Web link:
  `https://lyftr-app.pages.dev/privacy/#delete-your-account-and-data` (needs the privacy
  page to be live on the production site first).
- **Privacy policy URL:** `https://lyftr-app.pages.dev/privacy/`.
- Keep "no analytics" out of the listing: the ML Kit rows above are declared with purpose
  Analytics, and a listing that says otherwise reads as misleading next to them.

## Other App content forms

- **Health apps declaration**
  ([help](https://support.google.com/googleplay/android-developer/answer/14738291)):
  Health and fitness → *Activity and Fitness*, *Nutrition and Weight Management*. Nothing
  under Medical, not a medical device, no health research.
- **Content rating (IARC):** a utility/fitness app. No violence, sexual content, profanity,
  drugs or gambling; users cannot talk to or share content with other users; no location
  sharing; no purchases. Expect the lowest rating in every region.
- **Target audience:** 18 and over (keeps it out of the Families policy; the privacy
  policy says it is not directed at children). Not designed for children.
- **Ads:** No ads.
- **News, government, financial features, COVID:** No.
- **Account type:** Google requires an Organization account for "Health apps, such as
  Medical apps and Human Subjects Research apps"
  ([account types](https://support.google.com/googleplay/android-developer/answer/10788890)).
  Whether fitness/nutrition-only apps fall under that is *unverified*; check before paying.

## App access (reviewer instructions)

All functionality needs a server and a sign-in. Paste into App access → "All or some
functionality is restricted":

> Lyftr connects to a server the user runs. Use our public demo server.
> 1. Open the app. On the sign-in screen tap "Server settings", enter `https://lyftr-demo.fly.dev`, tap "Test & Save".
> 2. Sign in with email `demo@lyftr.local`, password `password123`.
> The demo account has 8 weeks of sample workouts, food and weight data. The demo server
> resets to that sample data every hour, so anything you add disappears at the top of the
> hour. To test account deletion (Settings → Delete account), please create a new account
> with Sign up first, so the shared demo account stays available.

On Android the login screen's "Try the demo" button opens the demo website in the browser
rather than signing in, so the steps above matter.

Pre-launch report: the automated crawler starts with no server address, so unless Play's
pre-launch settings can supply one it will mostly see the sign-in screen. That limits the
report, it does not fail review.

Demo server: `fly.toml` already has `auto_stop_machines = false`,
`min_machines_running = 1`, so it does not sleep. Before submitting, confirm it answers
(`curl https://lyftr-demo.fly.dev/api/v1/info` shows `"demo_mode":true`) and keep it
running for the whole review and closed test.

## Store listing draft

- **App name** (≤30): `Lyftr: Self-Hosted Fitness` (26)
- **Short description** (≤80): `Log workouts, food and weight on a server you run yourself. No ads, no tracking.` (80)
- **Category:** Health & Fitness. **Tags:** pick from Play's list (fitness tracking,
  workout tracker, calorie counter if offered; *unverified* which tags exist).
- **Contact:** website `https://lyftr-app.pages.dev`; email is the owner's choice (Play
  requires one).
- **Full description** (≤4000):

> Lyftr is an open-source workout and nutrition tracker for people who want to keep their
> data on their own server.
>
> You need a Lyftr server: run it yourself with Docker on a home server, NAS or VPS (free,
> MIT-licensed, setup guide at lyftr-app.pages.dev), or try the public demo first.
>
> WORKOUTS
> • Log sets, reps and weight fast, with a rest timer between sets
> • Gym Mode: one exercise at a time, big buttons, screen stays on
> • Programs: build routines once and start the next day with one tap
> • Exercise library of 800+ exercises with images and the muscles they work
>
> NUTRITION AND WEIGHT
> • Food diary with calories and macros, searches Open Food Facts
> • Barcode scanner to log packaged food
> • Bodyweight log with trends
>
> PROGRESS
> • Dashboard with weekly sessions, volume trend and nutrition at a glance
> • Charts for macros and weight over 7, 30 and 90 days
>
> YOUR DATA, YOUR SERVER
> • Everything is stored on the server you connect to, not with us
> • No ads, no tracking, no subscription
> • Delete your account and everything in it from Settings at any time
> • Same account in the browser: your server also serves the web app
>
> HTTPS is recommended; plain HTTP works on a home network and the app marks it as not
> encrypted. English and Spanish.

  (Every bullet should be re-checked against the release being submitted.)
- **Release notes** (first release): `First Google Play release. Log workouts, programs, food and bodyweight on your own Lyftr server.`

## Assets (`apps/app/store/android/`)

| File | Google's spec ([graphics](https://support.google.com/googleplay/android-developer/answer/9866151)) | Ours |
|---|---|---|
| `icon-512.png` | 512×512, 32-bit PNG with alpha, ≤1024 KB | 512×512 RGBA from `assets/icon.png`, 17 KB |
| `feature-graphic.png` | 1024×500, JPEG or 24-bit PNG, no alpha | 1024×500 RGB PNG |
| `phone/*.jpg` | 2–8 per device type, JPEG or 24-bit PNG, 320–3840 px, long side ≤2× short; 9:16 at ≥1080×1920 recommended | seven 1080×1920 JPEGs, dark and light |

The phone screenshots are the Android app's own screens rendered from the web export of
the same code (demo data, 390 pt wide). Replace any that differ on a real device once the
internal-test build is installed. No tablet screenshots: optional.

## Owner steps, in order

1. Decide account type (above) and create the developer account; identity and device
   verification; accept agreements.
2. Publish the privacy page to production (merge the site branch), so the policy and
   deletion URLs resolve.
3. Create the app (`local.lyftr.app`, free, app not game), fill App content using this
   page, upload the listing text and assets.
4. Create a Google Cloud service account, grant it release access in Play Console, upload
   its JSON key to EAS; add `EXPO_TOKEN` if missing.
5. Run "Google Play (internal draft)" in Actions, or upload the AAB by hand; roll the draft
   out to internal testers; read the pre-launch report.
6. Closed test: 12+ testers opted in for 14 continuous days, then apply for production
   ([new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)).
7. Production release, staged rollout.
