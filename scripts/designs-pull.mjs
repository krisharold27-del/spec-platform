// Bring the designs across from Claude Design, in one command.
//
//   npm run designs:pull            # show what would change, change nothing
//   npm run designs:pull -- --apply # actually bring them in
//   npm run designs:pull -- --from "/path/to/project"
//
// ── The problem this solves ──────────────────────────────────────────────────────────────────────
//
// There is no live connection between Claude Design and this repository. The `designs/` folder is a
// SNAPSHOT, and everything that checks the product against the designs — 167 of 167 phrases, 449 of
// 449 labels, 21 of 21 screens — is measured against that snapshot.
//
// Which means the checks can be perfectly green while the designs they are green against are three
// weeks old. That is the worst possible failure for a check: it is not wrong, it is answering a
// question nobody asked. It happened. Eighteen of twenty-one screens were a day behind while every
// number on the cockpit read 100%.
//
// The manual fix was "copy the files in", which is a step somebody has to remember, do correctly,
// and do for the WHOLE project rather than the three files they were thinking about. Sending three
// files is how eighteen screens got left behind the first time — every screen shares a nav and a
// logo, so a change to either lands on all of them at once.
//
// So: one command. It finds the project Claude Design seeded into the workspace, says exactly what
// would change, and refuses to do anything until asked twice.
//
// ── What it will not do ──────────────────────────────────────────────────────────────────────────
//
// **It never silently replaces something newer with something older.** A seeded project can be a
// stale copy from a previous session — the one in this workspace is, by two days — and blindly
// copying it in would undo real work while reporting success. Anything going backwards is called
// out and skipped unless --force says otherwise.
//
// It also never deletes. A screen that is in the repo and not in the seed is reported, never
// removed: that is exactly the shape of "somebody sent three files" and losing eighteen screens to
// it would be catastrophic and silent.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = new URL('..', import.meta.url).pathname;
const REPO_DESIGNS = join(HERE, 'designs');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const fromArg = args[args.indexOf('--from') + 1];

/**
 * Where Claude Design puts a project it has sent across.
 *
 * "Send to Claude Code Web" seeds it beside the repository rather than inside it. The list is
 * ordered by how likely each is to be the real thing, and every one is checked for actual design
 * files rather than just existing — an empty folder with the right name is not a design project.
 */
const CANDIDATES = [
  fromArg,
  join(HERE, '..', 'designs'),
  join(process.env.HOME ?? '/home/claude', 'designs'),
  join(HERE, '..', 'design'),
].filter(Boolean);

const screensIn = dir => {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.dc.html'));
  } catch { return []; }
};

const source = CANDIDATES.find(d => d && existsSync(d) && screensIn(d).length > 0);

console.log('\nBringing the designs across\n');

if (!source) {
  console.log('  Nothing to bring across — no Claude Design project was found in this workspace.');
  console.log('\n  To send one:');
  console.log('    · In Claude Design, use "Send to Claude Code Web". It seeds the WHOLE project here.');
  console.log('    · Or run /design-login once from Claude Code on your own machine, after which the');
  console.log('      project can be read directly with no export step at all.');
  console.log('\n  Send the whole project, never single files: every screen shares a nav and a logo, so');
  console.log('  sending three leaves the rest silently behind.\n');
  process.exit(2);
}

console.log(`  Found a project at ${source}`);

const mine = new Map(screensIn(REPO_DESIGNS).map(f => [f, readFileSync(join(REPO_DESIGNS, f), 'utf8')]));
const theirs = new Map(screensIn(source).map(f => [f, readFileSync(join(source, f), 'utf8')]));

const when = dir => (f) => {
  try { return statSync(join(dir, f)).mtime; } catch { return new Date(0); }
};

const added = [];
const changed = [];
const backwards = [];
const missingFromSeed = [];
const same = [];

for (const [file, text] of theirs) {
  if (!mine.has(file)) { added.push(file); continue; }
  if (mine.get(file) === text) { same.push(file); continue; }
  // Different. Which one is newer?
  const seedTime = when(source)(file);
  const repoTime = when(REPO_DESIGNS)(file);
  if (repoTime > seedTime) backwards.push({ file, seedTime, repoTime });
  else changed.push(file);
}
for (const file of mine.keys()) if (!theirs.has(file)) missingFromSeed.push(file);

const d = t => t.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

console.log(`  ${theirs.size} screens there, ${mine.size} here.\n`);

if (added.length) {
  console.log(`  NEW — ${added.length} screen(s) this repository has never had:`);
  for (const f of added) console.log(`    + ${basename(f, '.dc.html')}`);
}
if (changed.length) {
  console.log(`  UPDATED — ${changed.length} screen(s) changed in Claude Design since:`);
  for (const f of changed) console.log(`    ~ ${basename(f, '.dc.html')}`);
}
if (backwards.length) {
  console.log(`\n  OLDER — ${backwards.length} screen(s) where the sent copy is BEHIND this repository:`);
  for (const b of backwards) {
    console.log(`    ! ${basename(b.file, '.dc.html')} — sent ${d(b.seedTime)}, here ${d(b.repoTime)}`);
  }
  console.log('    Skipped. Taking these would undo real work while reporting success.');
  console.log('    Use --force only if the sent copy really is the one you want.');
}
if (missingFromSeed.length) {
  console.log(`\n  NOT IN WHAT WAS SENT — ${missingFromSeed.length} screen(s) here that the project does not have:`);
  for (const f of missingFromSeed) console.log(`    ? ${basename(f, '.dc.html')}`);
  console.log('    Kept, never deleted. This is the shape of "somebody sent a few files instead of the');
  console.log('    project" — and losing screens to that, silently, is how this went wrong before.');
}
if (same.length) console.log(`\n  ${same.length} screen(s) already identical.`);

