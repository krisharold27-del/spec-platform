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
const SEED = new URL('../seed', import.meta.url).pathname;

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

/**
 * Every source file, as bare words.
 *
 * ── The limit of this check, stated rather than discovered ───────────────────────────────────────
 *
 * This asks whether a phrase EXISTS in the source, not whether anybody can see it. A sentence
 * sitting in a constant that no page renders counts as covered, and on 17 September one did: the
 * virtual-GM copy was written into a lib, reported at 100%, and was on no screen at all.
 *
 * That is not a bug to fix here — a source scan cannot know what renders — it is the reason this
 * check is not the last word. What a person actually sees is proven by the browser journeys, which
 * is where the pinned screens are held. Read a 100% here as "the words are written", never as "the
 * words are on the page".
 */
function productFiles() {
  /*
    `seed/` is part of the product, not test data.

    It holds the twelve training modules a business is actually taught, the criteria templates every
    new tenant is provisioned from and the rulebook — content SPEC ships and a customer reads. This
    scan looked only at `src/`, so "Finish psychosocial safety basics" was reported as wording the
    code does not carry, while `seed/training_modules.json` has carried a module called
    "Psychosocial safety basics" all along. A check that reports a real feature as missing gets
    argued with once and ignored afterwards, which costs more than the gap it found.
  */
  return [...walk(SRC), ...walk(SEED)]
    .filter(p => ['.ts', '.tsx', '.css', '.json'].includes(extname(p)))
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
  /*
    The jobs those people are drawn working on.

    Added when the `scripted()` tier arrived: the My Page prototype builds its task list as
    `{ label }` objects, so seven invented jobs — "Harbourview stage 2 rough-in with Ruby",
    "Send the Northline stage 3 quote" — came through as affordances the product was missing. They
    are a customer's own work, read from their records. Listed here beside the people for the same
    reason the people are listed: a pattern loose enough to catch a site name would also catch half
    the product's real labels.
  */
  'Harbourview', 'Northline', 'Kelvin Rd', 'Ruby',
  /*
    The Tech Day design's tech and supervisor ("Morning, Sione", "J-4417 · Tom Reyes supervising").
    The phone greets whoever is signed in by their own first name, and a job's supervisor will come
    from the business's own records.
  */
  'Sione', 'Tom Reyes',
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
const supersededFile = (() => {
  try { return readFileSync(join(DESIGNS, 'superseded.md'), 'utf8'); }
  catch { return ''; } // No file is the ordinary case: nothing has been superseded.
})();

const SUPERSEDED = [...supersededFile.matchAll(/^### `([^`]+)`/gm)].map(m => m[1]);

/**
 * Whole screens that are references rather than product screens.
 *
 * A design project holds explorations, palettes and logo studies alongside the screens that get
 * built. Holding the code to a logo study's wording would mean shipping a page about logo options
 * to customers — so those screens are named in designs/superseded.md, with the reasoning, and
 * skipped entirely. Same rule as everything else in that file: a deliberate line in a diff.
 */
const REFERENCE_SCREENS = [...supersededFile.matchAll(/^### Screen: (.+)$/gm)].map(m => m[1].trim());

/**
 * Screens the designs have and the product does not — designs/not-built-yet.md.
 *
 * A new screen in an export is not a regression in the product, so it must not turn this check red
 * on the day it arrives: the pressure would then be to delete the screen from the set. But it must
 * not vanish either, which is what putting it in superseded.md would do — that file is for
 * references, and a real screen nobody has built yet is not a reference.
 *
 * So a screen named there is left out of the percentage AND printed on every run, with the date it
 * arrived. Adding one is a line in a diff with a reason next to it.
 */
const notBuiltFile = (() => {
  try { return readFileSync(join(DESIGNS, 'not-built-yet.md'), 'utf8'); }
  catch { return ''; } // No file is the ordinary case: everything drawn has been built.
})();
const NOT_BUILT = [...notBuiltFile.matchAll(/^### Screen: (.+)$/gm)].map(m => m[1].trim());

/**
 * Screens held to the design WORD FOR WORD — designs/pinned.md.
 *
 * Kris, 16 September: *"make sure the landing page and my page are always perfect"*.
 *
 * Everywhere else a reworded match counts, and that is right: the product is not a transcription of
 * a prototype, and a check that forbade every improvement would be edited out within a week. It is
 * the wrong standard for the first thing a stranger sees and the thing a customer opens every
 * morning, where "close enough" is how a page drifts a word at a time until it is nobody's design.
 *
 * A phrase that only matches loosely on a pinned screen fails the build, by name. The exceptions are
 * listed in the same file with a reason each, because an allowance nobody can read is an allowance
 * that grows.
 */
const pinnedFile = (() => {
  try { return readFileSync(join(DESIGNS, 'pinned.md'), 'utf8'); }
  catch { return ''; }
})();
const PINNED = [...pinnedFile.matchAll(/^### Screen: (.+)$/gm)].map(m => m[1].trim());
const MAY_DIFFER = new Set(
  [...pinnedFile.matchAll(/^### `([^`]+)`\s*—\s*(.+)$/gm)].map(m => `${m[1].trim()}::${m[2].trim()}`),
);
/** Phrases on pinned screens that matched only loosely and are not allowed to. */
const drifted = [];

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
 * The labels the prototypes BUILD rather than write — and the reason this tier exists.
 *
 * ── How a check reporting 100% hid five missing features ─────────────────────────────────────────
 *
 * On 18 September Kris opened the org chart and said it was not the same as the design. He was
 * right: the design offered a right-click menu with "Add a direct report", "Rename role & person",
 * "Break the link", "Make this role vacant" and "Remove role", and the product had none of them —
 * no menu, and no way to rename a role anywhere in SPEC at all.
 *
 * This script said 100%. All three tiers above read the design's MARKUP, and `labels()` opens by
 * deleting every `<script>`. The prototype builds its menu in its class body, as an array of
 * `{ label }` objects — so the five things the chart could not do were the five things this check
 * was structurally incapable of looking for. It did not fail quietly; it passed loudly, screen by
 * screen, and printed the word "complete". That is worse than no check at all.
 *
 * So this tier reads only what the others throw away. Menus, toasts, status lines and empty states
 * are where a prototype keeps its verbs — which makes them exactly where a product goes missing.
 */
function scripted(html) {
  const found = new Set();
  for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    // Comments first: a prototype explains itself in prose, and prose is not an affordance.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    /*
      `label:` alone, and the narrowness is the point.

      The first cut also took `title:`, `heading:` and `detail:`, and went from five real findings to
      thirty-three — because in these prototypes those keys hold the seeded demo rows: Harbourview
      stage 2, Tom Alderson, Dispatch Coordinator. Every one of them would have needed an entry on an
      exception list, and a check that has to be argued down before it can be read is a check nobody
      reads. `label:` is the key the prototypes use for a thing you can DO, which is the one thing
      the three tiers above cannot see.
    */
    for (const [, text] of code.matchAll(/\blabel\s*:\s*'([^'\\]{4,60})'/g)) found.add(text);
    for (const [, text] of code.matchAll(/\blabel\s*:\s*"([^"\\]{4,60})"/g)) found.add(text);
  }
  return [...found]
    .map(t => t.replace(/\s+/g, ' ').trim())
    // Same floor as `labels()`: one word is not a label, and a long one is a sentence.
    .filter(t => /^[A-Za-z"]/.test(t) && t.split(' ').length >= 2 && t.split(' ').length <= 9);
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

/*
  "All pages" is the prototype's index — a link from every .dc.html to the list of the others.

  It is navigation between DESIGN FILES, not a thing a customer ever sees, and holding the product
  to it would mean shipping a page listing our own screens. It appeared as "reworded" on eight
  screens, which flattered the number on all eight.

  Kept as a named string rather than folded into SCAFFOLD, because SCAFFOLD is "anything starting
  with SPEC" and this is one specific link with one specific reason.
*/
const PROTOTYPE_INDEX = ['All pages'];
const isScaffold = t => SCAFFOLD.test(t) || PROTOTYPE_INDEX.includes(t.trim());

for (const file of screens) {
  const name = basename(file, '.dc.html');
  // A reference page — a logo study, a palette — is design thinking, not a screen anybody signs in
  // to see. Named in designs/superseded.md with its reasoning, and skipped whole.
  if (REFERENCE_SCREENS.includes(name)) continue;
  // Drawn but not built. Counted nowhere and announced at the end — never silently dropped.
  if (NOT_BUILT.includes(name)) continue;
  const html = readFileSync(join(DESIGNS, file), 'utf8');
  const phrases = [
    ...headings(html).filter(t => !isScaffold(t) && !isSampleData(t)).map(text => ({ text, kind: 'says' })),
    ...actions(html).filter(t => !isScaffold(t) && !isSampleData(t)).map(text => ({ text, kind: 'does' })),
    ...(deep
      ? labels(html).filter(t => !isScaffold(t) && !isSampleData(t)).map(text => ({ text, kind: 'labels' }))
      : []),
    // Always on, deep or not. This is the tier that was missing when the chart lost its menu, and a
    // gap that only shows under a flag is a gap nobody sees.
    ...scripted(html).filter(t => !isScaffold(t) && !isSampleData(t)).map(text => ({ text, kind: 'menu' })),
  ];
  const misses = [];
  let exact = 0;
  let reworded = 0;
  const rewordedHere = [];

  for (const phrase of phrases) {
    const verdict = present(phrase.text, files);
    if (verdict === 'exact') exact++;
    else if (verdict === 'reworded') {
      reworded++;
      // `--show-reworded` names them. Worth having permanently: "17 reworded" is a number, and the
      // question anybody actually has is WHICH — especially for a screen held to exact wording.
      if (process.argv.includes('--show-reworded')) rewordedHere.push(phrase.text);
      // On a pinned screen, close enough is not enough — unless it is written down why.
      /*
        A pinned screen is held word for word — but not this tier.

        `scripted()` reads the strings a prototype BUILDS, and a prototype builds two different
        kinds: the verbs on a menu, and the rows it invents to have something on the screen. My Page
        is pinned, and the moment this tier arrived it reported five drifts — "Log the weekly
        meeting", "Book two ticket renewals before month end" — which are tasks SPEC writes from a
        real business's real month. Holding the product to the prototype's wording there would mean
        hard-coding somebody else's to-do list. The question this tier asks is whether the
        affordance exists, not whether the sentence matches.
      */
      if (phrase.kind !== 'menu' && PINNED.includes(name) && !MAY_DIFFER.has(`${name}::${phrase.text}`)) {
        drifted.push(`${name} — ${phrase.text}`);
      }
    }
    else misses.push(phrase);
  }

  totalPhrases += phrases.length;
  totalFound += exact + reworded;
  if (misses.length) gaps.push({ name, misses });

  if (onlyMisses && !misses.length) continue;
  const bar = misses.length === 0 ? 'all present' : `${misses.length} not found`;
  console.log(`${name.padEnd(24)} ${String(phrases.length).padStart(3)} phrases  ${String(exact).padStart(3)} exact  ${String(reworded).padStart(3)} reworded  ${bar}`);
  for (const t of rewordedHere) console.log(`    reworded: ${t}`);
  for (const miss of misses) console.log(`    no ${miss.kind === 'does' ? 'action' : 'wording'} in code: ${miss.text}`);
}

/*
  Rounded DOWN, and 100 is only ever printed when every phrase is really there.

  It used to round to nearest. On 16 September the deep run was 470 of 472 — two lines of the People
  screen that the product did not carry — and it printed "100%", directly under a line saying two
  were not found, and then "holding at or above the floor of 100%". So the page said the product
  matched the designs while the same page listed where it did not.

  Two phrases is a small gap. A check that reports a small gap as no gap is not a small problem: it
  is the difference between a number somebody can trust and a number that is 100% whenever it is
  close enough, which is every number nobody checks.
*/
const exact = totalPhrases ? (totalFound / totalPhrases) * 100 : 100;
const pct = totalFound === totalPhrases ? 100 : Math.min(99, Math.floor(exact));
console.log(`\n${totalFound} of ${totalPhrases} design phrases appear in the product (${pct}%).`);

/*
  Said after the number and before the verdict, so a green run can never be read as "everything the
  designs draw exists". The percentage is about the screens that HAVE been built; this line is the
  rest of the truth.
*/
if (NOT_BUILT.length) {
  console.log(
    `\nNOT BUILT YET — ${NOT_BUILT.length} screen(s) the designs have and the product does not: `
    + `${NOT_BUILT.join(', ')}.`,
  );
  console.log('They are left out of the number above. designs/not-built-yet.md says why, and since when.');
}
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

/*
  The pinned screens, reported before the verdict and enforced alongside the floor.

  Named individually, because "2 phrases drifted" sends somebody hunting and "SPEC Landing — Talk to
  us" sends them to the line.
*/
if (drifted.length) {
  console.log(`\nDRIFTED FROM THE DESIGN — ${drifted.length} phrase(s) on a pinned screen match only loosely:`);
  for (const d of [...new Set(drifted)]) console.log(`  ${d}`);
  console.log('These screens are held word for word. designs/pinned.md says which two, and why.');
}

if (process.argv.includes('--enforce') && drifted.length) {
  console.error(
    '\nA PINNED SCREEN HAS DRIFTED.\n'
    + 'The landing page and My Page are held to the design word for word — the first thing a stranger\n'
    + 'sees and the thing a customer opens every morning. Put the wording back, or, if the product is\n'
    + 'right and the design is not, write the reason into designs/pinned.md so it is a line in a diff.',
  );
  process.exit(1);
}

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
