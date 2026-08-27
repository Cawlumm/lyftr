---
title: Lyftr vs wger
description: An honest comparison of two self-hosted workout trackers — wger's maturity and breadth against Lyftr's lighter footprint and mobile-first interface.
---

wger is the established self-hosted fitness tracker, and it earned that position. It has been
developed for over a decade, it is properly free software, it has apps on Android, iOS, F-Droid and
Flathub, and it does things Lyftr does not attempt. If you are choosing between the two, you should
know up front that wger is the more capable and more proven project.

Lyftr is a narrower tool. It tries to be the best *lifting* log you can self-host on a small box,
with a phone-first interface, and it deliberately does less.

## At a glance

| | Lyftr | wger |
|---|---|---|
| License | MIT | AGPL-3.0 |
| Stack | Go binary + SQLite | Django / Python + PostgreSQL |
| Deploy | One Docker command, one data file | Docker Compose, multi-service |
| Interface | Mobile-first web + Android APK | Web + Android, iOS, F-Droid, Flathub |
| Maturity | Started 2026 | Over a decade |
| Custom exercises | Not yet | Yes, with community contribution |
| Auto-progression | Yes | Yes |
| Gym / trainer management | No | Yes |
| REST API | Yes | Yes |
| Nutrition & bodyweight | Yes | Yes |

## Where wger is better

This is the honest core of the comparison.

- **Maturity and community.** Roughly 6,000 GitHub stars, years of real-world use, and a track
  record of maintenance. Lyftr is months old.
- **Distribution.** wger is on F-Droid and Flathub and has an iOS app. Lyftr has an Android APK you
  sideload and a web app.
- **Custom exercises, with a shared database.** wger lets users add exercises and contribute them
  upstream. Lyftr's 800+ library is currently fixed.
- **Gym management.** Trainer accounts, member management, workout assignment — a whole dimension
  Lyftr does not have and is not building.
- **AGPL.** If you consider copyleft a feature rather than a constraint, wger's license protects
  the commons in a way MIT does not.

## Where Lyftr is different

Not automatically better — different, and better for some people.

- **A much smaller footprint.** A single Go binary and one SQLite file, versus Django plus
  PostgreSQL. That matters on a Raspberry Pi or the cheapest VPS tier, and it makes backups a
  file copy rather than a database dump.
- **Mobile-first, not mobile-adapted.** Around 90% of Lyftr's use is on a phone, and the interface
  was designed for that first — including a dedicated gym mode with a rest timer for use mid-set.
- **Simpler to run.** One command, one container, one file to back up. Fewer moving parts is the
  point, not a limitation we are apologising for.
- **A more modern interface.** Subjective, and wger's has improved a lot. Try both — the
  [live demo](https://lyftr-demo.fly.dev) needs no signup.

## Who should pick which

**Pick wger** if you want the mature option, you need custom exercises, you run a gym or train
other people, you want an iOS or F-Droid app, or you simply prefer a project with a decade behind
it.

**Pick Lyftr** if you want a lifting log that runs on almost nothing, you spend your gym time on a
phone, and you would rather have a small tool that does less than a large one that does more.

Both store your data on your own hardware, which is the part that actually matters. If Lyftr is not
the right fit, wger is a genuinely good answer and we would rather you used that than a
subscription.
