# Craft Watch

A free, static website that watches the **public** GitHub activity of the ArtCraft apps and shows it as a live map,
with plain-English safety help. Made by Overprivileged.

**Public data only · signals, not a guarantee · it flags, it never accuses.**

Beta · unofficial · not affiliated with ArtCraft/storytold.

## Status

Phase 1: skeleton. No data is collected yet and there is no site yet.

## Layout

- `repos.json`: the apps we watch (name, repo, colour, official download page).
- `scripts/`: the data collector (phase 2).
- `data/`: collected data; `data/history/` holds one small file per day.
- `site/`: the static site (phase 4 onward).
- `SPEC.md`, `CLAUDE.md`, `design/`: the build spec, the rules for building it, and the look.

## Data sources

Only public GitHub data: commits, pull requests, issues, releases, security advisories, and public dependency
vulnerability feeds. No accounts, no cookies, no analytics, no tracking.

## Local use (after phase 2)

```sh
npm run collect   # fetch public data into data/
npm run dev       # preview the site locally
```

An optional `GITHUB_TOKEN` environment variable raises rate limits. It is read from the environment only and is never stored.

## License

MIT, see [LICENSE](LICENSE). Use it, run it locally, point it at other repos, change it. Keep the copyright notice.
The collected data is public GitHub data; the apps it watches have their own licenses.
