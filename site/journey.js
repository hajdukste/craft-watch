import { FOOTER, advisoryRef, signalFor } from './wording.js';
import { plainTitle } from './plain.js';
// Journey view for one app. The top is the six-step journey of one change: the featured one, or the row picked below.
// Below it, every change in the range with filters, a scrubber and a day list.
// Everything from GitHub is written with textContent or attributes, never as HTML.
const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY = 24 * 3600e3;
const HOUR = 3600e3;
const STALE_MS = 6 * HOUR; // GitHub can delay scheduled runs by a few hours
const ROW_H = 22;
const ROWS_MAX = 40;
const X0 = 380; // the timeline starts here; left of it are the PR titles
const X1 = 1180;
const CHECK_COLOURS = { SUCCESS: '#22C55E', FAILURE: '#EF4444', ERROR: '#EF4444', PENDING: '#FDE68A', EXPECTED: '#FDE68A' };
const WHO_LABEL = { bot: 'bot', human: 'human', unknown: 'not recorded' };
const STATIONS_X = [560, 900, 1200, 1500]; // review, robots, merged, release (positions from the mockup)

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const view = {
  data: null,
  app: null,
  end: 0,
  start: 0,
  from: 0,
  to: 0,
  asOf: 0,
  dayStart: 0,
  prs: [],
  releases: [],
  advisoryPackages: [],
  featured: null,
  focusNumber: null,
  filtered: [],
  plain: true,
  xray: false,
};

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// A date input value ("2026-10-23") read as local midnight.
const parseDay = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const stampFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function version(tag) {
  const match = /(\d+\.\d+(?:\.\d+)?)/.exec(tag ?? '');
  return match ? match[1] : tag ?? '';
}

