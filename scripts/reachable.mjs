/*
  Every page a person can actually get to — so nothing can go quiet without going away.

  ── Kris, 26 September ──────────────────────────────────────────────────────────────────────────

  *"there are three absolutely critical aspects to this system - links (org chart) - kpi boards
  (flow) and mirrors to support (growth) - where the fuck are they - im furious."*

  Then, a moment later: *"im so worried about you deleting things - really really worried now."*

  Both are the same worry, and the measurement is the point. Nothing had been deleted: 80 pages
  before, 80 after; 2,869 exported functions before, 2,878 after. Scoring and Mirrors were never
  removed. They were moved out of the menu on 24 September and left in a drawer.

  To the person looking for them, that is identical to deletion. They went to find the thing and it
  was not there. `tests/surface.test.ts` — the check written that morning against deleting — would
  have passed every single run while it happened, because nothing WAS deleted.

  ── So this is the other half of that rule ──────────────────────────────────────────────────────

  A page nobody can reach is not in the product, whatever the file tree says. This walks every route
  under src/app and asks a blunt question: is there a link to it ANYWHERE in the source? Not "is it
  in the menu" — anywhere at all. A page nothing points at is an orphan, and orphans fail the build.

  The asymmetry matches the surface rule, deliberately:

    LINKING something is free — write the link, carry on.
    ORPHANING something fails, by name, and the only way past is a line in docs/UNREACHABLE.md
    saying why that page is reached another way.

  ── What it deliberately does NOT do ────────────────────────────────────────────────────────────

  It does not try to prove a page is reachable in a browser, in the right role, in the right state —
  a link inside a block nobody's permissions open is still an orphan in practice. That is a harder
  question and `scripts/core-components-journey.mjs` asks it of the components that matter most.
  This one holds the floor: no page may have nothing pointing at it at all. A floor that is actually
  enforced beats a ceiling that is aspired to.
*/
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXCUSES = 'docs/UNREACHABLE.md';

const files = (dir, test, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files(p, test, out);
    else if (test(p, e)) out.push(p);
  }
  return out;
};

/** Every route with a page, as an address. */
export function routes() {
  return files('src/app', (_p, e) => e === 'page.tsx')
    .map(p => {
      const r = `/${p.replace(/^src\/app\/?/, '').replace(/\/?page\.tsx$/, '')}`;
      return r === '/' ? '/' : r.replace(/\/$/, '');
    })
    .sort();
}

/**
 * Every address mentioned anywhere in the source.
 *
 * Deliberately generous. A link written as `href={`/jobs/${id}`}` or handed to `redirect()` counts
 * just as much as a `<Link>`, because the question is whether anything points there at all — and a
 * check that cries wolf over a real link written in an unusual way is a check people switch off.
 */
