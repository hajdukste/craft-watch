// Landing: how fast the ArtCraft apps change. Every number and fact is computed from data/apps.json.
import { plainTitle, weekFor } from './plain.js';
import { version } from './verdicts.js';

const DAY = 24 * 3600e3;
const HOUR = 3600e3;
const MAIN_APPS = ['ArtCraft', 'PhotoCraft', 'FilmCraft', 'PdfCraft', 'EffectCraft', 'FigCraft', 'LightCraft', 'VectorCraft'];
const FACT_MS = 5000;
const REFRESH_MS = 300000;
const openedAt = Date.now();
const $ = (selector) => document.querySelector(selector);
const state = { apps: [], end: 0, since: 0, total: null, facts: [], factIndex: 0 };
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

// Commit timestamps (newest 100 per app) and pull request open and merge times.
function timestamps(app) {
  const commits = (app.commit_times ?? []).map((iso) => Date.parse(iso));
  const pulls = (app.pulls_recent ?? []).flatMap((p) => [p.created_at, p.merged_at, p.closed_at].filter(Boolean).map((iso) => Date.parse(iso)));
  const releases = (app.releases_recent ?? []).map((r) => Date.parse(r.published_at));
  return [...commits, ...pulls, ...releases].filter(Number.isFinite);
}

// Changes in the last 24 hours: commits seen plus pull requests merged. Commits are the newest 100 per app, so this is a floor.
function changesLast24h() {
  return state.apps.reduce((total, app) => {
    const commits = (app.commit_times ?? []).filter((iso) => Date.parse(iso) >= state.end - DAY).length;
    const merged = (app.pulls_recent ?? []).filter((p) => p.merged_at && Date.parse(p.merged_at) >= state.end - DAY).length;
    return total + commits + merged;
  }, 0);
}

// Fastest version climb: the app with the most releases in the data, shown with its first and last version and the days between.
function fastestClimb() {
  let best = null;
  for (const app of state.apps) {
    const releases = [...(app.releases_recent ?? [])]
      .map((r) => ({ ...r, t: Date.parse(r.published_at) }))
      .filter((r) => Number.isFinite(r.t))
      .sort((a, b) => a.t - b.t);
    if (releases.length < 2) continue;
    const span = (releases[releases.length - 1].t - releases[0].t) / DAY;
    const candidate = { app, count: releases.length, span, first: releases[0], last: releases[releases.length - 1] };
    if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.span < best.span)) best = candidate;
  }
  if (!best) return null;
  const days = Math.max(1, Math.round(best.span));
  return {
    label: 'Fastest version climb',
    text: `${best.app.name}: v${version(best.first.tag)} → v${version(best.last.tag)} in ${days} days (${best.count} releases)`,
  };
}

// Biggest merge burst: the most merges inside any 30-minute window, for one app.
function biggestBurst() {
  let best = null;
  for (const app of state.apps) {
    const merges = (app.pulls_recent ?? []).filter((p) => p.merged_at).map((p) => Date.parse(p.merged_at)).sort((a, b) => a - b);
    for (let i = 0; i < merges.length; i++) {
      let j = i;
      while (j + 1 < merges.length && merges[j + 1] - merges[i] <= 30 * 60e3) j += 1;
      const count = j - i + 1;
      if (count >= 2 && (!best || count > best.count)) {
        best = { app, count, minutes: Math.max(1, Math.round((merges[j] - merges[i]) / 60e3)) };
      }
    }
  }
  if (!best) return null;
  return { label: 'Biggest merge burst', text: `${best.app.name}: ${best.count} changes merged in ${best.minutes} min` };
}

// Busiest app today: the most changes opened or merged since midnight, in your time zone.
function busiestToday() {
  const midnight = new Date(state.end);
  midnight.setHours(0, 0, 0, 0);
  const from = midnight.getTime();
  let best = null;
  for (const app of state.apps) {
    const count = (app.pulls_recent ?? []).filter((p) => {
      const opened = Date.parse(p.created_at) >= from;
      const merged = p.merged_at && Date.parse(p.merged_at) >= from;
      return opened || merged;
    }).length;
    if (!best || count > best.count) best = { app, count };
  }
  if (!best || best.count === 0) return null;
  return { label: 'Busiest app today', text: `${best.app.name}: ${best.count} changes today` };
}

