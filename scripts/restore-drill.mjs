// Take a backup, put it back, and prove it came back whole.
//
//   npm run restore-drill                 # the database in .env.local
//   npm run restore-drill -- "<url>"      # any database, including the live one
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// The cockpit's readiness list said it plainly: **a backup nobody has restored is a belief, not a
// backup.** Backups are the one part of a system that is never exercised by ordinary use. Every
// other feature is tested by somebody using it; a backup is tested by a disaster, which is the
// worst possible moment to find out the file was empty, the extensions were missing, or the restore
// takes six hours.
//
// So this rehearses the disaster while nothing is wrong:
//
//   1. Dump the database.
//   2. Restore it into a brand-new scratch database beside it.
//   3. Count every row in both and compare them, table by table.
//   4. Delete the scratch database.
//
// Step 3 is the one that makes it a drill rather than a ritual. A dump that runs without error and
// a restore that runs without error still prove nothing: the question is whether the DATA is there,
// and the only answer worth having is a count of every row in every table, matching.
//
// ── What it will not do ──────────────────────────────────────────────────────────────────────────
//
// It never writes to the database it is testing. It reads, and everything it creates it creates in
// a scratch database it made itself and removes at the end. Running this against production is
// therefore safe, and is the point: a drill against a database that is not the real one is a drill
// against a different risk.

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function databaseUrl() {
  const given = process.argv[2]?.trim();
  if (given) return given;
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const line = text.split('\n').find(l => /^\s*DATABASE_URL\s*=/.test(l));
    return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  } catch { return undefined; }
}

const url = databaseUrl();
if (!url) {
  console.error('\nNo database given, none in DATABASE_URL, and none in .env.local.');
  console.error('  npm run restore-drill -- "postgres://…"\n');
  process.exit(2);
}

/** The same server, a different database — where the copy goes. */
const SCRATCH = `spec_restore_drill_${Date.now()}`;
const scratchUrl = (() => {
  const u = new URL(url);
  u.pathname = `/${SCRATCH}`;
  return u.toString();
})();
/** The administrative connection used to create and drop the scratch database. */
const adminUrl = (() => {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
})();

const sourceName = new URL(url).pathname.replace(/^\//, '');
const host = new URL(url).host;
const live = /supabase\.(co|com)/i.test(host);

const say = s => console.log(s);
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

const psql = (target, sql) => run('psql', [target, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]).trim();

/** Every table and how many rows it holds. The only answer that proves anything. */
function rowCounts(target) {
  const tables = psql(target, `
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)
    .split('\n').filter(Boolean);
  const counts = new Map();
  for (const t of tables) counts.set(t, Number(psql(target, `select count(*) from "${t}"`)));
  return counts;
}

say(`\nRestore drill — ${sourceName} on ${host}${live ? '  (the live database)' : ''}\n`);
say('  Nothing is written to it. The copy goes into a scratch database, which is removed at the end.\n');

const work = mkdtempSync(join(tmpdir(), 'spec-drill-'));
const dumpFile = join(work, 'backup.dump');
let created = false;
const t0 = Date.now();

try {
  // ── 1. What is there now ──────────────────────────────────────────────────────────────────────
  const before = rowCounts(url);
  const rows = [...before.values()].reduce((a, b) => a + b, 0);
  say(`  ${before.size} tables, ${rows.toLocaleString('en-AU')} rows.`);

  // ── 2. The backup ─────────────────────────────────────────────────────────────────────────────
  process.stdout.write('  … taking the backup');
  const tDump = Date.now();
  run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--file', dumpFile, url], { maxBuffer: 1 << 28 });
  const size = statSync(dumpFile).size;
  say(`\r  ✓ backup taken — ${(size / 1_048_576).toFixed(1)}MB in ${Math.round((Date.now() - tDump) / 1000)}s      `);

  if (size < 1024) throw new Error('the backup file is essentially empty, which is the failure this drill exists to catch');

  // ── 3. Put it back somewhere new ──────────────────────────────────────────────────────────────
  process.stdout.write('  … restoring it into a scratch database');
  const tRestore = Date.now();
  psql(adminUrl, `create database "${SCRATCH}"`);
  created = true;
  /*
    pg_restore exits non-zero for benign complaints — a comment on an extension it may not own, a
    role that does not exist here. --exit-on-error is deliberately NOT set: what decides whether
    this passed is the row counts below, not the restorer's opinion of its own tidiness. Its output
    is kept and shown if the counts disagree.
  */
  let restoreNotes = '';
  try {
    run('pg_restore', ['--no-owner', '--no-privileges', '--dbname', scratchUrl, dumpFile], { maxBuffer: 1 << 28 });
  } catch (error) {
    restoreNotes = String(error.stderr ?? '').trim();
  }
  say(`\r  ✓ restored in ${Math.round((Date.now() - tRestore) / 1000)}s                        `);

  // ── 4. Is it actually all there ───────────────────────────────────────────────────────────────
  const after = rowCounts(scratchUrl);
  const problems = [];

  for (const [table, n] of before) {
    if (!after.has(table)) { problems.push(`${table} — did not come back at all`); continue; }
    const got = after.get(table);
    if (got !== n) problems.push(`${table} — ${n.toLocaleString('en-AU')} rows became ${got.toLocaleString('en-AU')}`);
  }

  say(`\n${'─'.repeat(60)}`);
  if (problems.length) {
    say(`THE BACKUP IS NOT WHOLE — ${problems.length} of ${before.size} tables came back wrong.`);
    for (const p of problems) say(`  ✗ ${p}`);
    if (restoreNotes) say(`\n  What the restore said:\n${restoreNotes.split('\n').slice(0, 12).map(l => `    ${l}`).join('\n')}`);
    say(`${'─'.repeat(60)}\n`);
    process.exitCode = 1;
  } else {
    say(`RESTORED WHOLE — ${before.size} tables, ${rows.toLocaleString('en-AU')} rows, every count matching.`);
    say(`Taken, put back and checked in ${Math.round((Date.now() - t0) / 1000)}s. This backup is a backup, not a belief.`);
    say(`${'─'.repeat(60)}\n`);
  }
} catch (error) {
  say(`\n${'─'.repeat(60)}`);
  say('THE DRILL COULD NOT FINISH — which is itself the answer worth having.');
  say(`  ${String(error.stderr || error.message).trim().split('\n').slice(0, 6).join('\n  ')}`);
  say(`${'─'.repeat(60)}\n`);
  process.exitCode = 1;
} finally {
  // The scratch database goes, whatever happened. A drill that leaves copies of the customer
  // database lying around has created a bigger problem than the one it was rehearsing for.
  if (created) {
    try { psql(adminUrl, `drop database "${SCRATCH}" with (force)`); }
    catch { say(`  ! could not remove the scratch database ${SCRATCH} — remove it by hand.`); }
  }
  rmSync(work, { recursive: true, force: true });
}