const hoursBetween = (a, b) => (b - a) / HOUR;
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const hoursText = (h) => (h === null ? 'not found' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

function prepare(app) {
  const prs = (app.pulls_recent ?? []).map((p) => ({
    ...p,
    c: Date.parse(p.created_at),
    m: p.merged_at ? Date.parse(p.merged_at) : null,
    x: p.closed_at && !p.merged_at ? Date.parse(p.closed_at) : null,
    who: p.author_type === 'Bot' ? 'bot' : p.author_type === 'User' ? 'human' : 'unknown',
  })).filter((p) => Number.isFinite(p.c));
  const releases = (app.releases_recent ?? [])
    .map((r) => ({ ...r, t: Date.parse(r.published_at) }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
  return { prs, releases };
}

// The first release published at or after a merge. Only that counts as "shipped in".
function releaseAfter(t) {
  return view.releases.find((r) => r.t >= t) ?? null;
}

const isFailing = (p) => p.checks === 'FAILURE' || p.checks === 'ERROR';

function stateAt(p, t) {
  if (p.c > t) return null;
  if (p.m !== null && p.m <= t) return 'merged';
  if (p.x !== null && p.x <= t) return 'closed';
  return 'open';
}

// Security signal: a security term in the title or labels (checked when collecting), or the title names a package from an advisory.
function packageHit(p) {
  const words = (p.title ?? '').toLowerCase().split(/[^a-z0-9_-]+/);
  return view.advisoryPackages.some((name) => words.includes(name.toLowerCase()));
}
const isSecurity = (p) => Boolean(p.security_terms) || packageHit(p);
// An advisory name in the title (RUSTSEC, CVE, GHSA) or a package from an advisory is a stronger signal than a general term.
const isAdvisory = (p) => /RUSTSEC|CVE|GHSA/i.test(p.title ?? '') || packageHit(p);

// Featured change: the newest merge in the last 7 days that names an advisory, else the newest change that mentions hardening; else a change that failed a check,
// was retried and then merged; else the newest merge; else the newest change.
function pickFeatured() {
  const merged = view.prs.filter((p) => p.m !== null).sort((a, b) => b.m - a.m);
  const recent = merged.filter((p) => p.m >= view.end - 7 * DAY);
  const advisory = recent.find(isAdvisory);
  if (advisory) return { pr: advisory, reason: 'newest change that names an advisory, merged in the last 7 days' };
  const security = recent.find(isSecurity);
  if (security) return { pr: security, reason: 'newest change that mentions hardening, merged in the last 7 days' };
  const retried = merged.find((p) => p.checks_retried);
  if (retried) return { pr: retried, reason: 'a failed check, a retry, then merged' };
  if (merged[0]) return { pr: merged[0], reason: 'newest merged change' };
  const newest = [...view.prs].sort((a, b) => b.c - a.c)[0];
  return newest ? { pr: newest, reason: 'no merged change in the data' } : null;
}

// The app's median time from suggestion to the first release after the merge, over its shipped changes.
function appIdeaMedian() {
  const m = shippedMedians().idea;
  if (m === null) return 'not found';
  return m < 1 ? `~${Math.round(m * 60)} min` : `~${Math.round(m)} h`;
}

// The shipped changes: merged, with a release published after the merge. Every median uses this one set.
function shippedMedians() {
  const set = view.prs
    .filter((p) => p.m !== null && releaseAfter(p.m))
    .map((p) => ({ p, release: releaseAfter(p.m) }));
  return {
    n: set.length,
    idea: median(set.map(({ p, release }) => hoursBetween(p.c, release.t))),
    suggestToMerge: median(set.map(({ p }) => hoursBetween(p.c, p.m))),
    mergeToRelease: median(set.map(({ p, release }) => hoursBetween(p.m, release.t))),
  };
}

// Releases that cluster at one time of day: shown as a pattern, never as a promise.
function releasePattern() {
  const times = view.releases
    .filter((r) => r.t >= view.end - 30 * DAY)
    .map((r) => new Date(r.t).getHours() * 60 + new Date(r.t).getMinutes());
  if (times.length < 3) return null;
  const bins = new Map();
  for (const minute of times) {
    const bin = Math.floor(minute / 60);
    bins.set(bin, [...(bins.get(bin) ?? []), minute]);
  }
  const [, list] = [...bins.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (list.length * 2 < times.length) return null;
  const mid = Math.round(median(list));
  return `${pad(Math.floor(mid / 60))}:${pad(mid % 60)}`;
}

// Releases once per tag. Where two tags share a version number, the label shows the real tag.
function uniqueReleases(list) {
  const byTag = new Map();
  for (const r of list) if (!byTag.has(r.tag)) byTag.set(r.tag, r);
  const unique = [...byTag.values()];
  const numberOf = (r) => version(r.tag);
  const counts = new Map();
  for (const r of unique) counts.set(numberOf(r), (counts.get(numberOf(r)) ?? 0) + 1);
  for (const r of unique) r.label = counts.get(numberOf(r)) > 1 ? r.tag : numberOf(r);
  return unique;
}

// The change shown in the journey: the row picked below, or the featured one.
function focusPr() {
  if (view.focusNumber !== null) {
    const picked = view.prs.find((p) => p.number === view.focusNumber);
    if (picked) return { pr: picked, reason: 'the change you picked below' };
  }
  return view.featured;
}

// A merge burst: more than 10 merges, each within 30 min of the one before.
function mergeBurst(prs) {
  const merges = prs.filter((p) => p.m !== null).map((p) => p.m).sort((a, b) => a - b);
  let best = null;
  let group = [];
  const consider = () => {
    if (group.length > 10 && (!best || group.length > best.count)) {
      best = { count: group.length, minutes: Math.max(1, Math.round((group[group.length - 1] - group[0]) / 60e3)) };
    }
  };
  for (const t of merges) {
    if (group.length && t - group[group.length - 1] > 30 * 60e3) {
      consider();
      group = [];
    }
    group.push(t);
  }
  consider();
  return best;
}

function rangeFromControls() {
  const now = view.end;
  const today = startOfDay(now);
  let from;
  let to;
  switch ($('#range').value) {
    case 'today': [from, to] = [today, now]; break;
    case 'yesterday': [from, to] = [today - DAY, today]; break;
    case '7': [from, to] = [now - 7 * DAY, now]; break;
    case '30': [from, to] = [now - 30 * DAY, now]; break;
    case 'day': {
      const day = parseDay($('#day').value);
      [from, to] = [day, day + DAY];
      break;
    }
    default: {
      from = parseDay($('#from').value);
      to = parseDay($('#to').value) + DAY;
    }
  }
  from = Math.max(from, view.start);
  to = Math.min(to, now);
  if (to <= from) to = from + 1;
  return { from, to };
}

function selectedValues(name) {
  return new Set([...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value));
}

// A row matches when it overlaps the range, passes the author filter, and matches a chosen status (none chosen = all).
function matches(p, s) {
  if (p.c > s.asOf || p.c > s.to) return false;
  const lifeEnd = p.m ?? p.x ?? Infinity;
  if (lifeEnd < s.from) return false;
  if (s.whos.size && !s.whos.has(p.who)) return false;
  if (!s.statuses.size) return true;
  const inRange = (t) => t !== null && t >= s.from && t <= s.asOf;
  const released = p.m !== null && inRange(p.m) && releaseAfter(p.m)?.t <= s.asOf;
  const hits = {
    arrived: inRange(p.c),
    merged: inRange(p.m),
    failed: isFailing(p) && stateAt(p, s.asOf) === 'open',
    closed: inRange(p.x),
    released: Boolean(released),
  };
  return [...s.statuses].some((key) => hits[key]);
}

// ---------- The journey of the focused change (top of the page) ----------

// The status of each step, from the data only. "Shipped" needs a release published after the merge.
function journeySteps(p) {
  const release = p.m !== null ? releaseAfter(p.m) : null;
  const passed = p.light ? 'checks not loaded for this older change' : p.checks_total > 0
    ? (p.checks_passed !== null ? `checks ${p.checks_passed}/${p.checks_total} passed` : `${p.checks_total} checks`)
    : 'no checks recorded';
  const selfMerged = p.merged_by && p.author ? (p.merged_by === p.author ? 'yes' : 'no') : 'not found';
  let reached = 1;
  if (p.approvals > 0 || p.review_decision) reached = 2;
  if (p.checks_total > 0) reached = 3;
  if (p.m !== null) reached = 4;
  if (release) reached = 5;
  return {
    reached,
    release,
    suggested: { title: '1 · Someone suggests a change', sub: `#${p.number} · ${WHO_LABEL[p.who]} · ${stampFmt.format(p.c)}` },
    reviewed: { title: '2 · People review it', sub: `${p.approvals ?? 0} approval${p.approvals === 1 ? '' : 's'} · review ${p.review_decision ?? 'not recorded'}` },
    tested: { title: '3 · Robots test it', sub: passed },
    merged: {
      title: '4 · Approved & merged',
      sub: p.m !== null ? `merged ${stampFmt.format(p.m)} · self-merged ${selfMerged}` : p.x !== null ? 'closed without merging' : 'not merged yet',
    },
    shipped: {
      title: '5 · Ships as a new version',
      sub: release ? `shipped in ${release.label}` : p.m !== null ? 'merged · waiting for next release' : 'not merged yet',
    },
    install: {
      title: '6 · You install it',
      sub: release ? `release ${release.label} · download page` : 'nothing to install yet',
    },
  };
}

// The six steps in everyday words. The technical wording is used only when X-RAY is open.
// The six steps in everyday words, with real times. The technical wording is used only when X-RAY is open.
function plainSteps(p) {
  const base = journeySteps(p);
  const who = p.who === 'bot' ? 'a robot' : 'someone';
  return {
    ...base,
    suggested: { title: '1 · Someone suggests a change', sub: `suggested ${timeFmt.format(p.c)}` },
    reviewed: { title: '2 · Checked by people', sub: p.approvals > 0 ? `${p.approvals} ${p.approvals === 1 ? 'approval' : 'approvals'} recorded` : 'no approval recorded' },
    tested: { title: '3 · Tested by robots', sub: p.light ? 'robot checks not loaded for this older change' : p.checks_total > 0 ? `${p.checks_passed ?? '?'} of ${p.checks_total} robot checks passed` : 'no robot checks recorded' },
    merged: { title: '4 · Added to the app', sub: p.m !== null ? `added ${timeFmt.format(p.m)}` : p.x !== null ? 'closed, not added' : 'not added yet' },
    shipped: { title: '5 · In a new version', sub: base.release ? `in version ${base.release.label}` : p.m !== null ? 'waiting for next version' : 'not in a version yet' },
    install: { title: '6 · On your computer', sub: base.release ? 'once you download it' : 'nothing to install yet' },
  };
}


function heroTabs(svg) {
  let x = 56;
  let y = 92;
  for (const app of view.data.apps) {
    const width = app.name.length * 8.4 + 28;
    if (x + width > 1160) {
      x = 56;
      y += 36;
    }
    const current = app.name === view.app.name;
    const link = el('a', { href: `journey.html?app=${encodeURIComponent(app.name)}` });
    link.append(
      el('rect', { x, y, width, height: 28, rx: 14, fill: current ? app.colour : 'rgba(11,13,18,0.85)', stroke: app.colour, 'stroke-width': 1.2 }),
      el('text', { x: x + width / 2, y: y + 19, 'text-anchor': 'middle', fill: current ? '#0B0D12' : app.colour, 'font-size': 13, 'font-weight': 800 }, app.name),
    );
    svg.append(link);
    x += width + 8;
  }
}

function heroChips(svg, focus) {
  const today = startOfDay(view.end);
  const changesToday = view.prs.filter((q) => q.c >= today || (q.m !== null && q.m >= today)).length;
  const failingOpen = view.prs.filter((q) => isFailing(q) && q.m === null && q.x === null).length;
  const idea = appIdeaMedian();
  const chips = [
    ['changes today', String(changesToday), '#FFFFFF'],
    [!view.plain || view.xray ? `idea → your computer (median of ${shippedMedians().n} shipped)` : 'from idea to your computer', idea, '#BFDBFE'],
    ['stuck on checks', String(failingOpen), '#FCA5A5'],
  ];
  let x = 470;
  for (const [label, value, colour] of chips) {
    const width = (label.length + value.length) * 8.6 + 52;
    svg.append(el('rect', { x, y: 36, width, height: 34, rx: 17, fill: 'rgba(20,24,33,0.9)', stroke: '#262C38' }));
    const line = el('text', { x: x + 18, y: 58, fill: '#C9D1DC', 'font-size': 15, 'font-weight': 700 }, `${label} `);
    line.append(el('tspan', { fill: colour, 'font-family': 'JetBrains Mono, monospace' }, value));
    svg.append(line);
    x += width + 12;
  }
}

function heroSpeed(svg) {
  const now = view.end;
  const box = el('g', {});
  box.append(el('rect', { x: 1210, y: 92, width: 660, height: 110, rx: 12, fill: 'rgba(11,13,18,0.9)', stroke: '#262C38' }));
  box.append(el('text', { x: 1232, y: 120, fill: '#9AA4B2', 'font-size': 12, 'font-weight': 800, 'letter-spacing': 1 }, 'SPEED · 7 DAYS'));

  const days = [...Array(7)].map((_, i) => startOfDay(now - (6 - i) * DAY));
  const counts = days.map((day) => view.prs.filter((p) => p.m !== null && p.m >= day && p.m < day + DAY).length);
  const max = Math.max(1, ...counts);
  counts.forEach((count, i) => {
    const h = Math.max(2, (count / max) * 40);
    box.append(el('rect', { x: 1232 + i * 14, y: 190 - h, width: 9, height: h, rx: 2, fill: '#60A5FA', 'fill-opacity': count ? 0.7 : 0.15 }));
  });

  const opened24 = view.prs.filter((p) => p.c >= now - DAY).length;
  const releases7 = view.releases.filter((r) => r.t >= now - 7 * DAY).length;
  const shipped = shippedMedians();
  const suggestToMerge = shipped.suggestToMerge;
  const mergeToRelease = shipped.mergeToRelease;
  const stats = [
    [1400, 124, 'changes / hour', (opened24 / 24).toFixed(1)],
    [1560, 124, 'releases / week', String(releases7)],
    [1720, 124, 'suggest → merge', hoursText(suggestToMerge)],
    [1400, 166, 'merge → release', hoursText(mergeToRelease)],
    [1560, 166, 'first review', 'not found'],
    [1720, 166, 'tagged AI', 'not found'],
  ];
  box.append(el('text', { x: 1862, y: 200, 'text-anchor': 'end', fill: '#8A93A3', 'font-size': 11 }, `median of ${shipped.n} shipped changes · medians don't add up exactly`));
  for (const [x, y, label, value] of stats.filter(([, , , shown]) => shown !== 'not found')) {
    box.append(el('text', { x, y, fill: '#C9D1DC', 'font-size': 12 }, label));
    box.append(el('text', { x, y: y + 20, fill: '#FFFFFF', 'font-size': 15, 'font-family': 'JetBrains Mono, monospace', 'font-weight': 700 }, value));
  }
  svg.append(box);
}

function heroBurst(svg) {
  const burst = mergeBurst(view.prs);
  if (!burst) return;
  svg.append(el('rect', { x: 1210, y: 208, width: 660, height: 26, rx: 13, fill: 'rgba(250,204,21,0.12)', stroke: '#FACC15' }));
  svg.append(el('text', { x: 1232, y: 226, fill: '#FDE68A', 'font-size': 14, 'font-weight': 800 }, `${burst.count} changes merged in ${burst.minutes} min · merge burst`));
}

// Signal level for a change: an official GHSA is the red ring; a named advisory is amber; a general word has no ring.
// Red is only for GHSA. Amber never means "unsafe"; it means "read this".
function signalLevel(p) {
  if (/GHSA-/i.test(p.title ?? '')) return 'ghsa';
  if (advisoryRef(p.title, view.advisoryPackages)) return 'advisory';
  if (p.security_terms) return 'hardening';
  return null;
}
const RING = { ghsa: '#EF4444', advisory: '#FACC15' };
const RING_TEXT = { ghsa: '#FCA5A5', advisory: '#FDE68A', hardening: '#C9D1DC' };

// Counters on the left: this app today, and now.
function drawCounters(svg) {
  const start = startOfDay(view.end);
  const came = view.prs.filter((q) => q.c >= start).length;
  const added = view.prs.filter((q) => q.m !== null && q.m >= start).length;
  const closed = view.prs.filter((q) => q.x !== null && q.x >= start).length;
  const waiting = view.prs.filter((q) => q.m === null && q.x === null).length;
  svg.append(el('text', { x: 56, y: 880, fill: '#FFFFFF', 'font-size': 20, 'font-weight': 800 }, `${came} came in today · ${added} added · ${closed} closed · ${waiting} waiting`));
  svg.append(el('text', { x: 56, y: 904, fill: '#8A93A3', 'font-size': 12, 'font-family': 'JetBrains Mono, monospace' }, 'in your time zone · lines: white = a person, grey = a robot'));
}

function heroFlow(svg, focus) {
  const p = focus.pr;
  const technical = !view.plain || view.xray;
  const steps = technical ? journeySteps(p) : plainSteps(p);
  const reached = steps.reached;
  const grey = '#3A4252';
  const level = signalLevel(p);

  // Incoming lines by kind of author. AI co-authors are not recorded per change, so no AI line.
  const incoming = [
    ['M80,420 C300,420 400,540 560,540', '#E8ECF2', false],
    ['M80,480 C300,480 400,540 560,540', '#9AA4B2', true],
    ['M80,540 C300,540 400,540 560,540', '#E8ECF2', false],
    ['M80,650 C300,650 400,540 560,540', '#9AA4B2', true],
    ['M80,750 C300,750 400,540 560,540', '#E8ECF2', false],
  ];
  for (const [d, colour, dashed] of incoming) {
    const line = el('path', { d, stroke: colour, 'stroke-width': 2, 'stroke-opacity': 0.35, fill: 'none' });
    if (dashed) line.setAttribute('stroke-dasharray', '6 8');
    svg.append(line);
  }
  svg.append(el('path', { d: 'M560,540 L1500,540', stroke: grey, 'stroke-width': 3, 'stroke-opacity': 0.6, fill: 'none' }));

  // Lit track up to the furthest step reached.
  const litTo = STATIONS_X[Math.min(reached, 4) - 1] ?? 560;
  if (reached >= 2) svg.append(el('path', { d: `M560,540 L${litTo},540`, stroke: '#22C55E', 'stroke-width': 4, fill: 'none', filter: 'url(#bloom)' }));
  if (reached >= 4) svg.append(el('path', { d: 'M1200,540 L1500,540', stroke: '#60A5FA', 'stroke-width': 4, fill: 'none', filter: 'url(#bloom)' }));
  if (p.checks_retried) {
    svg.append(el('path', { d: 'M900,540 C840,420 690,400 600,470 C560,500 540,540 560,540', stroke: '#EF4444', 'stroke-width': 2, 'stroke-opacity': 0.8, 'stroke-dasharray': '5 7', fill: 'none' }));
    svg.append(el('text', { x: 760, y: 412, fill: '#FCA5A5', 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle' }, 'a check failed → retried → merged'));
  }

  drawCounters(svg);

  // Step 1: a person (white) or a robot (ring). A signal ring on it: red only for GHSA, amber for a named advisory.
  svg.append(el('circle', { cx: 80, cy: 540, r: 9, fill: p.who === 'bot' ? 'none' : '#FFFFFF', stroke: p.who === 'bot' ? '#C9D1DC' : 'none', 'stroke-width': 1.5 }));
  if (RING[level]) svg.append(el('circle', { cx: 80, cy: 540, r: 18, fill: 'none', stroke: RING[level], 'stroke-width': 2.5 }));
  STATIONS_X.forEach((x, i) => {
    svg.append(el('circle', { cx: x, cy: 540, r: 9, fill: reached > i + 1 ? '#22C55E' : grey, stroke: '#0B0D12', 'stroke-width': 2 }));
  });

  // Step 6: a laptop, as in the design. Its check mark shows when the change is in a version.
  const lit = reached >= 5 ? '#E8ECF2' : grey;
  const laptop = el('g', {});
  laptop.append(el('rect', { x: 1714, y: 504, width: 96, height: 62, rx: 6, fill: 'none', stroke: lit, 'stroke-width': 3 }));
  laptop.append(el('path', { d: 'M1700,578 h124 l-10,12 h-104 z', fill: 'none', stroke: lit, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  if (reached >= 5) laptop.append(el('path', { d: 'M1748,536 l10,10 l18,-20', fill: 'none', stroke: '#22C55E', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.append(laptop);

  // Labels, with the real values.
  const labels = [
    [56, 300, 'start', steps.suggested],
    [560, 262, 'middle', steps.reviewed],
    [900, 262, 'middle', steps.tested],
    [1200, 350, 'middle', steps.merged],
    [1500, 262, 'middle', steps.shipped],
    [1762, 350, 'middle', steps.install],
  ];
  for (const [x, y, anchor, step] of labels) {
    svg.append(el('text', { x, y, 'text-anchor': anchor, fill: '#E8ECF2', 'font-size': 20, 'font-weight': 800 }, step.title));
    svg.append(el('text', { x, y: y + 27, 'text-anchor': anchor, fill: '#8A93A3', 'font-size': 13, 'font-weight': 600, 'font-family': 'JetBrains Mono, monospace' }, step.sub));
  }

  const pattern = releasePattern();
  if (pattern) {
    svg.append(el('text', { x: 1500, y: 318, 'text-anchor': 'middle', fill: '#9AA4B2', 'font-size': 13 }, `Recent releases were published around ${pattern} · pattern, not a promise`));
  }

  // The change, and why it is in front.
  const title = p.title.length > 74 ? `${p.title.slice(0, 73)}…` : p.title;
  svg.append(el('text', { x: 56, y: 186, fill: '#FFFFFF', 'font-size': 20, 'font-weight': 800 }, technical ? `#${p.number} ${title}` : plainTitle(p.title)));
  svg.append(el('text', { x: 56, y: 210, fill: '#9AA4B2', 'font-size': 14 }, focus.reason));
  if (level) {
    svg.append(el('text', { x: 56, y: 352, fill: RING_TEXT[level], 'font-size': 13, 'font-weight': 700 }, `${signalFor(p.title, view.advisoryPackages)} (by title). ${FOOTER}`));
  }

  // Version history strip.
  svg.append(el('text', { x: 1200, y: 728, fill: '#9AA4B2', 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle', 'letter-spacing': 1 }, 'VERSION HISTORY'));
  const versions = view.releases.slice(-6);
  if (!versions.length) {
    svg.append(el('text', { x: 1200, y: 770, fill: '#9AA4B2', 'font-size': 14, 'text-anchor': 'middle' }, 'no releases in the data'));
  } else {
    svg.append(el('line', { x1: 900, y1: 770, x2: 1500, y2: 770, stroke: '#3A4252', 'stroke-width': 3 }));
    versions.forEach((r, i) => {
      const x = versions.length === 1 ? 1200 : 900 + (i * 600) / (versions.length - 1);
      const shipped = steps.release === r;
      svg.append(el('circle', { cx: x, cy: 770, r: shipped ? 11 : 7, fill: '#0B0D12', stroke: shipped ? '#22C55E' : '#E8ECF2', 'stroke-width': shipped ? 4 : 3 }));
      svg.append(el('text', { x, y: 806, fill: shipped ? '#86EFAC' : '#C9D1DC', 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono, monospace' }, r.label));
    });
  }
}


// A dependency change is expected when the title says it is an update or a bump; otherwise it is flagged.
function dependencyLines(p) {
  if (!p.dependency_touched) return [['✓', 'no dependency files changed']];
  if (/\b(update|bump)/i.test(p.title ?? '') && !p.workflow_touched) {
    return [['✓', 'dependency files changed'], ['note', '(expected: this is a dependency update)']];
  }
  return [['⚑', 'dependency files changed']];
}

// Self-merge is a neutral fact, not a verdict.
function selfMergeLines(selfMerged) {
  if (selfMerged === null) return [['?', 'merged by: not found']];
  if (!selfMerged) return [['✓', 'merged by someone else']];
  return [
    ['·', 'merged by its author'],
    ['note', 'common in small/fast teams · signal,'],
    ['note', 'not a problem by itself'],
  ];
}

// X-RAY: what is inside the change. "not found" wherever the data does not say.
function heroXray(svg, p) {
  const x = 1560;
  const y = 640;
  const release = p.m !== null ? releaseAfter(p.m) : null;
  const selfMerged = p.merged_by && p.author ? p.merged_by === p.author : null;
  const lines = [
    ['head', 'THE CHANGE'],
    [p.approvals > 0 ? '✓' : '?', p.approvals > 0 ? `${p.approvals} approval${p.approvals === 1 ? '' : 's'} recorded` : 'no approvals recorded'],
    ...selfMergeLines(selfMerged),
    ...(p.light
      ? [['?', 'checks and files: not loaded for this older change']]
      : [
        [p.checks_total > 0 && p.checks_passed !== null ? (p.checks_passed === p.checks_total ? '✓' : '⚑') : '?', `required checks ${p.checks_passed ?? '?'}/${p.checks_total} passed`],
        ...dependencyLines(p),
        [p.workflow_touched ? '⚑' : '✓', p.workflow_touched ? 'CI workflow files touched' : 'no CI workflow files touched'],
      ]),
    ['head', `THE RELEASE ${release ? release.label : '· not shipped yet'}`],
    [release ? (release.has_checksums ? '✓' : '?') : '?', release ? `checksums ${release.has_checksums ? 'published' : 'not found'}` : 'checksums: not shipped yet'],
    ['?', 'built by CI from the tagged commit: not found'],
    ['?', 'build attestation / SBOM: not found'],
    ['head', 'THE APP'],
    ['?', `OpenSSF Scorecard: ${view.app.scorecard ? `${view.app.scorecard.score}/10` : 'none found'}`],
  ];
  const box = el('g', {});
  box.append(el('rect', { x, y, width: 330, height: 400, rx: 14, fill: 'rgba(11,13,18,0.92)', stroke: '#7C3AED', 'stroke-width': 2 }));
  box.append(el('rect', { x: x + 16, y: y + 14, width: 74, height: 24, rx: 6, fill: '#7C3AED' }));
  box.append(el('text', { x: x + 53, y: y + 31, fill: '#FFFFFF', 'font-size': 12, 'font-weight': 800, 'text-anchor': 'middle' }, 'X-RAY'));
  box.append(el('text', { x: x + 100, y: y + 31, fill: '#8A93A3', 'font-size': 12 }, "what's inside this change"));
  let row = y + 60;
  for (const [icon, text] of lines) {
    if (icon === 'head') {
      row += 6;
      box.append(el('text', { x: x + 16, y: row, fill: '#9AA4B2', 'font-size': 11, 'font-weight': 800, 'letter-spacing': 1 }, text));
      row += 20;
      continue;
    }
    if (icon === 'note') {
      box.append(el('text', { x: x + 34, y: row, fill: '#8A93A3', 'font-size': 12 }, text));
      row += 18;
      continue;
    }
    const colour = icon === '✓' ? '#22C55E' : icon === '⚑' ? '#FB923C' : icon === '·' ? '#9AA4B2' : '#FACC15';
    box.append(el('text', { x: x + 16, y: row, fill: colour, 'font-size': 13, 'font-weight': 800 }, icon));
    box.append(el('text', { x: x + 34, y: row, fill: '#E8ECF2', 'font-size': 13 }, text.length > 46 ? `${text.slice(0, 45)}…` : text));
    row += 22;
  }
  svg.append(box);
}

function heroLegend(svg) {
  const items = [
    ['#FFFFFF', 'human'],
    ['#C9D1DC', 'bot (ring)'],
    ['#22C55E', 'passed checks'],
    ['#EF4444', 'failed, sent back'],
    ['#FDE68A', 'retrying'],
    ['#6B7585', 'closed without merging'],
  ];
  let x = 80;
  for (const [colour, label] of items) {
    svg.append(el('circle', { cx: x, cy: 1036, r: 6, fill: colour }));
    svg.append(el('text', { x: x + 14, y: 1041, fill: '#C9D1DC', 'font-size': 14, 'font-weight': 700 }, label));
    x += label.length * 8.4 + 52;
  }
}

function renderHero() {
  const svg = $('#hero');
  svg.replaceChildren();
  const defs = el('defs', {});
  defs.append(el('filter', { id: 'bloom', x: '-50%', y: '-50%', width: '200%', height: '200%' }));
  defs.querySelector('filter').append(el('feGaussianBlur', { stdDeviation: 7 }));
  const nebula = el('radialGradient', { id: 'nebula' });
  nebula.append(el('stop', { offset: 0, 'stop-color': '#7C3AED', 'stop-opacity': 0.18 }), el('stop', { offset: 1, 'stop-color': '#7C3AED', 'stop-opacity': 0 }));
  defs.append(nebula);
  svg.append(defs, el('ellipse', { cx: 1050, cy: 540, rx: 550, ry: 320, fill: 'url(#nebula)' }));

  const focus = focusPr();
  const title = el('text', { x: 56, y: 70, fill: '#E8ECF2', 'font-size': 26, 'font-weight': 800, 'letter-spacing': 1 }, 'CRAFT');
  title.append(el('tspan', { fill: '#A78BFA' }, ' WATCH'));
  svg.append(title, el('circle', { cx: 262, cy: 64, r: 5, fill: '#22C55E' }), el('text', { x: 274, y: 69, fill: '#C9D1DC', 'font-size': 14, 'font-weight': 700 }, `LIVE · ${view.app.name}`));
  heroChips(svg, focus);
  heroTabs(svg);
  if (!view.plain || view.xray) heroSpeed(svg);
  heroBurst(svg);

  if (focus) {
    heroFlow(svg, focus);
    if (view.xray) heroXray(svg, focus.pr);
  } else {
    svg.append(el('text', { x: 960, y: 540, 'text-anchor': 'middle', fill: '#9AA4B2', 'font-size': 20 }, 'No changes for this app in the data yet.'));
  }
  svg.append(el('text', { x: 960, y: 930, 'text-anchor': 'middle', fill: '#FFFFFF', 'font-size': 34, 'font-weight': 800, 'letter-spacing': -0.5 }, 'One change, from idea to your computer.'));
  heroLegend(svg);
}

// ---------- All changes (below the top) ----------

function currentState() {
  return {
    from: view.from,
    to: view.to,
    asOf: view.asOf,
    statuses: selectedValues('status'),
    whos: selectedValues('who'),
  };
}

function applyFilters() {
  const s = currentState();
  view.filtered = view.prs.filter((p) => matches(p, s)).sort((a, b) => b.c - a.c);
}

function renderStatus() {
  const ageMs = Date.now() - view.end;
  const minutes = Math.max(0, Math.round(ageMs / 60e3));
  const ago = minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  const stale = ageMs > STALE_MS;
  const status = $('#status');
  status.classList.toggle('warn', stale);
  status.textContent = view.app.ok === false
    ? `Stale since ${stampFmt.format(new Date(view.app.stale_since))}: the last refresh failed, numbers may be out of date`
    : `Updated ${ago}`;
  const banner = $('#banner');
  banner.hidden = !stale;
  banner.textContent = `Data delayed: last update ${ago}. Numbers may be out of date.`;
}

function renderCounters() {
  const { from, asOf } = view;
  $('#counters-note').textContent = view.app.truncated?.pulls
    ? 'Counts come from the newest 300 changes per app. Older changes in a long range are not in the data.'
    : 'Counts cover every change in the data for this app.';
  const inRange = (t) => t !== null && t >= from && t <= asOf;
  const f = view.filtered;
  const commitsSeen = (view.app.commit_times ?? []).filter((iso) => {
    const t = Date.parse(iso);
    return t >= from && t <= asOf;
  }).length;
  const counters = [
    ['arrived (suggested)', f.filter((p) => inRange(p.c)).length],
    ['merged', f.filter((p) => inRange(p.m)).length],
    ['closed without merging', f.filter((p) => inRange(p.x)).length],
    ['open at this time', f.filter((p) => stateAt(p, asOf) === 'open').length],
    ['failing checks (open, latest result)', f.filter((p) => isFailing(p) && stateAt(p, asOf) === 'open').length],
    ['releases', view.releases.filter((r) => inRange(r.t)).length],
    ['commits seen (newest 100)', commitsSeen],
    ['advisories', (view.app.advisories?.items ?? []).filter((a) => inRange(Date.parse(a.published_at))).length],
  ];
  $('#counters').replaceChildren(...counters.map(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'counter';
    const number = document.createElement('strong');
    number.textContent = String(value);
    const text = document.createElement('span');
    text.textContent = label;
    card.append(number, text);
    return card;
  }));
}

function renderSpeed() {
  const svg = $('#speed');
  svg.replaceChildren();
  const days = [];
  for (let t = startOfDay(view.from); t < view.asOf; t += DAY) days.push(t);
  if (!days.length) return;
  const counts = days.map((day) => view.filtered.filter((p) => p.m !== null && p.m >= day && p.m < day + DAY && p.m <= view.asOf).length);
  const max = Math.max(1, ...counts);
  const slot = (X1 - X0) / days.length;
  counts.forEach((count, i) => {
    const h = (count / max) * 80;
    const x = X0 + i * slot + slot * 0.15;
    svg.append(el('rect', { x, y: 90 - h, width: slot * 0.7, height: h, fill: '#22C55E', 'fill-opacity': count ? 0.7 : 0.12, rx: 2 }));
    if (count) svg.append(el('text', { x: x + slot * 0.35, y: 84 - h, 'text-anchor': 'middle', fill: '#C9D1DC', 'font-size': 12, 'font-family': 'JetBrains Mono, monospace' }, String(count)));
  });
  svg.append(el('line', { x1: X0, y1: 90, x2: X1, y2: 90, stroke: 'rgba(255,255,255,0.15)' }));
  const label = (t, anchor, x) => el('text', { x, y: 108, 'text-anchor': anchor, fill: '#9AA4B2', 'font-size': 12 }, shortDayFmt.format(t));
  svg.append(label(days[0], 'start', X0), label(days[days.length - 1], 'end', X1));
  svg.append(el('text', { x: 40, y: 48, fill: '#9AA4B2', 'font-size': 13 }, 'merged per day'));
}

function xFor(t) {
  return X0 + ((t - view.from) / (view.to - view.from)) * (X1 - X0);
}

function renderLanes() {
  const svg = $('#lanes');
  svg.replaceChildren();
  const rows = view.filtered.slice(0, ROWS_MAX);
  const top = 64;
  const height = top + rows.length * ROW_H + 24;
  svg.setAttribute('viewBox', `0 0 1200 ${Math.max(height, 120)}`);

  const span = view.to - view.from;
  const step = span <= 2 * DAY ? 6 * HOUR : span <= 10 * DAY ? DAY : 5 * DAY;
  for (let t = Math.ceil(view.from / step) * step; t <= view.to; t += step) {
    const x = xFor(t);
    const label = step < DAY ? timeFmt.format(t) : shortDayFmt.format(t);
    svg.append(
      el('line', { x1: x, y1: 40, x2: x, y2: height - 8, stroke: 'rgba(255,255,255,0.06)', 'stroke-dasharray': '2 6' }),
      el('text', { x, y: 32, 'text-anchor': 'middle', fill: '#9AA4B2', 'font-size': 12 }, label),
    );
  }

  // Release row: a star per release; a label only where it is at least 70 px from the last label.
  let lastLabelX = -Infinity;
  for (const r of view.releases) {
    if (r.t < view.from || r.t > view.asOf) continue;
    const x = xFor(r.t);
    const labelled = x - lastLabelX >= 70;
    if (labelled) lastLabelX = x;
    const star = el('polygon', {
      points: [...Array(10)].map((_, i) => {
        const radius = i % 2 === 0 ? 7 : 3;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        return `${(x + radius * Math.cos(angle)).toFixed(1)},${(44 + radius * Math.sin(angle)).toFixed(1)}`;
      }).join(' '),
      fill: view.app.colour,
    });
    star.append(el('title', {}, `Release ${r.tag}`));
    svg.append(star);
    if (labelled) svg.append(el('text', { x: x + 10, y: 48, fill: '#E8ECF2', 'font-size': 12, 'font-family': 'JetBrains Mono, monospace' }, r.label));
  }
  svg.append(el('text', { x: 10, y: 48, fill: '#9AA4B2', 'font-size': 12 }, 'releases'));

  rows.forEach((p, i) => {
    const y = top + i * ROW_H + ROW_H / 2;
    const end = p.m ?? p.x ?? view.asOf;
    const barStart = xFor(Math.max(p.c, view.from));
    const barEnd = xFor(Math.min(end, view.asOf));
    const state = stateAt(p, view.asOf);
    const colour = state === 'merged' ? '#22C55E' : state === 'closed' ? '#94A3B8' : '#FACC15';
    const group = el('g', { role: 'button', tabindex: '0', style: 'cursor: pointer' });
    if (view.focusNumber === p.number) group.append(el('rect', { x: 0, y: y - ROW_H / 2, width: 1200, height: ROW_H, fill: 'rgba(124,58,237,0.18)' }));
    // Full-row hit area, so a click anywhere on the row selects it.
    group.append(el('rect', { x: 0, y: y - ROW_H / 2, width: 1200, height: ROW_H, fill: 'rgba(0,0,0,0)' }));
    group.append(el('title', {}, `#${p.number} ${p.title}`));
    group.append(el('text', { x: 10, y: y + 4, fill: RING_TEXT[signalLevel(p)] ?? '#C9D1DC', 'font-size': 12 }, `#${p.number} ${p.title}`.slice(0, 54)));
    const bar = el('line', {
      x1: barStart, y1: y, x2: Math.max(barEnd, barStart + 1), y2: y,
      stroke: colour, 'stroke-width': 1.6, 'stroke-opacity': 0.8,
    });
    if (state === 'open') bar.setAttribute('stroke-dasharray', '4 4');
    group.append(bar);
    group.append(p.who === 'bot'
      ? el('circle', { cx: xFor(p.c), cy: y, r: 3.5, fill: 'none', stroke: '#C9D1DC', 'stroke-width': 1.4 })
      : el('circle', { cx: xFor(p.c), cy: y, r: 3.5, fill: '#FFFFFF' }));
    if (RING[signalLevel(p)]) group.append(el('circle', { cx: xFor(p.c), cy: y, r: 7, fill: 'none', stroke: RING[signalLevel(p)], 'stroke-width': 1.5 }));
    if (state === 'merged') group.append(el('circle', { cx: barEnd, cy: y, r: 4.5, fill: '#22C55E' }));
    else if (state === 'closed') group.append(el('circle', { cx: barEnd, cy: y, r: 4, fill: '#94A3B8' }));
    else group.append(el('circle', { cx: barEnd, cy: y, r: 5, fill: 'none', stroke: '#FACC15', 'stroke-width': 1.5 }));
    const check = CHECK_COLOURS[p.checks];
    if (check) group.append(el('rect', { x: barEnd + 9, y: y - 4, width: 8, height: 8, fill: check }));
    group.addEventListener('click', () => focusChange(p.number));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusChange(p.number);
      }
    });
    svg.append(group);
  });

  svg.append(el('line', { x1: xFor(view.asOf), y1: 40, x2: xFor(view.asOf), y2: height - 8, stroke: '#FFFFFF', 'stroke-opacity': 0.4, 'stroke-dasharray': '4 6' }));
  const note = $('#shown');
  const complete = Date.parse(view.app.coverage?.pulls_complete_from ?? '');
  const filling = Number.isFinite(complete) && complete > view.from
    ? ` Still filling in: complete from ${shortDayFmt.format(complete)}, older days are being added.`
    : '';
  note.textContent = `Showing ${rows.length} of ${view.filtered.length} changes in this range${view.filtered.length > ROWS_MAX ? ' (newest first)' : ''}. Checks show the latest result.${filling}`;
  if (view.app.truncated?.pulls) {
    note.textContent += ' Only the newest 300 pull requests per app are kept, so older changes in a long range are missing.';
  }
}

// Picks a change for the journey and X-RAY at the top. Picking the same change again returns to the featured one.
function focusChange(number) {
  view.focusNumber = view.focusNumber === number ? null : number;
  renderHero();
  renderLanes();
  $('#hero').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// Day view: what arrived, merged, closed and was released on the chosen day, in the visitor's time zone.
function renderDayList() {
  const dayStart = view.dayStart;
  const dayEnd = dayStart + DAY;
  $('#daylist-title').textContent = `Day view · ${dayFmt.format(dayStart)}`;
  const events = [];
  for (const p of view.filtered) {
    if (p.c >= dayStart && p.c < dayEnd && p.c <= view.asOf) {
      events.push({ t: p.c, text: `${timeFmt.format(p.c)} · #${p.number} arrived · ${p.title}` });
    }
    if (p.m !== null && p.m >= dayStart && p.m < dayEnd && p.m <= view.asOf) {
      const rel = releaseAfter(p.m);
      const tail = rel ? ` · shipped in ${rel.label}` : ' · merged, waiting for next release';
      events.push({ t: p.m, text: `${timeFmt.format(p.m)} · #${p.number} merged${tail}` });
    }
    if (p.x !== null && p.x >= dayStart && p.x < dayEnd && p.x <= view.asOf) {
      events.push({ t: p.x, text: `${timeFmt.format(p.x)} · #${p.number} closed without merging` });
    }
  }
  for (const r of view.releases) {
    if (r.t >= dayStart && r.t < dayEnd && r.t <= view.asOf) events.push({ t: r.t, text: `${timeFmt.format(r.t)} · release ${r.label} published` });
  }
  events.sort((a, b) => a.t - b.t);
  const items = events.map(({ text }) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  });
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing arrived, merged, closed or was released on this day with these filters.';
    items.push(li);
  }
  $('#daylist').replaceChildren(...items);
}

function renderVersions() {
  const chips = view.releases
    .filter((r) => r.t >= view.from && r.t <= view.asOf)
    .reverse()
    .map((r) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${r.label} · ${shortDayFmt.format(r.t)}`;
      return chip;
    });
  if (!chips.length) {
    const none = document.createElement('p');
    none.className = 'note';
    none.textContent = 'No releases in this range.';
    $('#versions').replaceChildren(none);
  } else {
    $('#versions').replaceChildren(...chips);
  }
}

function renderBurstAll() {
  const burst = mergeBurst(view.filtered);
  const note = $('#burst-all');
  note.hidden = !burst;
  if (burst) note.textContent = `${burst.count} changes merged in ${burst.minutes} min · merge burst`;
}

function renderAsOf() {
  $('#asof').textContent = `Showing the app as of ${stampFmt.format(view.asOf)}`;
}

function render() {
  applyFilters();
  renderAsOf();
  renderCounters();
  renderSpeed();
  renderLanes();
  renderDayList();
  renderVersions();
  renderBurstAll();
}

function chooseDay() {
  view.dayStart = $('#range').value === 'day' ? parseDay($('#day').value) : startOfDay(view.asOf);
}

function onRangeChange() {
  const range = $('#range').value;
  $('#day-wrap').hidden = range !== 'day';
  $('#from-wrap').hidden = range !== 'custom';
  $('#to-wrap').hidden = range !== 'custom';
  const { from, to } = rangeFromControls();
  view.from = from;
  view.to = to;
  resetScrub();
}

function resetScrub() {
  view.asOf = view.to;
  $('#scrub').value = '1000';
  chooseDay();
  render();
}

function onScrub() {
  const fraction = Number($('#scrub').value) / 1000;
  view.asOf = view.from + fraction * (view.to - view.from);
  chooseDay();
  render();
}

function setDefaultDates() {
  $('#day').value = dayKey(view.end);
  $('#from').value = dayKey(view.end - 7 * DAY);
  $('#to').value = dayKey(view.end);
}

function init(data) {
  view.data = data;
  view.end = Date.parse(data.generated_at);
  view.start = view.end - data.window_days * DAY;
  const name = params.get('app');
  view.app = data.apps.find((a) => a.name === name) ?? data.apps[0];
  const prepared = prepare(view.app);
  view.prs = prepared.prs;
  view.releases = uniqueReleases(prepared.releases);
  view.advisoryPackages = (view.app.advisories?.items ?? []).flatMap((a) => a.packages ?? []);
  view.featured = pickFeatured();
  document.title = `Craft Watch · ${view.app.name} journey`;
  $('#app-page-link').href = `app.html?app=${encodeURIComponent(view.app.name)}`;
  setDefaultDates();
  renderHero();
  renderStatus();
  setInterval(renderStatus, 30e3);
  onRangeChange();
}

$('#range').addEventListener('change', onRangeChange);
for (const id of ['#day', '#from', '#to']) $(id).addEventListener('change', onRangeChange);
for (const box of document.querySelectorAll('input[type="checkbox"]')) box.addEventListener('change', render);
$('#scrub').addEventListener('input', onScrub);
$('#now').addEventListener('click', resetScrub);

fetch('data/apps.json', { cache: 'no-store' })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(init)
  .catch((error) => {
    $('#status').classList.add('warn');
    $('#status').textContent = `Could not load the data (${error.message}).`;
  });

// Toolbar: plain words (on by default) and the X-RAY (opens the technical detail).
$('#plain-toggle').addEventListener('click', (event) => {
  view.plain = !view.plain;
  event.currentTarget.setAttribute('aria-pressed', String(view.plain));
  event.currentTarget.textContent = `Plain words: ${view.plain ? 'on' : 'off'}`;
  renderHero();
});
$('#xray-toggle').addEventListener('click', (event) => {
  view.xray = !view.xray;
  event.currentTarget.setAttribute('aria-pressed', String(view.xray));
  event.currentTarget.textContent = view.xray ? 'Close X-RAY' : 'Open X-RAY';
  renderHero();
});
