---
title: Getting Started
description: What Lyftr is, how to try the live demo, and where to go next.
---

**Lyftr** is a self-hosted, open-source workout & nutrition tracker — a free, no-subscription
alternative to Hevy and Strong. Your data lives on **your** server: a single SQLite file, minimal
RAM, no external services required.

## Try the live demo

The fastest way to see Lyftr is the hosted demo — no install required.

- **URL:** [lyftr-demo.fly.dev](https://lyftr-demo.fly.dev)
- **Email:** `demo@lyftr.local`
- **Password:** `password123`

It's pre-loaded with 8 weeks of push/pull/legs workouts, 90 days of weight logs, and food logs so
every page has data to explore. It's a shared instance that **resets every hour**, so feel free to
change anything — or register your own throwaway account.

## Get the app

- **Android** — download the latest signed APK from the
  [Releases](https://github.com/Cawlumm/lyftr/releases?q=mobile-v) page, install it, and point it at
  your server. Side-loaded builds don't auto-update — reinstall over the old one when a new
  `mobile-v*` release drops.
- **Web** — served by your self-hosted instance (see [Self-Hosting](../self-hosting/)).
- **iOS** — planned, shipping via TestFlight / the App Store once the Apple Developer account is set up.

## Next steps

- **[Self-Hosting](../self-hosting/)** — get your own instance running in one Docker command.
- **[Configuration](../configuration/)** — environment variables and the self-hosting gotchas.
- **[HTTPS & Reverse Proxy](../https/)** — expose it publicly with automatic TLS.
- **[Mobile App](../mobile/)** — install the Android app and point it at your server.
- **[FAQ](../faq/)** — common questions.
