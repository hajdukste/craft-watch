// Verdicts and measured numbers for one app, from its entry in data/apps.json only.
// Shared by the space view (update lights) and the app page (cards). All sentences come from wording.js.
import { FOOTER, NOTHING_FOUND, advisoryRef, signalFor, withFooter } from './wording.js';

const DAY = 24 * 3600e3;

// "A change mentions X" becomes "a change mentions X" mid-sentence. The reference keeps its capitals.
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const BURST_PER_DAY = 10; // more merges than this in the last 24 h counts as "lots of changes today"

export function version(tag) {
  const match = /(\d+\.\d+(?:\.\d+)?)/.exec(tag ?? '');
  return match ? match[1] : tag ?? '';
}

// Releases once per tag, oldest first. Where two tags share a version number, the label shows the real tag.
export function uniqueReleases(list) {
  const byTag = new Map();
  for (const r of list) if (!byTag.has(r.tag)) byTag.set(r.tag, r);
  const unique = [...byTag.values()].map((r) => ({ ...r, t: Date.parse(r.published_at) })).filter((r) => Number.isFinite(r.t));
  const counts = new Map();
  for (const r of unique) counts.set(version(r.tag), (counts.get(version(r.tag)) ?? 0) + 1);
  for (const r of unique) r.label = counts.get(version(r.tag)) > 1 ? r.tag : version(r.tag);
  return unique.sort((a, b) => a.t - b.t);
}

// Everything a verdict needs, computed once per app.
export function context(app, end) {
  const releases = uniqueReleases(app.releases_recent ?? []);
  const advisories = app.advisories?.items ?? [];
  const packages = advisories.flatMap((a) => a.packages ?? []);
  const prs = (app.pulls_recent ?? [])
    .map((p) => ({ ...p, c: Date.parse(p.created_at), m: p.merged_at ? Date.parse(p.merged_at) : null }))
    .filter((p) => Number.isFinite(p.c));
  const ctx = { app, end, prs, releases, advisories, packages };
  ctx.releaseAfter = (t) => releases.find((r) => r.t >= t) ?? null;
  ctx.mergedSince = (t) => prs.filter((p) => p.m !== null && p.m >= t && p.m <= end);
  ctx.advisoryFixed = (advisory) => {
    const patched = new Set(advisory.patched ?? []);
    const published = Date.parse(advisory.published_at);
    return releases.some((r) => patched.has(version(r.tag)) && r.t >= published);
  };
  return ctx;
}

// A change names an advisory: an advisory ID in the title, or a package from an advisory in the title.
export const isAdvisoryNamed = (ctx, p) => advisoryRef(p.title, ctx.packages) !== null;
// A change with a general security word in its title, or one that names an advisory.
export const isGhsa = (p) => /GHSA-/i.test(p.title ?? '');
export const isSecurity = (ctx, p) => Boolean(p.security_terms) || isAdvisoryNamed(ctx, p);

// Crash-like report words, matched on issue titles.
const CRASH_WORDS = /crash|won'?t open|doesn'?t open|can'?t open|lost|broken|regression/i;
const HOUR_MS = 3600e3;

// For the newest release: how many crash-like reports name its version in its first 48 h, and the usual for the previous 5.
// Amber needs at least 3 reports and at least twice the usual. Counts come from the issues in the data (the last 30 days).
export function reportSpike(app, end) {
  const ctx = context(app, end);
  if (!ctx.releases.length) return null;
  const issues = (app.issues_recent ?? [])
    .map((i) => ({ ...i, c: Date.parse(i.created_at) }))
    .filter((i) => Number.isFinite(i.c) && CRASH_WORDS.test(i.title ?? ''));
  const countFor = (release) => {
    const name = version(release.tag);
    return issues.filter((i) => i.c >= release.t && i.c <= release.t + 48 * HOUR_MS && (i.title ?? '').includes(name)).length;
  };
  const newest = ctx.releases[ctx.releases.length - 1];
  const count = countFor(newest);
  const previous = ctx.releases.slice(-6, -1);
  const usual = previous.length ? previous.map(countFor).reduce((a, b) => a + b, 0) / previous.length : 0;
  return {
    count,
    usual: Math.round(usual * 10) / 10,
    label: newest.label,
    spike: count >= 3 && count >= 2 * usual,
    sample: previous.length,
  };
}

// "Should I update today?": red = a change naming an advisory shipped this week; amber = something to read or wait for; green = nothing found.
export function updateVerdict(app, end) {
  const ctx = context(app, end);
  if (!ctx.releases.length) {
    return { colour: 'grey', title: 'No release yet', text: withFooter('We found no release in the data for this app.'), evidence: [] };
  }
  const recent = ctx.mergedSince(end - 7 * DAY);
  const shipped7 = recent
    .filter((p) => isSecurity(ctx, p) && ctx.releaseAfter(p.m))
    .map((p) => ({ p, release: ctx.releaseAfter(p.m) }))
    .sort((a, b) => b.release.t - a.release.t);
  const advisoryShipped = shipped7.find((s) => isAdvisoryNamed(ctx, s.p));
  const spike = reportSpike(app, end);

  const evidence = [];
  if (advisoryShipped) {
    evidence.push(`#${advisoryShipped.p.number} "${advisoryShipped.p.title}": ${signalFor(advisoryShipped.p.title, ctx.packages)}, shipped in ${advisoryShipped.release.label}`);
  }
  if (spike) {
    evidence.push(`${spike.count} crash-like report(s) name ${spike.label} in its first 48 h; usual ${spike.usual} (previous ${spike.sample} releases)`);
  }

  if (advisoryShipped && isGhsa(advisoryShipped.p)) {
    const to = advisoryShipped.release.label;
    return { colour: 'red', title: 'Update now', text: withFooter(`${signalFor(advisoryShipped.p.title, ctx.packages)} and shipped in ${to}. Update to ${to}.`), evidence };
  }
  if (advisoryShipped) {
    return { colour: 'yellow', title: 'Wait a day', text: withFooter(`A change that names an advisory shipped in ${advisoryShipped.release.label}. Read the advisory before deciding.`), evidence };
  }
  if (spike && spike.spike) {
    return { colour: 'yellow', title: 'Wait a day', text: withFooter(`${spike.count} crash-like reports mention ${spike.label} in its first 48 h, against a usual ${spike.usual}. Give it a day.`), evidence };
  }
  const calm = spike
    ? `${spike.count} crash-like report(s) mention ${spike.label} in its first 48 h, usual ${spike.usual}.`
    : 'We found no crash-like reports for the newest release in our data.';
  return { colour: 'green', title: 'Looks calm', text: withFooter(`${calm} ${NOTHING_FOUND}`), evidence };
}

