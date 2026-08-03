---
title: Mobile App
description: Install the Lyftr Android app, point it at your self-hosted server, and track workouts from your phone.
---

Lyftr has a native mobile app so you can log workouts at the gym, straight from your phone —
talking to **your** server.

## Android

1. Download the latest signed APK from the
   [Releases](https://github.com/Cawlumm/lyftr/releases/latest) page.
2. Open the `.apk` on your phone and allow **"install from unknown sources"** if prompted.
3. Launch Lyftr and enter your server URL when asked.

:::note[Side-loaded builds don't auto-update]
When a new release drops, download and install it over the old one. Store builds with
auto-update are on the roadmap.
:::

## Pointing the app at your server

The app connects to your self-hosted instance, so it needs a URL it can actually reach:

- **`localhost` won't work** from a phone — it refers to the phone itself.
- On the same network, use your server's **LAN IP** (e.g. `http://192.168.1.10:8080`).
  Android blocks unencrypted traffic by default; the app opts back in, so plain `http://`
  works. If it fails outright, update to the latest build.
- Best: a **real hostname over HTTPS** so it works anywhere — see [HTTPS & Reverse Proxy](../https/).
  A LAN-only hostname can still get a genuine certificate via DNS-01; no ports need opening.
- Using a **private or self-signed CA**? Install it on the phone — the app trusts the
  device's user-installed CA store. See [HTTPS & Reverse Proxy](../https/).
- Make sure your server URL is in `CORS_ORIGIN` (see [Configuration](../configuration/)).
  Note this only matters for the **web** app; native apps aren't subject to CORS.

## iOS

Planned. Apple doesn't allow side-loading, so iOS will ship via **TestFlight** / the App Store once
the Apple Developer account is set up. Watch the repo for updates.
