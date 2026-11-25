# ReelFree

A hand-picked **guide** to movies and TV that are free and legal to watch. ReelFree hosts no video, proxies nothing, and scrapes nothing: every title is a fixed, hand-curated entry in [`data/titles.json`](data/titles.json) that points at a legal free source.

Sources allowed: Internet Archive public-domain items (archive.org), official studio/distributor YouTube channels, Tubi, Pluto TV.

## Layout
- `index.html`, `title.html`, `about.html`, `account.html`, `app.js`, `styles.css`: static site, no build step. `/title/<id>` is rewritten to `title.html`.
- `data/titles.json`: the curated list (id, title, year, type, genre, source, url, embedUrl where allowed, description).
- `data/status.json`: written by the nightly checker. The site reads the live copy from raw.githubusercontent.com, so hiding/un-hiding takes effect without a redeploy (`vercel.json` `ignoreCommand` skips deploys for status-only commits).
- `api/report.js`: Vercel function behind the "Report broken link" button.
- `scripts/check-links.mjs`: the link checker. `scripts/weekly-report.mjs`: weekly issue.
- `accounts.js`, `firestore.rules`, `firebase.json`: optional accounts (off by default).

## Playback (observed 2026-11-24 from a US server)
| Source | Response headers seen | How it plays on ReelFree |
|---|---|---|
| Internet Archive | `/embed/<id>` has no X-Frame-Options and no `frame-ancestors` | **In-site**, official archive.org embed player |
| YouTube (official channels) | official embed player (`youtube-nocookie.com/embed`) | **In-site**, official YouTube embed player |
| Pluto TV | title pages send no X-Frame-Options and no CSP `frame-ancestors` | **In-site full-page viewer** (Pluto's own page in an iframe, with their ads); "Open on Pluto TV" new-tab link always shown as a fallback |
| Tubi | `X-Frame-Options: SAMEORIGIN` on title pages; no public embed option found | **New tab** (`target="_blank" rel="noopener"`). Framing is not worked around. |

No pop-up windows (`window.open`) or ad-style overlays are used anywhere. If a source changes its headers, update `PLAYBACK` in `app.js`.

## Link checker
`node scripts/check-links.mjs` (GitHub Actions, nightly, US runners):
- Archive: `https://archive.org/metadata/<id>`: item exists, not dark, has a video file.
- YouTube: `https://www.youtube.com/oembed?url=...&format=json`: 404/401/403 means removed, private or not embeddable.
- Tubi / Pluto: page returns 200 and its `<title>`/`og:title` still contains the title (dead Pluto links redirect to live TV, dead Tubi IDs land on a different title).
- Each failure is retried once in the same run. `consecutiveFailures` is tracked per title; at **2** the title is hidden; it un-hides automatically on the next pass.

## Reports
- **Report broken link** (every title page) posts to `/api/report`, which opens a GitHub issue labelled `user-report` (repeat reports for the same title become comments). Anti-spam: honeypot field, 3-second minimum, 5 reports per IP per hour per instance, one open issue per title, 25-comment cap, length limits. No email or IP is stored. Needs Vercel env vars `GH_REPORT_TOKEN` (a token that can create issues on this repo; a fine-grained PAT limited to this repo with Issues: read/write is best) and `GH_REPO=chrisgfree-glitch/reelfree`. Without them the button replies "Reporting is not configured yet."
- **Weekly report** (Mondays): `weekly-report.yml` opens or updates the single open `weekly-report` issue listing hidden titles, titles that failed once, and open visitor reports. Uses the built-in `GITHUB_TOKEN`; no secrets.

## Accounts (off by default)
Email/password sign-in, private favorites and custom lists via Firebase Auth + Firestore (free Spark plan). Data lives at `users/{uid}/favorites/{titleId}` and `users/{uid}/lists/{listId}`; `firestore.rules` lets each user read and write only their own documents. No profiles, comments or social features.

To turn on: create a Firebase project (Spark, free), enable Email/Password sign-in, create a Firestore database, deploy `firestore.rules` (`firebase deploy --only firestore:rules`), add a Web app, add `reelfree.net` to Auth's authorized domains, then paste the web config into `config.js` and set `accountsEnabled: true`. The web config is public by design; never commit admin/service-account keys.

## Adding titles
Edit `scripts/candidates.py`, run `python3 scripts/build_titles.py`, then `node scripts/check-links.mjs --no-write` and only commit titles that pass. YouTube entries must come from the rights holder's official channel.
