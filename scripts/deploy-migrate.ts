/**
 * Bring the database up to the build, automatically, at deploy time.
 *
 * This exists because the alternative was asking a person to run a database migration from a
 * command line at the exact moment a release goes out. That is not a reasonable thing to ask of
 * anybody, it is the step most likely to be forgotten, and forgetting it looks like the product
 * being broken rather than like a missed step.
 *
 * It is deliberately cautious about one thing. A schema push reconciles in BOTH directions: it adds
 * what the code needs AND drops what the code no longer mentions. Adding is safe and is the whole
 * point. Dropping is how an automated deployment turns into data loss — a column removed from the
 * code by mistake, or a build running against the wrong database, would take real customer data
 * with it and no test would catch it.
 *
 * So: it adds, and it refuses to drop. If the database holds anything this build does not know
 * about, it stops and fails the deploy with the list printed, because that is a question for a
 * person. Nothing is ever removed by this script.
 */
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { expectedShape, compareShape, extrasOf, driftLine } from '../src/lib/schema-check';

const say = (s: string) => console.log(`[deploy-migrate] ${s}`);

/** Read the shape without importing src/db, which throws at module load when unconfigured. */
async function actualShape(url: string) {
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 20 });
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
    say('Failing the build rather than shipping against a database nobody can see.');
    process.exit(1);
  }

  const drift = compareShape(expected, actual);
  const extras = extrasOf(expected, actual);
  const behind = drift.missingTables.length > 0 || drift.missingColumns.length > 0;

  if (!behind) {
    say(`The database already has everything this build expects (${expected.size} tables). Nothing to do.`);
    return;
  }

  say(driftLine(drift));
  if (drift.missingTables.length) say(`  tables to add: ${drift.missingTables.join(', ')}`);
  for (const c of drift.missingColumns) say(`  columns to add on ${c.table}: ${c.columns.join(', ')}`);

  // The refusal. A push would reconcile these away, and they may be the only copy of something.
  if (extras.extraTables.length || extras.extraColumns.length) {
    say('STOPPING. The database holds things this build does not know about, and a push would drop them:');
    for (const t of extras.extraTables) say(`  table: ${t}`);
    for (const c of extras.extraColumns) say(`  columns on ${c.table}: ${c.columns.join(', ')}`);
    say('That is a decision for a person, not for a deploy. Nothing has been changed.');
    process.exit(1);
  }

  say('Every change is additive. Applying.');
  const run = spawnSync('npx', ['drizzle-kit', 'push', '--force'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (run.status !== 0) {
    say('The schema push failed. Failing the build rather than serving pages that cannot read their own tables.');
    process.exit(1);
  }

  // Trust nothing: read it back rather than believing the command that just ran.
  const after = compareShape(expected, await actualShape(url));
  if (after.missingTables.length || after.missingColumns.length) {
    say('The push reported success but the database is still behind:');
    say(driftLine(after));
    process.exit(1);
  }

  say('Done. The database matches this build.');
}

main().catch(err => {
  say(`Unexpected failure: ${String(err?.message ?? err).slice(0, 200)}`);
  process.exit(1);
});
