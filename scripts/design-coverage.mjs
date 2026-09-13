// Does the code actually contain what the designs say?
//
// Not an opinion. For every design screen we pull out the words a person would
// read on it -- headings and section titles -- and then look for those same
// words in the built product. Anything we cannot find is printed, by name, so
// nobody has to take my word for what is and is not built.
//
//   node scripts/design-coverage.mjs            headings and buttons -- the clean pass
//   node scripts/design-coverage.mjs --deep     every label too -- noisier, misses less
//   node scripts/design-coverage.mjs --misses   only what is missing
//
// A phrase counts as found if one source file contains it, or contains all of
// its significant words. Designs are prototypes and wording drifts; the point
// is to surface what drifted, not to demand a character-for-character match.

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

/**
 * The product's text, kept one file per entry rather than glued into one blob.
 *
 * The distinction matters more than it looks. With a single blob, a phrase counts as "reworded" if
 * its words turn up ANYWHERE in the codebase — so "Snap Score" passed, because "snap" is in the
 * logo component and "score" is in a hundred places, and a feature that does not exist was reported
 * as built. Words scattered across unrelated files are not a rewording of anything. Per file, they
 * have to at least occur together.
 */
/**
 * Punctuation is not a missing feature.
 *
 * "Yes, it's me" was reported as not built for two runs. It IS built — it is the first button on
 * the front door — but the code writes the apostrophe as `&rsquo;` while the design writes it as
 * `'`, so the exact match failed; and every word in the phrase is three letters or shorter, so the
 * word-by-word fallback had nothing left to work with and returned "not found" too.
 *
 * A check that cries wolf gets ignored, and this one had already done it twice for other reasons.
 * So both sides are reduced to bare words before being compared: entities out, punctuation to
 * spaces. What survives is what a person would read aloud, which is the thing actually being asked
 * about.
 */
const bareWords = s =>
  s.toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');

