# Craft Watch: full build spec

> Put this file (and `CLAUDE.md` + the `design/` folder) in the root of an empty `craft-watch` folder.
> Then Claude Code builds the whole app from it, phase by phase. You only type the short "cheat codes" at the bottom.

## 1. What it is
A free, static website that **watches the public GitHub activity of the ArtCraft apps** and shows it as a beautiful live map,
plus plain-English safety help. Made by Overprivileged. For normal people first, with "FOR TECHIES" details for developers.
**Public data only. Signals, not a guarantee. It flags, it never accuses.**

## 2. Apps (repos) to watch
storytold/photocraft · storytold/filmcraft · storytold/pdfcraft · storytold/effectcraft · storytold/figcraft ·
storytold/lightcraft · storytold/vectorcraft · storytold/designcraft (confirm each exists and is official before adding;
list lives in `repos.json` with name, repo, colour, official download URL).
Colours (from the mockup): PhotoCraft #60A5FA · FilmCraft #FB923C · PdfCraft #A78BFA · EffectCraft #F472B6 ·
FigCraft #2DD4BF · LightCraft #FCD34D · others: pick distinct, readable on #05060A.

## 3. Pages / views (see `design/` for the look)
1. **Space view ("All apps")**, `design/Hook.dc.html`: one ArtCraft core, every app a glowing branch, commits as sparks,
   releases as stars, security bugs as red cracks that heal green. Has a **time-lapse button** (live · 1 h in 10 s · 1 day in 30 s).
2. **Journey of one change (per app)**, `design/Journey.dc.html`: suggest (PR) → review gate → robot checks (CI) →
   merged → release star → your computer. Colours: white human, purple tagged-AI, green passed, red failed → amber
   retry → green, grey closed idea, red-ring security fix, orange-ring risk flag. Version-history strip with red band → green fix.
   App tabs on top. Speed strip. FOR TECHIES inspector card. Live counters.
3. **App page / dashboard**, `design/Main.dc.html`: "Is my version safe?" picker, latest activity, stats, plus everything in §4.
4. **About / how it works**: what the colours mean, data sources, limits, privacy (no tracking), link to the channel.

## 4. Everything people look for (features)
### For everyone
- **Is my problem fixed yet?** search box per app: type the bug you hit ("crash on export", "A4 printing") → matching public
  issues with status in plain words: 🔴 still open · 🟡 being worked on (linked PR) · 🟢 fixed in version X → "update to X".
- **Should I update today?** per app: 🟢 stable, fine to update · 🟡 lots of changes today, maybe wait a day · 🔴 security fix, update now.
- **Is my version safe?** pick app + version → green / yellow (open security reports) / red ("update to X").
- **What changed this week**, plain English summary of release notes (if AI-written: label "AI summary").
- **Get the real one**: official download link per app, copy-paste checksum check (Mac + Windows), and a
  **fake/lookalike repo warning list** (repos with the same name that are not storytold).
- **How to use it safely** box per app: official source → verify checksum/signature → when to update → lock AI/MCP to one
  folder → what it can access → clean uninstall. Links to the Overprivileged safety kit and videos.
- **Get alerts**: how to Watch a repo (Releases + Security alerts) + an **RSS/Atom feed** of security fixes and releases.
- **After-release trouble**: new bug reports opened in the 48 h after each release.
- **Compare apps**: busiest, fastest to fix security issues, most stable this month.
- **Community questions (FAQ)**: the most common questions from public GitHub issues/discussions labelled question,
  plus questions from channel comments, answered in plain English. Never show people's emails; usernames only if public and relevant.
- **Weekly recap** card (shareable image) → becomes a Short / community post.
- **Embeddable badge** (`PhotoCraft v0.9.2 🟢 · Craft Watch`) for blogs and READMEs.

### Answers to what people actually ask (from real YouTube comments, 23 Oct)
Source: top 80 comments each on the 3 biggest ArtCraft videos (FUTC 2.4M views, Rough Cut Pete 1.7M, SavvyNik 621k) + our own channel's comments.
Most comments are Adobe-subscription anger; these are the real questions behind them, each becomes a feature:
- **"Is it still maintained, or a one-week stunt?"** ("maintaining this costs human time or tokens", "zero tech support") →
  **Alive meter** per app: changes this week, days since last release, issues closed vs opened, maintainers active.
- **"Does it actually work? Missing features, deal-breaking bugs"** → **"Biggest open problems"**: the most-upvoted open bug
  issues per app, and **"Most wanted features"**: most-upvoted feature requests (with links). Honest, from GitHub reactions.
- **"Will Adobe get it taken down? People are backing up the repos"** → **Availability**: repo up/down, last checked, number
  of forks; plus "export your work in open formats" advice. (Never host or link unofficial copies.)
- **"Does it need an account / collect data?"** (claimed in comments, unverified) → **Privacy facts** per app: account needed?
  works offline? network connections seen in our own tests (link V13/V15/V17 results) or "not tested yet". Facts only.
- **"Finally on Linux!" / Windows / Mac** → **Platforms** per release: which OS downloads exist, Apple-signed or not.
- **"Can it open my PSD / XMP / PDF files?"** → **File support** list per app (from docs, release notes and issues; "unknown" if unclear).
- **"Download only from the official page" / fake sites** → **Get the real one** + lookalike warnings (already above).
- **"Who is behind it?"** → **Who maintains it**: public org/maintainer info and the project's own statements only. No digging into people.
- **AI / MCP** ("connect Claude to it, run it headless") → **AI access** per app: has MCP/CLI? what it can touch → link the folder-lock guide.
- Our viewers: launcher / auto-update safety, "who reviews the code / poisoned PRs" → geek signals + `craft-launcher` repo.
Also watch the newer repos people mention: storytold/wordcraft, gridcraft, deckcraft, craft-launcher (verify first).

