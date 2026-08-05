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

The app connects to your self-hosted instance, so it needs a URL it can actually reach.
**Use `https://`.** Everything below assumes that; plain HTTP is covered after, as the
exception it should be.

- **Point it at a real hostname over HTTPS** — see [HTTPS & Reverse Proxy](../https/).
  This works from anywhere, not just your home network. A LAN-only hostname can still get
  a genuine, publicly-trusted certificate via DNS-01, with no ports open to the internet.
- **`localhost` won't work** from a phone — it refers to the phone itself. Use a hostname
  or your server's LAN IP.
- Running your own CA instead? Install it on the phone — the app trusts the device's
  user-installed CA store. See [HTTPS & Reverse Proxy](../https/).
- `CORS_ORIGIN` only matters for the **web** app (see [Configuration](../configuration/)).
  Native apps send no `Origin` header and are never subject to CORS.

### If you must use plain HTTP

`http://192.168.1.10:8080` works — Android blocks unencrypted traffic by default and the
app opts back in, so a bare `docker compose` install is usable. If it fails outright,
update to the latest build.

:::caution[What plain HTTP costs you]
Nothing is encrypted. Every request carries your login token in the clear, so **anyone
else on that network can read it and stay signed in as you** — on a home LAN that includes
guests and any compromised device. Captured tokens stay valid until they expire and cannot
be revoked; the only way to invalidate them is to change `JWT_SECRET`, which signs out
every user on the instance.

The app shows an amber **Not encrypted** marker on the server row while this is in effect.
Treat it as a temporary state, not a setup.
:::

## iOS

Planned. Apple doesn't allow side-loading, so iOS will ship via **TestFlight** / the App Store once
the Apple Developer account is set up. Watch the repo for updates.
