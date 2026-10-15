---
title: FAQ
description: Common questions about self-hosting Lyftr, the open-source Hevy / Strong alternative.
---

## Is Lyftr really free?

Yes. Lyftr is open source under the **MIT license**. No subscription, no paywalled features, no
"your export is a Pro feature." You run it yourself.

## How is it different from Hevy, Strong, Wger, or FitNotes?

- **Hevy / Strong** — polished, but cloud-only, increasingly paywalled, and your data lives on
  someone else's server.
- **Wger** — a solid self-hosted option; Lyftr's focus is a more modern, mobile-first UI and a
  simpler one-command deploy.
- **FitNotes** — local-only, with no sync or server deployment story.

Lyftr is for people who want a modern, mobile-first workout tracker they **fully own** and can run
on a $5 VPS or a Raspberry Pi.

## Where is my data stored?

In a single SQLite file on your server. Nothing is sent to any third party. Backing up is copying
that one file.

## Do I need an API key or account for the exercise library?

No. Your server downloads the whole open-exercise-db
catalog (800+ exercises, with Spanish translations) on first startup and refreshes it every day. No
key, no setup. See [Exercise Library](../exercise-library/).

## Which languages does Lyftr support?

English and Spanish, in the app and in the exercise library. More are welcome. To add one, open a
pull request: see [Translations](https://github.com/Cawlumm/lyftr#translations).

## Which platforms are supported?

Android (side-load APK) and web today; iOS is planned via TestFlight / the App Store. The server
runs on Raspberry Pi, x86 VPS, Synology NAS, Proxmox, and local Mac/Linux/Windows.

## Can I import my data from Strong or Hevy?

CSV import is on the roadmap (planned), alongside a PWA build.

## How do I get help?

Open an issue on [GitHub](https://github.com/Cawlumm/lyftr) or join the
[Discord](https://discord.gg/hfFWsrebQA).