export function mentioned() {
  const found = new Set();
  for (const f of files('src', p => /\.tsx?$/.test(p))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/["'`](\/[a-z0-9\-/[\]]*)(?:["'`?#])/gi)) found.add(m[1]);
  }
  return found;
}

/** Routes that are deliberately reached some other way, and the reason, from docs/UNREACHABLE.md. */
export function excused() {
  let doc = '';
  try { doc = readFileSync(EXCUSES, 'utf8'); } catch { return new Set(); }
  return new Set([...doc.matchAll(/^- `(\/[^`]*)`/gm)].map(m => m[1]));
}

/**
 * Pages nothing points at, and nobody has written down a reason for.
 *
 * A dynamic segment is skipped: `/jobs/[id]` is never written out literally, and the parent that
 * links to it is what proves the branch is alive.
 */
export function orphans() {
  const links = mentioned();
  const said = excused();
  return routes().filter(r =>
    r !== '/' && !r.includes('[') && !links.has(r) && !said.has(r));
}

export const LEDGER_TS = 'src/lib/every-page.ts';

if (process.argv[1]?.endsWith('reachable.mjs')) {
  const all = routes();
  const lost = orphans();
  if (process.argv.includes('--write')) {
    writeFileSync(LEDGER_TS, everyPageModule());
    console.log(`Wrote ${census().length} pages to ${LEDGER_TS}.`);
  }
  console.log(`${all.length} pages; ${lost.length} that nothing links to.`);
  for (const r of lost) console.log(`  ${r}`);
  if (lost.length) process.exit(1);
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE LIST KRIS CAN CHECK HIMSELF

   Kris, 26 September: *"we really must keep an eye on the list of functions of this system - how
   can i check you have everything."*

   Fair question, and "I checked" is not an answer — it is the same answer that was true every day
   Mirrors sat in a drawer. What he needs is a page he opens himself that is GENERATED from the
   code rather than written by hand, because a hand-written list of everything is the one document
   guaranteed to fall behind.

   So this writes `src/lib/every-page.ts`: every route in the product, whether the directory lists
   it, and — for the handful it does not — the reason from docs/UNREACHABLE.md. `/pages` reads that
   and shows him the audit. `tests/reachable.test.ts` regenerates it and fails if it has gone stale,
   so the page cannot quietly stop being true.

   A TS module rather than a file read at runtime, because src/ is not deployed: a page that tried
   to walk the filesystem in production would show an empty list and call it a clean bill of health.
   ───────────────────────────────────────────────────────────────────────────── */

/** The reasons in docs/UNREACHABLE.md, keyed by route. */
export function readExcuses() {
  const out = new Map();
  let doc = '';
  try { doc = readFileSync(EXCUSES, 'utf8'); } catch { return out; }
  for (const m of doc.matchAll(/^- `(\/[^`]*)` — ([^\n]+(?:\n  [^\n-][^\n]*)*)/gm)) {
    out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Every route a person can open, and — where nothing links to it — how it is reached instead. */
export function census() {
  const said = readExcuses();
  const links = mentioned();
  return routes()
    .filter(r => !r.includes('['))
    .map(r => ({
      route: r,
      /*
        Does anything in the product point at it? A sub-page like /account/password is opened from
        /account and is perfectly findable — counting it as lost would bury the handful that really
        are, which is how a check stops being read.
      */
      linked: links.has(r),
      reachedBy: said.get(r) ?? '',
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

/** The generated module, as text. Compared against the file on disk by tests/reachable.test.ts. */
export function everyPageModule() {
  const rows = census();
  return `${[
    '/*',
    '  EVERY PAGE IN SPEC — generated, never written by hand.',
    '',
    '  Kris, 26 September: *"we really must keep an eye on the list of functions of this system -',
    '  how can i check you have everything."*',
    '',
    '  Fair question, and "I checked" is not an answer — it is the same answer that was true every',
    '  day Mirrors sat off the menu. What he needs is a page he opens HIMSELF that cannot fall',
    '  behind, and a hand-written list of everything is the one document guaranteed to.',
    '',
    '  So `scripts/reachable.mjs` walks src/app and writes this; /pages reads it and shows the',
    '  audit; `tests/reachable.test.ts` regenerates it and fails if it has gone stale. Add a page and',
    '  the build tells you to run `npm run reachable -- --write`. The list cannot quietly stop being',
    '  true.',
    '',
    '  A TS module rather than a file read at runtime, because src/ is not deployed: a page that',
    '  walked the filesystem in production would find nothing and call it a clean bill of health.',
    '*/',
    'export interface PageRow {',
    '  route: string;',
    '  /** Something in the product links to it — a menu, or the screen it belongs under. */',
    '  linked: boolean;',
    '  /** How somebody reaches it when nothing links to it. Empty for the ordinary case. */',
    '  reachedBy: string;',
    '}',
    '',
    'export const EVERY_PAGE: PageRow[] = [',
    ...rows.map(r => `  { route: ${JSON.stringify(r.route)}, linked: ${r.linked}, reachedBy: ${JSON.stringify(r.reachedBy)} },`),
    '];',
    '',
  ].join('\n')}`;
}