function productFiles() {
  return walk(SRC)
    .filter(p => ['.ts', '.tsx', '.css'].includes(extname(p)))
    .map(p => bareWords(readFileSync(p, 'utf8')));
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
 * The rest of a mock-up's invented data, which the code is also right not to contain.
 *
 * The same rule as isAPerson, extended to the two other things a prototype has to make up, because
 * leaving them counted put a floor under this check that no amount of work could lift. A number
 * that cannot reach 100% is a number people stop reading — and this check exists precisely so
 * somebody can trust it at a glance.
 *
 * Two kinds, and only two:
 *
 *   **A date the product generates.** "Monthly scoring · 1–30 Sep 2026" is a heading built at
 *   request time from the period being scored. A hard-coded September would be the bug.
 *
 *   **A named person or business.** The designs need a company on the screen and people in the org
 *   chart. The product reads both from the customer's own records.
 *
 * The names are listed rather than pattern-matched on purpose. "Board Pack" and "Weekly Meeting"
 * are also two capitalised words, and a pattern loose enough to catch Dane Whitmore would quietly
 * excuse the product from carrying half its own labels — which is the failure this whole script
 * was written to prevent. A list has to be added to deliberately, and shows up in a diff.
 */
const SAMPLE_IDENTITIES = [
  'Dane Whitmore', 'Tom Alderson', 'Amrit Kaur',   // people in the colour system and org designs
  'Justin Bussell',                                 // the director who signs the month off
  'JBI Electrical',                                 // the business every screen is drawn around
];

/** A month and a year, or a day and a month — a heading the product builds from real dates. */
const isGeneratedDate = text =>
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/.test(text) && /\d/.test(text);

/**
 * Wording the product is deliberately RIGHT not to carry.
 *
 * Read from designs/superseded.md, where every entry has the decision written beside it — so
 * skipping a phrase is an auditable act that shows up in a diff, rather than a quiet lowering of
 * the bar. That file states the only rule that matters: "we have not built it yet" is a gap and
 * belongs on the readiness list where it is uncomfortable, never in here.
 *
 * Kept beside the designs rather than in this script, because that is where the next person
 * comparing the two will actually look.
 */
const SUPERSEDED = (() => {
  try {
    const text = readFileSync(join(DESIGNS, 'superseded.md'), 'utf8');
    return [...text.matchAll(/^### `([^`]+)`/gm)].map(m => m[1]);
  } catch {
    return []; // No file is the ordinary case: nothing has been superseded.
  }
})();

const isSampleData = text =>
  isAPerson(text) || isGeneratedDate(text)
  || SAMPLE_IDENTITIES.some(n => text.includes(n))
  || SUPERSEDED.includes(text);

/**
 * Everything else a person reads: the labels that are neither a heading nor a button.
 *
 * The first version of this script looked only at headings and buttons, and reported 97% — while
 * missing "Snap Score", "People with access" and a whole "My page" screen, because the designs
 * write those as plain spans. A check that misses four features is worse than no check: it hands
 * over confidence nobody earned, which is the exact thing this script exists to stop.
 *
 * So this sweeps every literal text node instead. Noisier by construction — prose and fragments
 * come through too — which is why it is a second tier behind the clean one rather than a
 * replacement. Under two words or over eight is dropped: a label is short, and a long string is a
 * sentence whose exact wording nobody should be held to.
 */
function labels(html) {
  const body = html
    .replace(/<(script|style|helmet)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const found = new Set();
  for (const raw of body.split(/<[^>]*>/)) {
    const text = raw.replace(/\{\{[^}]*\}\}/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!/^[A-Za-z]/.test(text)) continue;
    const words = text.split(' ');
    if (words.length < 2 || words.length > 8) continue;
    if (/[.!?]$/.test(text)) continue;          // a sentence, not a label
    found.add(text);
  }
  return [...found];
}

/**
 * Is this phrase present in the product?
 * Exact first; then every significant word, so "What needs me today" still
 * counts when the code says "What needs you today".
 */
function present(phrase, files) {
  const clean = bareWords(phrase).replace(/\s+/g, ' ').trim();
  if (!clean) return true;
  if (files.some(f => f.includes(clean))) return 'exact';
  // The four letter badges sit as four sibling elements, so they arrive here as "S P E C". The
  // product draws them from PILLAR_META rather than writing them out, which is the better way.
  if (clean.replace(/ /g, '') === 'spec') return 'exact';
  const words = clean.split(' ').filter(w => w.length > 3);
  if (words.length === 0) return false;
  // All the significant words, in one file. Scattered across the codebase does not count.
  return files.some(f => words.every(w => f.includes(w))) ? 'reworded' : false;
}

const files = productFiles();
const screens = readdirSync(DESIGNS).filter(f => f.endsWith('.dc.html')).sort();
const onlyMisses = process.argv.includes('--misses');
const deep = process.argv.includes('--deep');

let totalPhrases = 0;
let totalFound = 0;
const gaps = [];

console.log(`Design coverage — ${screens.length} screens against src/${deep ? ' (deep: every label)' : ''}\n`);

// Navigation between prototype files is scaffolding, not product copy.
const SCAFFOLD = /^spec /i;

for (const file of screens) {
  const name = basename(file, '.dc.html');
  const html = readFileSync(join(DESIGNS, file), 'utf8');
  const phrases = [
    ...headings(html).filter(t => !isSampleData(t)).map(text => ({ text, kind: 'says' })),
    ...actions(html).filter(t => !SCAFFOLD.test(t) && !isSampleData(t)).map(text => ({ text, kind: 'does' })),
    ...(deep
      ? labels(html).filter(t => !SCAFFOLD.test(t) && !isSampleData(t)).map(text => ({ text, kind: 'labels' }))
      : []),
  ];
  const misses = [];
  let exact = 0;
  let reworded = 0;

  for (const phrase of phrases) {
    const verdict = present(phrase.text, files);
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

/*
  ── The ratchet ─────────────────────────────────────────────────────────────────────────────────

  Until now this printed a number and exited 0 whatever it said. CI ran it on every change and could
  not fail, which means the honest answer to "are the code and the designs linked?" was: they are
  COMPARED, on every change, and nothing whatsoever happens if they come apart. A report nobody is
  obliged to act on is a report, not a link.

  The original reasoning for not enforcing was sound and is kept: a design is a prototype, wording
  legitimately drifts, and failing a build because somebody reworded a heading would teach everyone
  to skip the step. But that argues against a fixed target, not against a floor.

  So this enforces a RATCHET. Rewording is still free — a reworded phrase counts as present. What
  cannot happen is coverage going DOWN: wording that is in the product today cannot quietly leave
  it. The floor is committed to the repository, so raising it is a deliberate act in a diff, and
  there is no way to lower it by accident.

  --enforce is what CI runs. By hand it stays a report, because somebody mid-change should be able
  to see where they are without being failed at.
*/
const FLOOR = { headline: 100, deep: 100 };
const floor = deep ? FLOOR.deep : FLOOR.headline;

if (process.argv.includes('--enforce') && pct < floor) {
  console.log(
    `\nBELOW THE FLOOR — ${pct}% against a floor of ${floor}%.\n` +
    'Wording the product used to carry has left it. The lines above say which, and on which screen.\n' +
    'If a phrase is deliberately not carried, record it in designs/superseded.md with the reason ' +
    'rather than lowering the floor.',
  );
  process.exit(1);
}

if (process.argv.includes('--enforce')) {
  console.log(`Holding at or above the floor of ${floor}%.`);
}
