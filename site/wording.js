// The wording rules for every security and update sentence on the site. Use these strings, never write new ones.
// Rules:
//  - Say who reported it and what we saw: "The maintainers published…", "A change mentions…", "We found no…".
//  - Never use: safe, unsafe, secure, vulnerable, dangerous, at risk, hole, exploit.
//  - "Nothing found" is "We found no published security advisories for this version." Never "no security issues".
//  - A title with a general security word is "changes mention hardening", never "security fixes".
//  - Every answer ends with FOOTER.
export const FOOTER = 'Based on public GitHub records only. Signals, not a guarantee.';

export const NOTHING_FOUND = 'We found no published security advisories for this version.';

export const HARDENING = 'changes mention hardening';

const ADVISORY_ID = /RUSTSEC-\d{4}-\d{4}|GHSA-[\w-]+|CVE-\d{4}-\d+/i;

// The advisory a title names: an advisory ID, or a package from an advisory. Null when it names none.
export function advisoryRef(title, packages = []) {
  const id = ADVISORY_ID.exec(title ?? '');
  if (id) return id[0].toUpperCase();
  const words = (title ?? '').toLowerCase().split(/[^a-z0-9_-]+/);
  return packages.find((name) => words.includes(name.toLowerCase())) ?? null;
}

// What a change's title shows, in one short phrase.
export function signalFor(title, packages = []) {
  const ref = advisoryRef(title, packages);
  if (ref) return `A change mentions ${ref}`;
  return HARDENING[0].toUpperCase() + HARDENING.slice(1);
}

// The one-line reason shown under a verdict or on hover: what we saw, then the footer.
export function withFooter(sentence) {
  return `${sentence} ${FOOTER}`;
}
