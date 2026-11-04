---
title: Getting Started
description: What Lyftr is, how to try the live demo, and where to go next.
---

**Lyftr** is a self-hosted, open-source workout & nutrition tracker — a free, no-subscription
alternative to Hevy and Strong. Your data lives on **your** server: a single SQLite file, a small
Docker stack, no cloud account.

It is one app on every screen. Your instance serves it to any browser, with a sidebar layout on a
desktop and a tab bar on a phone, and the same app ships as an Android APK that talks to the same
server.

## Try the live demo

The fastest way to see Lyftr is the hosted demo — no install required.

- **URL:** [lyftr-demo.fly.dev](https://lyftr-demo.fly.dev)
- **Sign in:** use the one-tap demo button on the sign-in screen, or `demo@lyftr.local` /
  `password123`.

It's pre-loaded with a push/pull/legs program, 8 weeks of workouts, 90 days of weight logs and a
week of meals, so every page has data to explore. It's a shared instance that **resets every
hour**, so feel free to change anything — or register your own throwaway account.

Those credentials are for the hosted demo only. Your own install does **not** come with that
account — see [`DEMO_MODE`](../configuration/#the-demo-account) if you want the sample data
locally, and [`REGISTRATION`](../configuration/#locking-down-registration) to control who may sign
up on it.

## What's in it

- **Workouts** — an 800+ exercise library with photos and instructions, reusable programs, and
  set-by-set logging with a rest timer.
- **Gym Mode** — one exercise at a time with large controls: full screen on a phone, a focused
  dialog on a desktop. Choose it under **Settings → Workout**.
- **Progress** — personal bests and a weight-progression chart per exercise, a muscle diagram,
  and a dashboard with your volume trend, muscle balance and a 12-week consistency heatmap.
- **Nutrition** — calories and macros against your own targets, food search and barcode scanning
  through [Open Food Facts](https://world.openfoodfacts.org), and macro trends.
- **Weight** — a bodyweight log and trend chart, in lbs or kg.
- **Light and dark themes**, in **English and Spanish**.

## Get the app

- **Web** — served by your self-hosted instance (see [Self-Hosting](../self-hosting/)). Open it
  in any browser, desktop or phone.
- **Android** — download the latest signed APK from the
  [Releases](https://github.com/Cawlumm/lyftr/releases) page, install it, and point it at
  your server. Side-loaded builds don't auto-update — reinstall over the old one when a new
  release drops. See [Mobile App](../mobile/).
- **iOS** — planned, shipping via TestFlight / the App Store once the Apple Developer account is set up.

## Next steps

- **[Self-Hosting](../self-hosting/)** — get your own instance running in one Docker command.
- **[Configuration](../configuration/)** — environment variables and the self-hosting gotchas.
- **[HTTPS & Reverse Proxy](../https/)** — expose it publicly with automatic TLS.
- **[Mobile App](../mobile/)** — install the Android app and point it at your server.
- **[FAQ](../faq/)** — common questions.
