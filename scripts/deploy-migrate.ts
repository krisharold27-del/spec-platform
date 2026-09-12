/**
 * Bring the database up to the build, automatically, at deploy time.
 *
 * This exists because the alternative was asking a person to run a database migration from a
 * command line at the exact moment a release goes out. That is not a reasonable thing to ask of
 * anybody, it is the step most likely to be forgotten, and forgetting it looks like the product
 * being broken rather than like a missed step.
 *
 * ── What changed on 12 September, and why it matters ─────────────────────────────────────────────
 *
 * The first version used `drizzle-kit push`, which reconciles in BOTH directions: it adds what the
 * code needs AND drops what the code no longer mentions. Dropping is how an automated deploy turns
 * into data loss, so this script refused to run at all whenever the database held anything the
 * build did not recognise, and printed the list for a person to decide about.
 *
 * The refusal was right. Its consequence was a disaster.
 *
 * One forgotten table in the live database — something from an experiment nobody remembered —
 * meant no schema change reached production again. Not once. For months. Every deploy succeeded,
 * every build was green, and the database quietly stayed where it was. By 12 September production
 * was missing NINE TABLES and SEVENTEEN COLUMNS: the improvement register, training, approvals,
 * candidates and scorecard comments had never worked for a real customer, and the owner had spent
 * weeks believing the product was broken. It was not. The tables were not there, and the mechanism
 * built to say so was politely declining to act, in a build log nobody reads.
 *
 * The lesson is not "be less careful". It is that **a safety measure whose failure mode is silence
 * is not a safety measure.** So the caution moved from refusing to act, to being incapable of the
 * thing it was afraid of:
 *
 *   lib/schema-sql generates only `create table if not exists`, `add column if not exists` and
 *   `create index if not exists`. There is no code path that emits `drop`, and a test runs the
 *   generator against an empty database and a half-built one and fails the build if any statement
 *   it produces is anything else.
 *
 * Extras in the database are now simply ignored. A forgotten table can no longer hold the whole
 * product hostage, and nothing this script can say is capable of removing a customer's data.
 *
 * IT STILL NEVER FAILS THE BUILD. An even earlier version exited non-zero when it could not reach
 * the database, and that took a deploy down — worse than the problem it solved, for reasons nobody
 * could see from outside the build sandbox. Everything it cannot do is reported by /api/health as a
 * 503 naming the exact tables and columns, and in plain words on /status.
 */
import postgres from 'postgres';
import { expectedShape, compareShape, driftLine } from '../src/lib/schema-check';
import { additivePlan, isAdditive } from '../src/lib/schema-sql';

const say = (s: string) => console.log(`[deploy-migrate] ${s}`);

/** Read the shape without importing src/db, which throws at module load when unconfigured. */
async function actualShape(url: string) {
  // `if not exists` makes Postgres emit a NOTICE for every object already there, and the driver
  // prints each one as a large object. A build log full of alarming-looking noise is how the last
  // problem stayed hidden for months, so the expected ones are swallowed and nothing else is.
  const sql = postgres(url, {
    max: 1, idle_timeout: 5, connect_timeout: 20,
    onnotice: n => { if (!/already exists, skipping/.test(n.message ?? '')) console.log(`[deploy-migrate] note: ${n.message}`); },
  });
  try {
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `;
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = out.get(r.table_name) ?? new Set<string>();
      set.add(r.column_name);
      out.set(r.table_name, set);
    }
    return out;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();

  /*
    No database configured is not a failure. The public pages — welcome, how it works, sectors,
    pricing — need no database at all, and failing the whole build here would take the marketing
    site down over a missing setting. /api/health reports the gap instead.
  */
  if (!url) {
    say('DATABASE_URL is not set, so there is nothing to migrate. Carrying on with the build.');
    return;
  }

  const expected = expectedShape();
  let actual: Map<string, Set<string>>;
  try {
    actual = await actualShape(url);
  } catch (err) {
    const message = (err as { message?: string })?.message ?? 'unknown';
    say(`Could not read the database: ${message.replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]')}`);
    say('Leaving the schema alone and letting the build through. /api/health will report the state.');
    return;
  }

  const drift = compareShape(expected, actual);
  const behind = drift.missingTables.length > 0 || drift.missingColumns.length > 0;

  if (behind) {
    say(driftLine(drift));
    if (drift.missingTables.length) say(`  tables to add: ${drift.missingTables.join(', ')}`);
    for (const c of drift.missingColumns) say(`  columns to add on ${c.table}: ${c.columns.join(', ')}`);
  } else {
    say(`The database already has every table and column this build expects (${expected.size} tables).`);
    say('Checking the indexes anyway — a missing unique index is invisible to a column check.');
  }

  const { statements, notes } = additivePlan(actual);

  /*
    The last gate, and it is deliberately redundant with the test.

    A test proves the generator only produces additive SQL. This proves it again about the exact
    strings on their way to a real customer's database, because the cost of being wrong once is
    unrecoverable and the cost of checking is nothing.
  */
  const unsafe = statements.filter(s => !isAdditive(s));
  if (unsafe.length) {
    say('STOPPING. Generated a statement that is not purely additive, which should be impossible:');
    for (const s of unsafe) say(`  ${s.slice(0, 120)}`);
    say('Nothing has been changed. Letting the build through; /api/health will name what is missing.');
    return;
  }

  if (statements.length === 0) {
    say('Nothing to do.');
    return;
  }

  // `if not exists` makes Postgres emit a NOTICE for every object already there, and the driver
  // prints each one as a large object. A build log full of alarming-looking noise is how the last
  // problem stayed hidden for months, so the expected ones are swallowed and nothing else is.
  const sql = postgres(url, {
    max: 1, idle_timeout: 5, connect_timeout: 20,
    onnotice: n => { if (!/already exists, skipping/.test(n.message ?? '')) console.log(`[deploy-migrate] note: ${n.message}`); },
  });
  let applied = 0;
  const failures: string[] = [];
  try {
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
        applied++;
      } catch (err) {
        // One statement failing must not stop the rest: an index that cannot be created is not a
        // reason to leave eight tables uncreated. Collected and reported together.
        failures.push(`${statement.slice(0, 90)} — ${(err as { message?: string })?.message ?? 'failed'}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  for (const n of notes) say(`  ${n}`);
  say(`Applied ${applied} of ${statements.length} statements.`);
  for (const f of failures) say(`  could not: ${f}`);

  // Trust nothing: read it back rather than believing the commands that just ran.
  try {
    const after = compareShape(expected, await actualShape(url));
    if (after.missingTables.length || after.missingColumns.length) {
      say('Still behind after applying:');
      say(`  ${driftLine(after)}`);
      return;
    }
    say('Done. The database matches this build.');
  } catch {
    say('Applied, but could not read the database back to confirm. /api/health will say.');
  }
}

// Never rejects, never exits non-zero: this step cannot be allowed to stop a release.
main().catch(err => {
  say(`Unexpected failure: ${String(err?.message ?? err).slice(0, 200)}`);
  say('Letting the build through. /api/health will report the database state.');
});
