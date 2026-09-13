// Does every table actually have a tenant policy, and does the policy file even run?
//
// Both halves matter, and the second is the one that bit. drizzle/0001_rls.sql needs Supabase's
// auth.uid(), so our own Postgres could never apply it — which meant nobody had ever run it. It
// contained a reference to a table that does not exist (`claude_registrations`), so it aborted
// partway through, and every policy below that line was silently never created. A security file
// nobody can execute is a security file nobody has checked.
//
// This stubs auth.uid() locally, applies the real file unmodified, and then asks the database what
// it actually ended up with. Run against a scratch database:
//
//   node scripts/check-rls.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.log('DATABASE_URL not set — skipping (nothing to check against).');
  process.exit(0);
}

const psql = (args, input) =>
  execFileSync('psql', [URL, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};

// Supabase supplies auth.uid(); a plain Postgres does not. Stubbing it is what makes the real file
// runnable here — the policies themselves are applied exactly as they will be in production.
psql(['-v', 'ON_ERROR_STOP=1', '-q'],
  `create schema if not exists auth;
   create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);

try {
  psql(['-v', 'ON_ERROR_STOP=1', '-q', '-f', 'drizzle/0001_rls.sql']);
  check('the policy file runs from top to bottom', true);
} catch (error) {
  check('the policy file runs from top to bottom', false, String(error.stderr ?? error).slice(0, 300));
  process.exit(1);
}

// Run it twice. The file says it is idempotent; that claim was also never tested.
try {
  psql(['-v', 'ON_ERROR_STOP=1', '-q', '-f', 'drizzle/0001_rls.sql']);
  check('and runs again safely, as it claims to', true);
} catch (error) {
  check('and runs again safely, as it claims to', false, String(error.stderr ?? error).slice(0, 300));
}

const tables = [...readFileSync('src/db/schema.ts', 'utf8').matchAll(/pgTable\('(\w+)'/g)].map(m => m[1]);
const withPolicy = new Set(
  psql(['-t', '-A', '-c', "select tablename from pg_policies where policyname = 'tenant_isolation'"])
    .split('\n').map(s => s.trim()).filter(Boolean),
);

/**
 * The one table that is global on purpose.
 *
 * rulebook_rules holds anonymised cross-client learnings — the method itself, not anybody's
 * business. It has no tenant_id and RLS is deliberately OFF, which is checked below rather than
 * assumed: RLS on with no policy denies everything, and this table being empty for everyone would
 * look like a bug in the product rather than a mistake here.
 */
const GLOBAL = 'rulebook_rules';

/**
 * The one table that is locked to everybody, including the people a policy would normally let in.
 *
 * health_pings holds no tenant data — a timestamp, a yes-or-no and a duration — so a tenant policy
 * would be meaningless on it. And unlike the rulebook there is nobody it should be readable BY:
 * SPEC writes it as the role that owns the table (which bypasses RLS) and only /cockpit reads it.
 * So RLS is on with no policy at all, which denies everyone else by default and keeps it invisible
 * through PostgREST, the table editor, and anything that ever connects as `anon`.
 */
const DENIED = 'health_pings';

const exempt = new Set([GLOBAL, DENIED]);
const tenantTables = tables.filter(t => !exempt.has(t));
const missing = tenantTables.filter(t => !withPolicy.has(t));
check(`every tenant table has a policy (${tenantTables.length - missing.length} of ${tenantTables.length})`, missing.length === 0, missing.join(', '));

const rlsOn = psql(['-t', '-A', '-c', `select relrowsecurity from pg_class where relname = '${GLOBAL}'`]).trim();
check(`${GLOBAL} is global, with RLS off rather than on-and-denying`, rlsOn === 'f', `relrowsecurity=${rlsOn}`);

const deniedRls = psql(['-t', '-A', '-c', `select relrowsecurity from pg_class where relname = '${DENIED}'`]).trim();
check(`${DENIED} is locked with RLS on and no policy`, deniedRls === 't', `relrowsecurity=${deniedRls}`);
const deniedPolicies = psql(['-t', '-A', '-c', `select count(*) from pg_policies where tablename = '${DENIED}'`]).trim();
check(`${DENIED} really has no policy letting anybody in`, deniedPolicies === '0', `${deniedPolicies} policies`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
