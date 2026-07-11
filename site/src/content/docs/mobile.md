---
title: Mobile App
description: Install the Lyftr Android app, point it at your self-hosted server, and track workouts from your phone.
---

Lyftr has a native mobile app so you can log workouts at the gym, straight from your phone —
talking to **your** server.

## Android

1. Download the latest signed APK from the
   [Releases](https://github.com/Cawlumm/lyftr/releases?q=mobile-v) page.
2. Open the `.apk` on your phone and allow **"install from unknown sources"** if prompted.
3. Launch Lyftr and enter your server URL when asked.

:::note[Side-loaded builds don't auto-update]
When a new `mobile-v*` release drops, download and install it over the old one. Store builds with
auto-update are on the roadmap.
:::

## Pointing the app at your server

The app connects to your self-hosted instance, so it needs a URL it can actually reach:

- **`localhost` won't work** from a phone — it refers to the phone itself.
- On the same network, use your server's **LAN IP** (e.g. `http://192.168.1.10:8080`).
- Best: a **real hostname over HTTPS** so it works anywhere — see [HTTPS & Reverse Proxy](../https/).
- Make sure your server URL is in `CORS_ORIGIN` (see [Configuration](../configuration/)).

## iOS

Planned. Apple doesn't allow side-loading, so iOS will ship via **TestFlight** / the App Store once
the Apple Developer account is set up. Watch the repo for updates.