// N: real commits across the 8 main apps since each app's first release in the data. It goes up only when new data arrives.
function renderHero() {
  const mains = state.apps.filter((app) => MAIN_APPS.includes(app.name));
  const total = mains.reduce((sum, app) => sum + (app.commits_since_first_release ?? 0), 0);
  const starts = mains.map((app) => app.first_release_at).filter(Boolean).map((iso) => Date.parse(iso));
  const sinceDate = starts.length ? shortDate.format(new Date(Math.min(...starts))) : 'the first release';
  if (state.total !== null && total > state.total) pulse($('#total-changes'));
  state.total = total;
  $('#total-changes').textContent = total.toLocaleString();
  $('#since-date').textContent = `since ${sinceDate}`;

  // X: from the changes of the last 24 hours across the 8 main apps (commits seen plus pull requests merged).
  const day = mains.reduce((sum, app) => {
    const commits = (app.commit_times ?? []).filter((iso) => Date.parse(iso) >= state.end - DAY).length;
    const merged = (app.pulls_recent ?? []).filter((p) => p.merged_at && Date.parse(p.merged_at) >= state.end - DAY).length;
    return sum + commits + merged;
  }, 0);
  $('#per-second').textContent = day > 0 ? String(Math.round(86400 / day)) : 'many';

  state.facts = [fastestClimb(), biggestBurst(), busiestToday()].filter(Boolean);
  showFact(0);
}

// A short highlight on the number when it goes up.
function pulse(node) {
  node.classList.remove('pulse');
  void node.offsetWidth;
  node.classList.add('pulse');
}

function showFact(index) {
  if (!state.facts.length) {
    $('#fact-label').textContent = '';
    $('#fact-text').textContent = 'No facts in the data yet.';
    return;
  }
  state.factIndex = index % state.facts.length;
  const fact = state.facts[state.factIndex];
  $('#fact-label').textContent = fact.label;
  $('#fact-text').textContent = fact.text;
}

// Since you opened this page: events in the data newer than the moment this page opened. It never goes down.
function renderSince() {
  const count = state.apps.reduce((total, app) => total + timestamps(app).filter((t) => t > openedAt).length, 0);
  state.since = Math.max(state.since, count);
  $('#since-count').textContent = state.since.toLocaleString();
}

function renderWeekNews() {
  const items = state.apps
    .flatMap((app) => weekFor(app, state.end).merged.map((p) => ({ app, p, t: Date.parse(p.merged_at) })))
    .sort((a, b) => b.t - a.t)
    .slice(0, 10)
    .map(({ app, p }) => el('li', {}, `${app.name}: ${plainTitle(p.title)}`));
  $('#weekly-news').replaceChildren(...(items.length ? items : [el('li', {}, 'No changes merged in the last 7 days in our data.')]));
}

function renderDownloads() {
  $('#downloads').replaceChildren(...state.apps.map((app) => {
    const item = el('li');
    item.append(el('a', { href: `https://github.com/${app.repo}/releases`, rel: 'noopener' }, `${app.name} · github.com/${app.repo}/releases`));
    return item;
  }));
}

function renderPickRow() {
  $('#pick-row').replaceChildren(...state.apps.map((app) => el('a', { class: 'pick-app', href: `app.html?app=${encodeURIComponent(app.name)}` }, app.name)));
}

function render(json) {
  state.apps = json.apps;
  state.end = Date.parse(json.generated_at);
  renderHero();
  renderSince();
  renderWeekNews();
  renderDownloads();
  renderPickRow();
}

// Watch it live: the full-brightness map, with the time controls. "30 days in 30 s" starts that replay.
function setWatching(on) {
  $('#hero').classList.toggle('watching', on);
  if (on) window.scrollTo(0, 0);
}

$('#watch').addEventListener('click', () => setWatching(true));
$('#unwatch').addEventListener('click', () => setWatching(false));
$('#month').addEventListener('click', () => {
  setWatching(true);
  document.querySelector('[data-mode="month"]').click();
});

function load() {
  return fetch('data/apps.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(render);
}

load().catch((error) => {
  console.error(error);
  $('#since-date').textContent = 'Could not load the data right now. Try again in a minute.';
});

// Facts rotate every 5 seconds; the data is re-read every 2 minutes so "since you opened" can move when a real event lands.
setInterval(() => showFact(state.factIndex + 1), FACT_MS);
setInterval(() => load().catch(() => {}), REFRESH_MS);
