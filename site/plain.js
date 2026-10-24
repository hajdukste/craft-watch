// Plain words for people who are not developers. Built from public PR titles, issue dates and release dates only.
// Titles are tidied by rule (prefixes and numbers removed), not rewritten by an AI. Signals, not a guarantee.
import { FOOTER } from './wording.js';

const DAY = 24 * 3600e3;
export const GROUPS = ['New', 'Fixed', 'Faster', 'Languages', 'Other changes'];

// Removes prefixes such as "fix(ui):", "M7:", "[Bug]", and numbers such as "(#4103)" or "#123".
export function plainTitle(title) {
  let t = (title ?? '').trim();
  t = t.replace(/^\[[^\]]+\]\s*/, '');
  t = t.replace(/^[a-z][a-z0-9]*(\([^)]*\))?!?:\s*/i, '');
  t = t.replace(/^M\d+[:\s-]+/i, '');
  t = t.replace(/\s*\(#\d+(?:,\s*#\d+)*\)/g, '');
  t = t.replace(/\s*#\d+\b/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return 'A change was merged';
  const sentence = t.charAt(0).toUpperCase() + t.slice(1);
  return sentence.length > 110 ? `${sentence.slice(0, 107)}…` : (/[.!?…]$/.test(sentence) ? sentence : `${sentence}.`);
}

// Which plain group a change belongs to, from its title words.
export function groupOf(title) {
  const t = (title ?? '').toLowerCase();
  if (/translat|locali[sz]|language|\bi18n\b|\bl10n\b|catalog rows/.test(t)) return 'Languages';
  if (/\bperf|faster|speed|optimi[sz]|quicker|lag\b/.test(t)) return 'Faster';
  if (/^(fix|bug|crash|repair|resolve|patch)|\b(fix|fixes|crash|bug|broken|wrong|stops?)\b/.test(t)) return 'Fixed';
  if (/^(feat|add|allow|new|support|introduce|enable|implement)|\b(new|support|add|adds|added)\b/.test(t)) return 'New';
  return 'Other changes';
}

// Everything the plain views need for one app, measured over the last 7 days.
export function weekFor(app, end) {
  const since = end - 7 * DAY;
  const merged = (app.pulls_recent ?? [])
    .filter((p) => p.merged_at && Date.parse(p.merged_at) >= since)
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
  const counts = { New: 0, Fixed: 0, Faster: 0, Languages: 0, 'Other changes': 0 };
  for (const p of merged) counts[groupOf(p.title)] += 1;
  const issues = app.issues_recent ?? [];
  const reported = issues.filter((i) => Date.parse(i.created_at) >= since).length;
  const fixed = issues.filter((i) => i.closed_at && Date.parse(i.closed_at) >= since).length;
  const latest = app.releases?.latest?.published_at ? Date.parse(app.releases.latest.published_at) : null;
  return { merged, counts, reported, fixed, latestRelease: latest };
}

// "17 h ago", "3 days ago", or a plain fallback.
export function agoText(t, end) {
  if (t === null || t === undefined) return 'no release in our data yet';
  const hours = Math.round((end - t) / 3600e3);
  if (hours < 1) return 'less than an hour ago';
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// Traffic-light words for the three levels (the colours come from verdicts.js).
export const LIGHT_WORDS = {
  green: { dot: '🟢', words: 'looks calm' },
  yellow: { dot: '🟡', words: 'wait a day' },
  red: { dot: '🔴', words: 'update now' },
  grey: { dot: '⚪', words: 'no release yet' },
};

// The one-line meaning that goes next to every number on the plain views.
export const MEANING = {
  reported: 'problems people reported this week',
  fixed: 'closed this week',
  openReports: 'Busy apps get many reports; what matters is how fast they are fixed',
  fixes: 'changes that fix something',
  features: 'changes that add something new',
  changesToday: 'code changes opened or merged today, across all apps',
  commits: 'code saves on the main branch in the last 30 days',
  releasesWeek: 'new versions published in the last 7 days',
};

export { FOOTER };

// What's new keeps user-facing changes only: no CI, tests, chores, releases or internal work.
const INTERNAL_START = /^\s*\[?(ci|test|tests|chore|build|deps?|dependencies|release|releases|docs?|style|refactor|wip|merge|revert|bump|lint|nightly|internal)\b/i;
const INTERNAL_WORDS = /\b(ci|workflow|workflows|pipeline|clippy|fmt|lints?|nightly|fuzz|fuzzing|nextest|wasm|msrv|cargo|npm|dependabot|changelog|release notes?|internal|refactor|unit tests?|test suite|coverage|gate)\b/i;
export function isUserFacing(title) {
  return !INTERNAL_START.test(title ?? '') && !INTERNAL_WORDS.test(title ?? '');
}

// A sentence with file names, code words or a leftover "Issue." fragment is skipped.
const CODE_WORDS = /\.(rs|js|mjs|ts|tsx|toml|lock|json|md|ya?ml|png|svg|wasm|pdf|xml|crate|html|css)\b|[a-z]+_[a-z_]+|\w\(\)|::|--[a-z]|`|\bfn\b|\bimpl\b|\bstruct\b|\bcrate\b|(^|[\s"'(])\/[A-Za-z]/i;
const FRAGMENT_START = /^Issue[.:]\s/i;
export function isPlainSentence(sentence) {
  return !CODE_WORDS.test(sentence) && !FRAGMENT_START.test(sentence.trim());
}
