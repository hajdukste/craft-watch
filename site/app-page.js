// App page, laid out like design/Main.dc.html. Every number and verdict comes from data/apps.json via verdicts.js.
// A card is hidden when its number cannot be measured. Everything from GitHub is written with textContent or validated links.
import { context, updateVerdict, versionVerdict, statCards, isAdvisoryNamed, isGhsa } from './verdicts.js';
import { signalFor } from './wording.js';
import { GROUPS, MEANING, groupOf, isPlainSentence, isUserFacing, plainTitle, weekFor } from './plain.js';

const DAY = 24 * 3600e3;
const STALE_MS = 6 * 3600e3; // GitHub can delay scheduled runs by a few hours
const DEFAULT_APP = 'PhotoCraft';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MONO = 'JetBrains Mono, ui-monospace, monospace';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const stampFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const view = { data: null, app: null, ctx: null, end: 0 };

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function validGitHubUrl(url) {
  try {
    return typeof url === 'string' && new URL(url).hostname === 'github.com';
  } catch {
    return false;
  }
}

function listItems(items, empty) {
  const values = items.length ? items : [empty];
  return values.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  });
}

// ---------- The version map: the app over the last 30 days ----------
function drawMap() {
  const { app, ctx } = view;
  const svg = $('#map');
  svg.replaceChildren();
  const start = ctx.end - 30 * DAY;
  const X0 = 60;
  const X1 = 1140;
  const Y = 150;
  const x = (t) => X0 + ((Math.min(Math.max(t, start), ctx.end) - start) / (ctx.end - start)) * (X1 - X0);

  svg.append(el('line', { x1: X0, y1: Y, x2: X1, y2: Y, stroke: app.colour, 'stroke-width': 3, 'stroke-opacity': 0.7, 'stroke-linecap': 'round' }));

  // Commits: the newest 100 per app, placed at their real times.
  for (const iso of app.commit_times ?? []) {
    const t = Date.parse(iso);
    if (t >= start && t <= ctx.end) svg.append(el('circle', { cx: x(t), cy: Y, r: 2.2, fill: '#FFFFFF', 'fill-opacity': 0.35 }));
  }

  // Changes that name an advisory: a red band from the merge to the release that shipped it, and a ring at that release.
  // Only advisory-named changes that shipped in this window are drawn.
  for (const p of ctx.mergedSince(start)) {
    if (!isAdvisoryNamed(ctx, p)) continue;
    const release = ctx.releaseAfter(p.m);
    if (!release || release.t < start) continue;
    svg.append(el('line', { x1: x(p.m), y1: Y, x2: x(release.t), y2: Y, stroke: isGhsa(p) ? '#EF4444' : '#FACC15', 'stroke-width': 12, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' }));
    svg.append(el('text', { x: (x(p.m) + x(release.t)) / 2, y: Y + 34, 'text-anchor': 'middle', fill: '#FCA5A5', 'font-size': 12, 'font-weight': 700 }, `${signalFor(p.title, ctx.packages)}, shipped in ${release.label}`));
    svg.append(el('circle', { cx: x(release.t), cy: Y, r: 11, fill: '#0B0D12', stroke: '#22C55E', 'stroke-width': 4 }));
    svg.append(el('text', { x: x(release.t), y: Y + 34, 'text-anchor': 'middle', fill: '#86EFAC', 'font-size': 12, 'font-weight': 700 }, `fix in ${release.label}`));
  }

  // Releases: a circle each; a label only where it is at least 70 px from the last label.
  let lastLabel = -Infinity;
  for (const r of ctx.releases) {
    if (r.t < start) continue;
    const cx = x(r.t);
    svg.append(el('circle', { cx, cy: Y, r: 6.5, fill: '#0B0D12', stroke: app.colour, 'stroke-width': 3 }));
    if (cx - lastLabel >= 70) {
      lastLabel = cx;
      svg.append(el('text', { x: cx, y: Y - 16, 'text-anchor': 'middle', fill: '#C9D1DC', 'font-size': 12, 'font-weight': 600, 'font-family': MONO }, r.label));
    }
  }

  // Advisories with no fixed release in the data.
  const open = ctx.advisories.filter((a) => !ctx.advisoryFixed(a));
  if (open.length) {
    svg.append(el('circle', { cx: X1 - 8, cy: Y + 70, r: 5, fill: '#FACC15' }));
    svg.append(el('text', { x: X1 - 20, y: Y + 74, 'text-anchor': 'end', fill: '#FDE68A', 'font-size': 12, 'font-weight': 700 }, `${open.length} advisory(ies) with no fixed release`));
  }

  for (const [t, label, anchor] of [[start, '30 d ago', 'start'], [ctx.end - 7 * DAY, '7 d', 'middle'], [ctx.end, 'now', 'end']]) {
    svg.append(el('text', { x: x(t), y: 262, 'text-anchor': anchor, fill: '#6B7585', 'font-size': 12, 'font-weight': 600 }, label));
  }
}

// ---------- The two verdict cards ----------
function renderUpdate() {
  const verdict = updateVerdict(view.app, view.end);
  const box = $('#update-box');
  box.className = `result ${verdict.colour}`;
  box.replaceChildren();
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = verdict.title;
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = verdict.text;
  box.append(title, text);
  $('#update-evidence').replaceChildren(...listItems(verdict.evidence ?? [], 'Nothing in the data points to a reason to wait or hurry.'));
}

function renderVersion() {
  const tag = $('#version').value;
  const verdict = versionVerdict(view.app, view.end, tag);
  const box = $('#version-box');
  box.className = `result ${verdict.colour}`;
  box.replaceChildren();
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = verdict.title;
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = verdict.text;
  box.append(title, text);
}

function renderPickers() {
  const apps = $('#app-pick');
  apps.replaceChildren(...view.data.apps.map((app) => {
    const option = document.createElement('option');
    option.value = app.name;
    option.textContent = app.name;
    option.selected = app.name === view.app.name;
    return option;
  }));
  const select = $('#version');
  const newestFirst = [...view.ctx.releases].reverse();
  select.replaceChildren(...newestFirst.map((r) => {
    const option = document.createElement('option');
    option.value = r.tag;
    option.textContent = `${r.label} · ${shortFmt.format(r.t)}`;
    return option;
  }));
  const wanted = params.get('version');
  select.value = newestFirst.some((r) => r.tag === wanted) ? wanted : (newestFirst[0]?.tag ?? '');
  if (!newestFirst.length) {
    const none = document.createElement('option');
    none.textContent = 'no release in the data';
    select.replaceChildren(none);
    select.disabled = true;
  }
}

// ---------- The four big cards: only measured numbers ----------
function renderStats() {
  const cards = statCards(view.app, view.end);
  const section = $('#stats');
  section.hidden = cards.length === 0;
  section.replaceChildren(...cards.map((card) => {
    const box = document.createElement('div');
    box.className = 'stat';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = card.label;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = card.value;
    if (card.colour) value.style.color = card.colour;
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = card.note;
    box.append(label, value, note);
    return box;
  }));
}

// ---------- What changed, the real one, alerts ----------
function renderChanged() {
  const { ctx, app } = view;
  $('#releases').replaceChildren(...listItems(
    [...ctx.releases].reverse().filter((r) => r.t >= ctx.end - 30 * DAY).map((r) => `${r.label} · ${stampFmt.format(r.t)}`),
    'No releases in the last 30 days.',
  ));
  const merged = ctx.mergedSince(ctx.end - 7 * DAY).sort((a, b) => b.m - a.m);
  $('#merged-count').textContent = `${merged.length} change(s) merged in the last 7 days. Newest first, up to 12 shown.`;
  const items = merged.slice(0, 12).map((p) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = `#${p.number} ${p.title}`;
    if (validGitHubUrl(p.url)) link.href = p.url;
    li.append(link);
    return li;
  });
  $('#merged').replaceChildren(...(items.length ? items : listItems([], 'Nothing merged in the last 7 days.')));

  const latest = ctx.releases[ctx.releases.length - 1];
  $('#official').href = `https://github.com/${app.repo}/releases`;
  $('#official').textContent = `github.com/${app.repo} releases`;
  $('#latest-line').textContent = latest
    ? `Latest release in our data: ${latest.label} (${stampFmt.format(latest.t)}). Checksums ${latest.has_checksums ? 'are listed for it' : 'not found for it'}.`
    : 'No release in the data yet.';
  $('#feed').href = `https://github.com/${app.repo}/releases.atom`;
  $('#feed').textContent = `github.com/${app.repo}/releases.atom`;
  $('#journey-link').href = `journey.html?app=${encodeURIComponent(app.name)}`;
  $('#app-meta').textContent = `${app.repo} · ${(app.issues?.open_now ?? 0).toLocaleString()} open reports. ${MEANING.openReports}.`;
}

function renderStatus() {
  const ageMs = Date.now() - view.end;
  const minutes = Math.max(0, Math.round(ageMs / 60e3));
  const ago = minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  const status = $('#status');
  if (view.app.ok === false) {
    status.classList.add('warn');
    status.textContent = `Stale since ${stampFmt.format(new Date(view.app.stale_since))}: the last refresh failed`;
  } else {
    status.classList.remove('warn');
    status.textContent = `Live · updated ${ago}`;
  }
  const banner = $('#banner');
  banner.hidden = ageMs <= STALE_MS;
  banner.textContent = `Data delayed: last update ${ago}. Numbers may be out of date.`;
}

// What's new this week: sentences grouped into New, Fixed, Faster and Languages. At most 8 in total.
function renderNews() {
  const week = weekFor(view.app, view.end);
  const holder = $('#news-groups');
  holder.replaceChildren();
  // Round-robin across the groups, so each group that has changes gets a turn. At most 8 in total.
  const byGroup = new Map(GROUPS.map((g) => [g, week.merged
    .filter((p) => weekGroup(p) === g && isUserFacing(p.title))
    .map((p) => plainTitle(p.title))
    .filter(isPlainSentence)]));
  const chosen = new Map(GROUPS.map((g) => [g, []]));
  for (let turn = 0, total = 0; total < 8; turn += 1) {
    let took = false;
    for (const g of GROUPS) {
      if (total >= 8) break;
      const next = byGroup.get(g)[turn];
      if (next) {
        chosen.get(g).push(next);
        total += 1;
        took = true;
      }
    }
    if (!took) break;
  }
  for (const group of GROUPS) {
    const titles = chosen.get(group);
    if (!titles.length) continue;
    const block = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = group;
    const list = document.createElement('ul');
    list.className = 'list';
    list.append(...titles.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    block.append(heading, list);
    holder.append(block);
  }
  if (!holder.children.length) {
    const none = document.createElement('p');
    none.className = 'note';
    none.textContent = 'No changes were merged in the last 7 days in our data.';
    holder.append(none);
  }
  $('#see-all').href = `journey.html?app=${encodeURIComponent(view.app.name)}#all`;
}

// The group for a merged change, from its title (same rules as plain.js groupOf).
function weekGroup(p) {
  return groupOf(p.title);
}

// Is it getting better? This week's reports, and how many were closed.
function renderBetter() {
  const week = weekFor(view.app, view.end);
  const share = week.reported ? Math.round((week.fixed / week.reported) * 100) : 0;
  $('#better-line').textContent = `This week: ${week.reported} problems reported · ${week.fixed} closed`;
  $('#better-bar').style.width = `${Math.min(100, share)}%`;
  $('#better-meaning').textContent = week.reported
    ? `${share}% of this week's reports were closed (${MEANING.fixed}).`
    : 'No new reports this week in our data.';
}

function render() {
  view.ctx = context(view.app, view.end);
  renderNews();
  renderBetter();
  document.title = `Craft Watch · ${view.app.name}`;
  $('.app-title').textContent = `${view.app.name} · version map`;
  $('.app-title').style.color = view.app.colour;
  drawMap();
  renderPickers();
  renderUpdate();
  renderVersion();
  renderStats();
  renderChanged();
  renderStatus();
}

function init(data) {
  view.data = data;
  view.end = Date.parse(data.generated_at);
  view.app = data.apps.find((a) => a.name === params.get('app')) ?? data.apps.find((a) => a.name === DEFAULT_APP) ?? data.apps[0];
  render();
  setInterval(renderStatus, 30e3);
}

// Choosing another app opens its own page, so the address always names the app.
$('#app-pick').addEventListener('change', (event) => {
  location.href = `app.html?app=${encodeURIComponent(event.target.value)}`;
});
$('#version').addEventListener('change', renderVersion);

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
