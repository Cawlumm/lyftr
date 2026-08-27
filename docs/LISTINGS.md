# Directory listings & discoverability

Lyftr ranks well for its own name and not at all for its category. Searches run 2026-08-27:

| Query | What ranks | Lyftr |
|---|---|---|
| `best self hosted workout tracker 2026` | wger, FitTrackee, Endurain, awesome-selfhosted, XDA | absent |
| `free open source Hevy alternative` | Kenko, Ellim, Liftin', AlternativeTo | absent |
| `Lyftr self-hosted workout tracker` | GitHub, DEV, RepoCloud, ToolyHealth | ranks |

What occupies the category results is **directories and listicles, not product sites**. So
getting listed is the lever, not on-page SEO — the landing page's metadata is already complete
(full OG set, Twitter card, `SoftwareApplication` JSON-LD, sitemap, dynamic `robots.txt`).

## Where Lyftr already appears

Organic, unprompted — worth knowing so it isn't duplicated:

- [GitHub](https://github.com/Cawlumm/lyftr) — 313 stars, 25 forks as of 2026-08-27
- [DEV Community](https://dev.to/cwlumm/i-built-lyftr-a-self-hosted-workout-tracker-33ap) — own post
- [Tom Dörr on X](https://x.com/tom_doerr/status/2084196362854228307)
- RepoCloud, ToolyHealth, imtaqin.id, BalancedFitnessGear — third-party writeups

## awesome-selfhosted — the highest-leverage listing

The [health-and-fitness tag](https://awesome-selfhosted.net/tags/health-and-fitness.html) holds
just **seven** entries (Endurain, FitTrackee, Mere Medical, OpenELIS Global, OpenEMR, Statistics
for Strava, wger), and that page is the #2 Google result for the category query. Small list,
high-authority domain.

### Gate: do not submit before 2026-09-06

The PR template requires *"Any software project you are adding was first released more than 4
months ago."* Lyftr's first release, `v0.1.0-beta.1`, was **2026-05-06**, so the earliest valid
submission date is **2026-09-06**.

**Known risk:** all releases so far are marked prerelease and there is no stable `v0.1.0`. The
maintainers keep a canned rejection for projects without tagged releases. If that happens, the
remedy is to promote a tag to a full release and resubmit — no code change needed.

### Mechanics

One PR adding `software/lyftr.yml` to
[`awesome-selfhosted/awesome-selfhosted-data`](https://github.com/awesome-selfhosted/awesome-selfhosted-data)
— the **data** repo, not the main list repo, which is generated from it. One item per PR,
kebab-case filename. Expect ~1 week between approval and merge.

House style, from `CONTRIBUTING.md`:

- No "open-source", "free" or "self-hosted" in the description — the list implies all three
- Prefer short forms; no "Lyftr is a…" preamble
- Alternatives go at the end as `(alternative to Hevy, Strong)`
- Fields like `stargazers_count`, `updated_at`, `current_release` and `commit_history` are
  filled in automatically by their tooling — do not write them by hand

### Draft entry

```yaml
name: Lyftr
website_url: https://lyftr-app.pages.dev
source_code_url: https://github.com/Cawlumm/lyftr
description: Mobile-first workout and nutrition tracker with reusable programs, a guided gym mode with rest timer, barcode food logging and bodyweight charts. Stores everything in a single SQLite file. (alternative to Hevy, Strong)
licenses:
  - MIT
platforms:
  - Go
  - Docker
tags:
  - Health and Fitness
demo_url: https://lyftr-demo.fly.dev
```

Tag and platform names verified against the repo's `tags/` and `platforms/` directories;
`Health and Fitness`, `Go` and `Docker` all exist.

**Before submitting**, note the checklist item: *"If login credentials are required to access
the demo, please link to the credentials directly."* The demo needs
`demo@lyftr.local` / `password123`. The one-click demo button removes the requirement outright —
land that first and this item resolves itself.

## Other directories

| Where | How | Notes |
|---|---|---|
| [selfh.st](https://selfh.st/submit/) | Submission form | Feeds "This Week in Self-Hosted" — a newsletter spike as well as a listing |
| [AlternativeTo](https://alternativeto.net/) | Add software, then list as an alternative to Hevy, Strong, wger | Appeared 4× across the category searches |
| OpenAltFinder, openalternative.co, libreselfhosted | Submission forms | Lower effort, lower traffic |
| [Product Hunt](https://www.producthunt.com/) | A launch, not a listing | One-shot — do it *after* the comparison pages are live, so the traffic lands on something |

Each is also a backlink, which is what compensates for running on a `.pages.dev` subdomain
rather than a custom domain.

## Not set up yet

**Google Search Console.** Without it there is no way to confirm what is indexed, which queries
produce impressions, or whether the sitemap is being read. Verify the property via DNS TXT or the
Cloudflare Pages `_headers` file and submit `sitemap-index.xml`. Free, and it turns every item
above from a guess into a measurement.
