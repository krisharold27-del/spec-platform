// Does the code actually contain what the designs say?
//
// Not an opinion. For every design screen we pull out the words a person would
// read on it -- headings and section titles -- and then look for those same
// words in the built product. Anything we cannot find is printed, by name, so
// nobody has to take my word for what is and is not built.
//
//   node scripts/design-coverage.mjs            report
//   node scripts/design-coverage.mjs --misses   only what is missing
//
// A phrase counts as found if it appears in src/ (any file). Designs are
// prototypes, so wording drifts; the point is to surface what drifted, not to
// demand a character-for-character match.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const DESIGNS = process.env.SPEC_DESIGNS ?? new URL('../designs', import.meta.url).pathname;
const SRC = new URL('../src', import.meta.url).pathname;

/** Every file under a directory, recursively. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** One lowercase haystack of everything the product says. */
function productText() {
  return walk(SRC)
    .filter(p => ['.ts', '.tsx', '.css'].includes(extname(p)))
    .map(p => readFileSync(p, 'utf8'))
    .join('\n')
    .toLowerCase();
}

/** Flatten one element's inner markup down to the words a person reads. */
function readable(inner) {
  return inner
    .replace(/<[^>]*>/g, ' ')           // inner markup
    .replace(/\{\{[^}]*\}\}/g, ' ')     // template holes
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pull(html, tags, skipTag = () => false) {
  const found = [];
  const pattern = new RegExp(`<(${tags.join('|')})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'gi');
  let match;
  while ((match = pattern.exec(html))) {
    if (skipTag(match[2])) continue;
    const text = readable(match[3]);
    if (text.length >= 4 && text.length <= 60 && /[a-z]/i.test(text)) found.push(text);
  }
  return [...new Set(found)];
}

/** What the screen says. */
const headings = html => pull(html, ['h1', 'h2', 'h3']);

/**
 * What the screen does — every button and link a person can press.
 *
 * Links between prototype files are how the designer moves around the mock-up, not something the
 * product owes anybody: a "Overview" link pointing at `SPEC Landing.dc.html` is a table of
 * contents, and reporting it as a missing feature every run is how a report stops being read.
 * Judged on where the link GOES rather than on its label, so nothing real is skipped by accident.
 */
const actions = html => pull(html, ['button', 'a'], attrs =>
  /href="[^"]*\.dc\.html/i.test(attrs) || /href="#"/.test(attrs));

/**
 * A named person in a mock-up is data, not copy.
 *
 * "Justin Bussell, Director" is a button in the Role design because the prototype needed somebody
 * to have signed the month off. The product reads that name from the business's own records, which
 * is the correct behaviour — a hard-coded Justin would be the bug. So a "Firstname Lastname, Role"
 * label is not something the code should contain, and is not counted against it.
 */
const isAPerson = text => /^[A-Z][a-z]+ [A-Z][a-z]+, [A-Z]/.test(text);

/**
 * Is this phrase present in the product?
 * Exact first; then every significant word, so "What needs me today" still
 * counts when the code says "What needs you today".
 */
function present(phrase, haystack) {
  const clean = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return true;
  if (haystack.includes(clean)) return 'exact';
  // The four letter badges sit as four sibling elements, so they arrive here as "S P E C". The
  // product draws them from PILLAR_META rather than writing them out, which is the better way.
  if (clean.replace(/ /g, '') === 'spec') return 'exact';
  const words = clean.split(' ').filter(w => w.length > 3);
  if (words.length === 0) return haystack.includes(clean) ? 'exact' : false;
  const hits = words.filter(w => haystack.includes(w)).length;
  return hits === words.length ? 'reworded' : false;
}

const haystack = productText();
const screens = readdirSync(DESIGNS).filter(f => f.endsWith('.dc.html')).sort();
const onlyMisses = process.argv.includes('--misses');

let totalPhrases = 0;
let totalFound = 0;
const gaps = [];

console.log(`Design coverage — ${screens.length} screens against src/\n`);

// Navigation between prototype files is scaffolding, not product copy.
const SCAFFOLD = /^spec /i;

for (const file of screens) {
  const name = basename(file, '.dc.html');
  const html = readFileSync(join(DESIGNS, file), 'utf8');
  const phrases = [
    ...headings(html).map(text => ({ text, kind: 'says' })),
    ...actions(html).filter(t => !SCAFFOLD.test(t) && !isAPerson(t)).map(text => ({ text, kind: 'does' })),
  ];
  const misses = [];
  let exact = 0;
  let reworded = 0;

  for (const phrase of phrases) {
    const verdict = present(phrase.text, haystack);
    if (verdict === 'exact') exact++;
    else if (verdict === 'reworded') reworded++;
    else misses.push(phrase);
  }

  totalPhrases += phrases.length;
  totalFound += exact + reworded;
  if (misses.length) gaps.push({ name, misses });

  if (onlyMisses && !misses.length) continue;
  const bar = misses.length === 0 ? 'all present' : `${misses.length} not found`;
  console.log(`${name.padEnd(24)} ${String(phrases.length).padStart(3)} phrases  ${String(exact).padStart(3)} exact  ${String(reworded).padStart(3)} reworded  ${bar}`);
  for (const miss of misses) console.log(`    no ${miss.kind === 'does' ? 'action' : 'wording'} in code: ${miss.text}`);
}

const pct = totalPhrases ? Math.round((totalFound / totalPhrases) * 100) : 100;
console.log(`\n${totalFound} of ${totalPhrases} design phrases appear in the product (${pct}%).`);
if (gaps.length) {
  console.log(`${gaps.length} screen(s) have wording the code does not carry — listed above.`);
}