// "What do we see for my version?" for one release tag of the app.
export function versionVerdict(app, end, tag) {
  const ctx = context(app, end);
  const release = ctx.releases.find((r) => r.tag === tag);
  const latest = ctx.releases[ctx.releases.length - 1];
  if (!release) return { colour: 'grey', title: 'No version to check', text: withFooter('We found no release in the data for this app.') };
  const newerCount = ctx.releases.filter((r) => r.t > release.t).length;
  const shippedAfter = ctx.mergedSince(0)
    .filter((p) => isSecurity(ctx, p) && ctx.releaseAfter(p.m) && ctx.releaseAfter(p.m).t > release.t)
    .map((p) => ({ p, release: ctx.releaseAfter(p.m) }))
    .sort((a, b) => b.release.t - a.release.t);
  const advisoryAfter = shippedAfter.find((s) => isAdvisoryNamed(ctx, s.p));
  const openAdvisories = ctx.advisories.filter((a) => !ctx.advisoryFixed(a));
  const waiting = ctx.mergedSince(release.t).filter((p) => isSecurity(ctx, p) && !ctx.releaseAfter(p.m));

  if (advisoryAfter && isGhsa(advisoryAfter.p)) {
    return { colour: 'red', title: 'Update recommended', text: withFooter(`${signalFor(advisoryAfter.p.title, ctx.packages)}, shipped in ${advisoryAfter.release.label} after ${release.label}. Update to ${advisoryAfter.release.label}.`) };
  }
  if (advisoryAfter) {
    return { colour: 'yellow', title: 'Read the advisory', text: withFooter(`A change that names an advisory shipped in ${advisoryAfter.release.label}, after ${release.label}. Read it before deciding.`) };
  }
  if (shippedAfter.length) {
    return { colour: 'yellow', title: 'Read the notes', text: withFooter(`Changes mention hardening and shipped in ${shippedAfter[0].release.label}, after ${release.label}. Read the notes before deciding.`) };
  }
  if (openAdvisories.length) {
    return { colour: 'yellow', title: 'Open advisory', text: withFooter(`The maintainers published ${openAdvisories.length} advisory(ies) with no fixed release in the data. Read the advisory before deciding.`) };
  }
  if (waiting.length) {
    const named = waiting.find((p) => isAdvisoryNamed(ctx, p));
    const what = named ? 'A change that names an advisory' : 'Changes mention hardening';
    return { colour: 'yellow', title: 'Change not released yet', text: withFooter(`${what} ${named ? 'is' : 'are'} merged after ${release.label}; no release has shipped ${named ? 'it' : 'them'} yet.`) };
  }
  if (release.tag === latest.tag) {
    return { colour: 'green', title: 'Latest in our data', text: withFooter(`${release.label} is the latest release in the data. ${NOTHING_FOUND}`) };
  }
  return { colour: 'green', title: 'Nothing found', text: withFooter(`${NOTHING_FOUND.replace('for this version', `for ${release.label}`)} ${newerCount} newer release(s) in the data.`) };
}

// The four big cards. Each card is only returned when its number can be measured from the data.
export function statCards(app, end) {
  const ctx = context(app, end);
  const cards = [];
  if (typeof app.commits?.total === 'number') {
    cards.push({ label: 'COMMITS PER DAY', value: (app.commits.total / 30).toFixed(1), note: 'average over the last 30 days, default branch' });
  }
  if (typeof app.commits?.ai_tagged_pct === 'number') {
    cards.push({ label: 'TAGGED AI CO-AUTHOR', value: `${app.commits.ai_tagged_pct}%`, note: 'of the newest 100 commits, with a Co-authored-by AI tag', colour: '#A78BFA' });
  }
  if (ctx.releases.length || app.releases_recent) {
    const week = ctx.releases.filter((r) => r.t >= end - 7 * DAY).length;
    cards.push({ label: 'RELEASES THIS WEEK', value: String(week), note: 'new versions published in the last 7 days' });
  }
  const days = ctx.advisories
    .map((a) => {
      const patched = new Set(a.patched ?? []);
      const fix = ctx.releases.find((r) => patched.has(version(r.tag)) && r.t >= Date.parse(a.published_at));
      return fix ? (fix.t - Date.parse(a.published_at)) / DAY : null;
    })
    .filter((d) => d !== null);
  if (days.length) {
    const sorted = [...days].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    cards.push({ label: 'DAYS FROM ADVISORY TO FIX', value: median.toFixed(1), note: `median of ${days.length} published advisory(ies) with a fixed release`, colour: '#22C55E' });
  }
  return cards;
}

export { FOOTER };