### Time & filters (on the space view and every journey view)
- **Date filter**: Today · Yesterday · Last 7 days · Last 30 days · a specific day (calendar picker) · custom range (from → to).
- **Status filter**: arrived (new suggestions/PRs opened) · merged · failed checks · closed without merging · released · security fixes.
- **Who**: human · bot · tagged AI · first-time contributor. **App**: one, several or all.
- **Timeline scrubber**: drag along the bottom to replay any moment; the map, counters and speed strip follow the filter.
- **Day view list**: for the chosen day, a list "arrived at 09:14 · merged at 15:02 · in release v0.9.2" (time shown in the
  visitor's own time zone), so anyone can see exactly what arrived and what got merged on that day.
- Filters live in the URL (e.g. `?app=photocraft&day=2026-10-22&status=merged`) so a view can be shared or shown in a video.

### For techies (FOR TECHIES panels, hover/click a spark)
- Per change: PR number + title, author type (human / bot / tagged AI via Co-authored-by), signed & verified commits,
  approvals, self-merged without review ⚑, required checks passed/skipped, touches `.github/workflows/` ⚑,
  dependency changes (Cargo.toml / Cargo.lock, new crates) ⚑, first-time contributor on sensitive files ⚑, big binaries ⚑.
- Per release: built by CI from the tagged commit, checksums published, macOS signed + notarized (when visible),
  build attestation / SBOM / provenance (or "none found"), assets unchanged after publish.
- Per bug: advisory / CVE ID, affected + fixed versions, days reported → fixed → released; dependency vulns from
  OSV.dev / RustSec labelled "may affect".
- Repo health: OpenSSF Scorecard score, branch protection on main.
- Speed: changes/hour chart, releases/week, suggested → merged, merged → released, first review time, tagged-AI share.

## 5. Data
- `scripts/collect.mjs` (Node 20, no secrets in code; optional `GITHUB_TOKEN`): per repo, last 30 days of commits,
  PRs (state, reviews, checks, files touched: workflow/dependency flags), issues (title, labels, state, dates), releases
  (assets, checksums), security advisories, OSV vulns for dependencies, OpenSSF Scorecard. Writes `data/*.json`.
  Respect rate limits; keep history in `data/history/YYYY-MM-DD.json` (so we build our own dataset).
- GitHub Actions: run every 15 min with the built-in `GITHUB_TOKEN`, permissions `contents: write` only, commit data as
  github-actions[bot] only when changed. A second workflow deploys to GitHub Pages.
- **Production rules** (so it works first time): fetch only what is new since the last run (store a cursor), prefer the
  GraphQL API to save calls, stay under ~1,000 requests/hour; deploy the data to Pages as a build artifact instead of
  committing it every 15 min; commit only one small daily history file (also keeps scheduled workflows active);
  show the real "updated X min ago" (schedules can run late); if a call fails, keep the last good data and say so.
- **Rehearsal mode**: everything must also run locally (`npm run collect` + `npm run dev`) so the whole app can be tested
  in a private repo / on my Mac before the public deploy.
- **Safety**: escape all text from GitHub (titles, messages) before rendering, no `innerHTML` with raw data.
  No cookies, no analytics, no external scripts except self-hosted fonts. Never show emails. Only fixed/public security details.

## 6. Tech
Plain HTML/CSS/JS (or Vite, no framework needed), SVG/Canvas for the map, smooth 60 fps on a laptop, works on phones,
`prefers-reduced-motion` respected. Fonts: Inter + JetBrains Mono (self-hosted). Dark space theme as in `design/`.

## 7. Phases (Claude Code builds one phase per cheat code, then STOPS and shows me what to check)
1. **Skeleton**: folders, README ("public data only · signals, not a guarantee"), `repos.json` (verify official repos, ask me OK).
2. **Collector**: `collect.mjs` + first run + summary table per app so I can compare with GitHub.
3. **Automation**: Actions every 15 min + Pages deploy. Data starts collecting from here.
4. **Space view** with real data + time-lapse.
5. **Journey view** per app with tabs, counters, speed strip, version strip, FOR TECHIES card, plus the **date / status / who
   filters, timeline scrubber and day view list** (§4 "Time & filters"), also wired into the space view.
6. **App pages**: Should I update today?, Is my version safe?, What changed, Get the real one, How to use safely, alerts/RSS.
7. **Extras**: after-release trouble, compare, FAQ, weekly recap image, badge.
8. **Polish + security review**: performance, phone layout, reduced motion, escaping, no secrets in git history, minimal permissions.
9. **Deploy + launch checklist**: live URL, OpenGraph image, link back to the channel.

## 7b. Trust rules (fixes from plan review, 23 Oct)
- **"Fixed in X" only when proven**: issue closed by a merged PR (linked/“Fixes #N”) AND that PR's commit is in a published
  release. Otherwise say "closed (no linked fix), check release notes" or "unknown". Never guess.
- **Every number comes from the data at build time**; on screen show "tagged as AI co-authored: X%", never "written by AI".
- Site-wide: **"Beta · unofficial · not affiliated with ArtCraft/storytold · signals, not a guarantee"** + honest
  "last updated X min ago"; if data is stale > 2 h, show a yellow "data delayed" banner.
- People: usernames or totals only; no emails, no profiles, no "who is risky" lists.
- If a repo disappears or renames: keep the last data, mark "repo unavailable since …", don't crash.

## 8. Rules for Claude Code
- Work phase by phase; after each phase: run it, show screenshots or a summary, list what I should check, then wait.
- Never invent data: if something can't be found, show "none found" or a placeholder.
- Keep my privacy: use only the overprivileged GitHub account; no personal names, emails or local paths in code, commits or UI.
- Short commit messages per step.
