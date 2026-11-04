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

In a single SQLite file on your server. Backing up is copying that one file.

Your logs never leave it. The server does talk to two outside services, and only for public data:
it downloads the exercise catalog from open-exercise-db, and when you search for a food or scan a
barcode it sends that search or barcode to [Open Food Facts](https://world.openfoodfacts.org).
Your browser or phone loads exercise photos from open-exercise-db and food photos from Open
Food Facts directly.

## Do I need an API key or account for the exercise library?

No. Your server downloads the whole open-exercise-db
catalog (800+ exercises, with Spanish translations) on first startup and refreshes it every day. No
key, no setup. See [Exercise Library](../exercise-library/).

## Which languages does Lyftr support?

English and Spanish, in the app and in the exercise library. More are welcome. To add one, open a
pull request: see [Translations](https://github.com/Cawlumm/lyftr#translations).

## Which platforms are supported?

The web app, in any current browser on a desktop or a phone, and Android (side-load APK). Both
are the same app, so features match. iOS is planned via TestFlight / the App Store. The server
images are built for amd64, arm64 and armv7, so it runs on a Raspberry Pi, a VPS, a Synology NAS,
Proxmox, and local Mac/Linux/Windows.

## Can I import my data from Strong or Hevy?

Not yet. Importing Strong's CSV export, and a full export and import of your own data, are
planned. Until then your data is the SQLite file itself, which you can open with any SQLite tool.

## How do I get help?

Open an issue on [GitHub](https://github.com/Cawlumm/lyftr) or join the
[Discord](https://discord.gg/hfFWsrebQA).
