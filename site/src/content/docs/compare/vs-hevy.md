---
title: Lyftr vs Hevy
description: An honest comparison of Lyftr, the self-hosted workout tracker, against Hevy — what each does well, what Hevy's free tier limits, and who should pick which.
---

Hevy is a genuinely good app. It is polished, it has a large social feed, and its free tier is
usable for a long time. If you want a workout tracker that works out of the box on a phone with
no server, Hevy is a reasonable choice and this page will not pretend otherwise.

Lyftr exists for a different person: someone who wants the training log to live on hardware they
control, with no subscription and no feature that can be moved behind a paywall later.

## At a glance

| | Lyftr | Hevy |
|---|---|---|
| Cost | Free, MIT licensed | Free tier + paid Pro |
| Where data lives | One SQLite file on your server | Hevy's cloud |
| Routines / programs | Unlimited | Free tier is capped at a handful |
| History retention | Everything, forever | Free tier caps graph history |
| Personal records | Yes | Yes |
| Auto-progression suggestions | Yes | Yes |
| Runs without internet | Yes, on your LAN | No |
| Social feed | No | Yes |
| iOS app | Not yet — web works on iOS Safari | Yes |
| Setup effort | One Docker command | Install from the App Store |

## Where Hevy is better

Being straight about this matters more than winning the comparison.

- **Zero setup.** Hevy is an app install. Lyftr needs a machine and one Docker command. That is a
  real barrier and it disqualifies Lyftr for a lot of people.
- **A native iOS app.** Lyftr ships an Android APK and a mobile-first web app. iOS users get the
  web app, which is good but is not the same thing.
- **The social side.** Hevy's feed, following and shared routines have no equivalent in Lyftr and
  none is planned.
- **Maturity.** Hevy has been refined over years by a full-time team.

## Where Lyftr is better

- **Nothing is metered.** Unlimited routines, unlimited history, every feature on day one. There is
  no Pro tier because there is no company that needs one. That includes the two things lifters
  most often upgrade for: **personal-record detection** and **auto-progression suggestions**,
  which stage the next session's target weight from your own history.
- **The data is a file you own.** Your entire training history is one SQLite file. Back it up by
  copying it. Move it to another server by copying it. Read it with any SQLite browser. No export
  request, no waiting, no format you cannot open in ten years.
- **It works with the internet down.** A Lyftr instance on your home network keeps logging when
  your connection does not.
- **Nothing is watching.** No analytics, no ad SDK, no third-party calls from the app.

## What Lyftr does not have yet

Listed plainly so nobody installs it expecting these:

- **No in-app export button.** The answer to portability is that you already have the whole
  database file — but there is no "download my data as CSV" screen. See the
  [backups guide](/backups/).
- **No custom exercises.** The library is 800+ movements; you cannot yet add your own.
- **No iOS app.** Android APK and web only.
- **No social feed**, and none is planned.

## Who should pick which

**Pick Hevy** if you want to start logging in the next two minutes, you want the social feed, or
you are on iOS and want a native app.

**Pick Lyftr** if you already run a home server, NAS or VPS, you object to renting access to your
own training history, or you want a log that will still open in a decade.

---

*Hevy's pricing and free-tier limits change. Figures above describe the shape of the limits as
verified in August 2026 — check [hevyapp.com](https://www.hevyapp.com/) for current terms before
deciding. Reported free-tier caps and Pro pricing at that time were summarised by
[SensAI](https://www.sensai.fit/blog/hevy-review-2026) and
[RepReturn](https://repreturn.com/hevy-pro-vs-free/), which differed slightly on regional pricing —
which is exactly why this page describes the limits rather than quoting a single number.*