/*
  Is the whole project behind what is already here?

  A workspace can hold a seed from a previous session, and this one does — every screen in it
  predates the repository. Offering to "add" four screens from it would mean restoring SPEC Today
  and SPEC Role, which were renamed to My Page and My Scorecard days ago. New and old look identical
  from a filename, so the only honest test is the project as a whole: if nothing in it is newer than
  what is here, it is a stale copy and nothing in it should be taken.
*/
const newest = (dir, files) => files.reduce((max, f) => {
  const t = when(dir)(f);
  return t > max ? t : max;
}, new Date(0));

const seedNewest = newest(source, [...theirs.keys()]);
const repoNewest = newest(REPO_DESIGNS, [...mine.keys()]);
const wholeProjectIsBehind = theirs.size > 0 && seedNewest < repoNewest;

if (wholeProjectIsBehind && !force) {
  console.log(`\n  THIS PROJECT IS BEHIND — nothing in it is newer than what is already here.`);
  console.log(`    Sent:  newest screen ${d(seedNewest)}`);
  console.log(`    Here:  newest screen ${d(repoNewest)}`);
  console.log('    It is a copy from an earlier session. Taking any of it would go backwards, and');
  console.log('    "new" screens in it are most likely ones that have since been renamed.');
  console.log('\n  Send the project again from Claude Design and run this once more.\n');
  process.exit(2);
}

const toWrite = [...added, ...changed, ...(force ? backwards.map(b => b.file) : [])];

if (!toWrite.length) {
  console.log('\n  Nothing to bring across. What is here is current with what was sent.\n');
  process.exit(0);
}

if (!apply) {
  console.log(`\n  ${toWrite.length} file(s) would change. Nothing has been written.`);
  console.log('  Run it for real:  npm run designs:pull -- --apply\n');
  process.exit(0);
}

for (const file of toWrite) writeFileSync(join(REPO_DESIGNS, file), theirs.get(file));
console.log(`\n  Written — ${toWrite.length} file(s) updated in designs/.`);

/*
  Keep the roll current.

  designs/screens.txt is what makes a screen going missing loud — a handoff once arrived with 22
  screens when the project had 23 and every check passed, because nothing linked to the one that
  was left out. A new screen is added to the roll here so it is protected from the moment it
  arrives; nothing is ever REMOVED from it automatically, because removal is the thing being
  guarded against and has to be a deliberate line in a diff.
*/
const rollPath = join(REPO_DESIGNS, 'screens.txt');
try {
  const text = readFileSync(rollPath, 'utf8');
  const listed = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('SPEC '));
  const names = readdirSync(REPO_DESIGNS)
    .filter(f => f.endsWith('.dc.html'))
    .map(f => f.slice(0, -'.dc.html'.length));
  const toAdd = names.filter(n => !listed.includes(n));
  if (toAdd.length) {
    const merged = [...listed, ...toAdd].sort();
    const head = text.slice(0, text.indexOf('## The roll'));
    writeFileSync(rollPath, `${head}## The roll\n\n${merged.join('\n')}\n`);
    console.log(`  Roll updated — ${toAdd.length} new screen(s) now protected: ${toAdd.join(', ')}.`);
  }
} catch {
  console.log('  No roll at designs/screens.txt, so nothing is protecting against a screen going missing.');
}

/*
  Re-checked immediately, because the whole point is the answer to "does the product match the
  designs" and that answer has just changed. Printing the old number after pulling new designs would
  be the same failure this command exists to fix.
*/
console.log('\n  Checking the product against what just arrived…\n');
for (const [label, argv] of [['the set', ['scripts/design-check.mjs']], ['headings and buttons', ['scripts/design-coverage.mjs']], ['every label', ['scripts/design-coverage.mjs', '--deep']]]) {
  try {
    const out = execFileSync('node', [join(HERE, ...argv[0].split('/')), ...argv.slice(1)], { encoding: 'utf8' });
    const line = (out.match(/(COMPLETE|INCOMPLETE)[^\n]*|(\d+) of (\d+) design phrases[^\n]*/) ?? ['—'])[0];
    console.log(`    ${label.padEnd(22)} ${line}`);
  } catch (error) {
    const out = String(error.stdout ?? '');
    const line = (out.match(/(COMPLETE|INCOMPLETE)[^\n]*|(\d+) of (\d+) design phrases[^\n]*/) ?? ['could not tell'])[0];
    console.log(`    ${label.padEnd(22)} ${line}`);
  }
}
console.log('\n  Anything short is now a real gap against current designs. Nothing has been committed.\n');
