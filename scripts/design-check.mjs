// Is the design set complete, and is all of it from the same export?
//
//   npm run designs:check
//   npm run designs:check -- --strict    exit non-zero when it is not
//
// The problem this exists for: designs arrived one file at a time, and nobody
// could tell that eighteen of the twenty-one screens were a day behind. It was
// only caught because a nav link happened to point at a screen that had never
// been sent. That is not a system, that is luck.
//
// The design project shares one logo across every screen, so a change to it
// lands on all of them at once. That makes a mixed folder measurable: if two
// screens carry different logos, they came from different exports. And every
// screen the navigation links to must exist as a file, or a screen has been
// designed that was never sent.
//
// It reports that the folder is mixed; it does not try to say which export is
// the newer one. Nothing in the files reliably tells you that — file dates do
// not survive copying, and the bigger group is not automatically the current
// one. Guessing would be worse than the honest answer, which is that the set
// needs re-exporting whole.
//
// Neither check knows anything about SPEC. They would work for any design
// project that shares a header.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const DESIGNS = process.env.SPEC_DESIGNS ?? new URL('../designs', import.meta.url).pathname;
const strict = process.argv.includes('--strict');

const screens = readdirSync(DESIGNS).filter(f => f.endsWith('.dc.html')).sort();
if (screens.length === 0) {
  console.log('No design screens found. Export the project into designs/ first.');
  process.exit(strict ? 1 : 0);
}

const read = file => readFileSync(join(DESIGNS, file), 'utf8');

/**
 * The shared logo, as a fingerprint for which export a screen came from.
 *
 * The first version of this compared the NAV LINKS and was useless: it found eleven groups among
 * twenty-one screens. Two reasons, both legitimate. The marketing screens carry a different bar
 * from the product screens — four links against seven — and every screen marks its own entry
 * differently, because the page you are on is not a link to itself. Neither is staleness, so
 * neither should be reported as it.
 *
 * The logo has neither problem. It is one piece of markup, identical on every screen of an export,
 * carried by the marketing and product screens alike, and it changes when the project is
 * re-exported. Two logos in one folder means two exports, with no false positives to explain away.
 */
function brandPrint(html) {
  const brand = /<a\b[^>]*class="nav-brand"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (!brand) return null;
  const markup = brand[1].replace(/\s+/g, ' ').trim();
  // Only a DRAWN mark dates a screen. Sign In sets the brand as plain words, and a screen with no
  // artwork in its header cannot disagree with one that has it — treating "no mark" as a rival
  // export reported a single sign-in page as a whole second export of the project.
  if (!/<svg|<img/i.test(markup)) return null;
  const kind = /<svg/i.test(markup) ? 'inline SVG mark' : 'image file mark';
  return { hash: createHash('sha1').update(markup).digest('hex').slice(0, 8), kind };
}

// ── Is everything from the same export? ─────────────────────────────────────────────────────────
const byBrand = new Map();
const noBrand = [];
for (const file of screens) {
  const print = brandPrint(read(file));
  if (!print) { noBrand.push(basename(file, '.dc.html')); continue; }
  if (!byBrand.has(print.hash)) byBrand.set(print.hash, { kind: print.kind, screens: [] });
  byBrand.get(print.hash).screens.push(basename(file, '.dc.html'));
}

/**
 * Every screen the CURRENT export links to, whether or not it was sent.
 *
 * Read from the newest export only, and that restriction is the point. A reference page kept from
 * an earlier export still links to screens that have since been renamed or retired — this folder
 * keeps two such pages, and both still point at "SPEC Today", which became My Page. Scanning them
 * reported a retired screen as one that had never been sent, which is a false alarm about the
 * exact thing this script exists to detect.
 */
function referenced(current) {
  const found = new Set();
  for (const file of current) {
    for (const m of read(file).matchAll(/href="([^"]*\.dc\.html)"/g)) found.add(m[1]);
  }
  return [...found].sort();
}

// ── Is anything missing? ────────────────────────────────────────────────────────────────────────
const newest = [...byBrand.values()].sort((a, b) => b.screens.length - a.screens.length)[0];
const current = newest ? newest.screens.map(n => `${n}.dc.html`) : screens;
const missing = referenced(current).filter(name => !existsSync(join(DESIGNS, name)));

const groups = [...byBrand.values()].sort((a, b) => b.screens.length - a.screens.length);

console.log(`Design set — ${screens.length} screens in ${DESIGNS.replace(process.cwd() + '/', '')}\n`);

if (missing.length) {
  console.log('Linked to, but never received:');
  for (const name of missing) console.log(`  ${name}`);
  console.log('  → these screens exist in the design project and have not been sent.\n');
}

if (noBrand.length) {
  console.log(`No logo, so no way to date them: ${noBrand.join(', ')}\n`);
}

if (groups.length > 1) {
  console.log(`${groups.length} different logos — these screens are not all from one export:`);
  groups.forEach((g, i) => {
    console.log(`\n  Export ${i + 1} — ${g.screens.length} screen(s), ${g.kind}`);
    for (const name of g.screens) console.log(`    ${name}`);
  });
  console.log('\n  → one of these is older, and the files cannot say which. Re-export the whole');
  console.log('    project so there is only one.\n');
}

// ── The verdict, in one line ────────────────────────────────────────────────────────────────────
const whole = missing.length === 0 && groups.length <= 1;
if (whole) {
  console.log(`COMPLETE — ${screens.length} screens, one export, nothing missing.`);
} else {
  const parts = [];
  if (missing.length) parts.push(`${missing.length} screen(s) missing`);
  if (groups.length > 1) {
    parts.push(`${groups.length} exports mixed together`);
  }
  console.log(`INCOMPLETE — ${parts.join(', ')}.`);
  console.log('Re-export the whole project from Claude Design ("Send to Claude Code Web")');
  console.log('rather than sending files individually, which is how screens go missing.');
}

process.exit(whole || !strict ? 0 : 1);
