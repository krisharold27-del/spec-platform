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

/*
  ── Where the copy is put back ───────────────────────────────────────────────────────────────────

  The first version created a scratch database on the SAME server and restored into that. It worked
  perfectly against a Postgres on this machine and failed immediately against Supabase, because a
  managed database does not let you create databases on it — which is correct of Supabase, and was
  wrong of the drill.

  It was also the wrong shape even where it was permitted. A drill that writes to the customer's own
  server to prove their backup is sound is taking a risk on the very thing it is protecting.

  So the restore target is now separate, and `--into` names it: on CI a throwaway Postgres running
  beside the job, which is torn down with the runner. The production database is only ever READ.

  With no --into it falls back to a scratch database on the same server, which is how it runs
  against a local Postgres where creating one is free and harmless.
*/
const intoArg = (() => {
  const i = process.argv.indexOf('--into');
  return i > -1 ? process.argv[i + 1] : (process.env.RESTORE_INTO ?? '').trim() || undefined;
})();

const SCRATCH = `spec_restore_drill_${Date.now()}`;
const restoreServer = intoArg ?? url;

const scratchUrl = (() => {
  const u = new URL(restoreServer);
  u.pathname = `/${SCRATCH}`;
  return u.toString();
})();
/** The administrative connection used to create and drop the scratch database. */
const adminUrl = (() => {
  const u = new URL(restoreServer);
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
say(`  Restoring into: ${intoArg ? new URL(intoArg).host + ' (a throwaway server, not this one)' : 'a scratch database on the same server'}`);
say('  The database being tested is only ever READ.\n');

/*
  Supabase's transaction pooler cannot be dumped.

  Port 6543 is the transaction pooler — right for an app, wrong for pg_dump, which needs session
  state the pooler does not keep. It fails with something opaque about prepared statements or a lost
  connection, and nobody would guess the port was the reason. Said here, plainly, before the attempt.
*/
if (live && new URL(url).port === '6543') {
  say('  ! This is the transaction pooler (port 6543). pg_dump cannot use it — it needs the session');
  say('    connection. In Supabase, take the connection string marked "Session pooler" or change the');
  say('    port to 5432, and use that here.\n');
}

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
  const why = String(error.stderr || error.message).trim();
  say('THE DRILL COULD NOT FINISH — which is itself the answer worth having.');
  say(`  ${why.split('\n').slice(0, 6).join('\n  ')}`);
  /*
    Also as a GitHub annotation. A CI failure whose reason is only in the log is a reason nobody
    reads — and on a locked-down machine the log may not be reachable at all, which is exactly the
    situation this was debugged from.
  */
  if (process.env.GITHUB_ACTIONS) {
    const oneLine = why.split('\n').filter(Boolean).slice(0, 3).join(' · ').replace(/[\r%]/g, '').slice(0, 600);
    console.log(`::error title=Restore drill::${oneLine || 'no reason given'}`);
  }
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
