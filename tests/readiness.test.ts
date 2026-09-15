import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  ── The readiness list has to be true, not just written ──────────────────────────────────────────

  docs/READINESS.md is the document Kris reads to decide whether SPEC can take a paying customer. It
  is the one piece of prose in this repository that a real decision rests on.

  On 14 September it was found carrying FOUR stale numbers at once: 623 tests when there were 852,
  24 tenant tables when there were 27, "all 7 checks" when there were 11, and "load: never tested"
  a day after the load test found three real scaling faults. Every one of those was true when it
  was written. None had been true for days.

  That is the same failure this whole codebase keeps catching in its own tooling — a claim nobody
  checks quietly stops being true — and a readiness document is the worst possible place for it,
  because its entire value is that somebody trusts it enough not to check.

  So the figures it can be held to are held to. Not the prose: judgement about what is risky is
  exactly what a person should be writing. Only the counts, which are facts, and the file names,
  which either exist or do not.
*/

const doc = readFileSync('docs/READINESS.md', 'utf8');
const schema = readFileSync('src/db/schema.ts', 'utf8');

describe('the readiness list matches the product', () => {
  /*
    Every browser journey has to be named.

    A journey is the strongest evidence in the document — a real browser, a real sign-up, a real
    database — and one that exists but is not listed is evidence nobody knows they have. This
    failed the moment it was written: three journeys built that week were missing from the list.
  */
  it('names every journey that exists', () => {
    const journeys = readdirSync('scripts').filter(f => f.endsWith('-journey.mjs'));
    expect(journeys.length).toBeGreaterThan(4);
    for (const j of journeys) {
      expect(doc, `${j} is not mentioned in docs/READINESS.md`).toContain(j);
    }
  });

  /* And nothing it names may have been renamed or deleted out from under it. */
  it('names no journey that does not exist', () => {
    const named = [...doc.matchAll(/scripts\/([a-z-]+\.mjs)/g)].map(m => m[1]);
    expect(named.length).toBeGreaterThan(4);
    const onDisk = new Set(readdirSync('scripts'));
    for (const n of new Set(named)) {
      expect(onDisk.has(n), `docs/READINESS.md points at scripts/${n}, which is not there`).toBe(true);
    }
  });

  /*
    The tenant-table count, which is a security claim.

    "27 of 27" is the number somebody would quote if asked whether one business can see another. It
    is checked here against the schema rather than against a memory of running the command, because
    the number moves every time a table is added — and it has moved three times this week.

    Two tables are deliberately outside the TENANT policy and are subtracted by name rather than by
    a pattern, so adding a third exception has to be a decision somebody writes down here. Both have
    RLS ON — outside the tenant policy is not the same as outside protection, which is the mistake
    Supabase caught on 15 September:
      rulebook_rules  the method itself. RLS on, readable by all, writable by nobody
      health_pings    uptime readings. RLS on with NO policy at all, denying everybody
  */
  it('states the right number of tenant tables', () => {
    const OUTSIDE_THE_TENANT_POLICY = ['rulebook_rules', 'health_pings'];
    const withRls = [...schema.matchAll(/pgTable\('([a-z_]+)'/g)]
      .map(m => m[1])
      .filter(name => {
        const at = schema.indexOf(`pgTable('${name}'`);
        const next = schema.indexOf('pgTable(', at + 10);
        const body = schema.slice(at, next === -1 ? undefined : next);
        return body.includes('enableRLS()');
      });
    const tenantTables = withRls.filter(t => !OUTSIDE_THE_TENANT_POLICY.includes(t));

    expect(doc, `the schema has ${tenantTables.length} tenant tables with RLS`)
      .toContain(`**${tenantTables.length} of ${tenantTables.length}**`);
  });

  /*
    The two steps Kris fixed to the end of the list.

    Not a count, but the one instruction in the document that is a decision rather than an
    observation — and the one most likely to be quietly reordered by somebody tidying up.
  */
  it('keeps the API key and Stripe as the last two steps', () => {
    const key = doc.indexOf('Turn on `ANTHROPIC_API_KEY`');
    const stripe = doc.indexOf('**Take a real payment.**');
    const invite = doc.indexOf('**Send a real invitation.**');
    const backup = doc.indexOf('**Restore a backup**');

    expect(key, 'the API key step is missing').toBeGreaterThan(-1);
    expect(stripe, 'the Stripe step is missing').toBeGreaterThan(-1);
    expect(key, 'the API key must come after sending a real invitation').toBeGreaterThan(invite);
    expect(key, 'the API key must come after restoring a backup').toBeGreaterThan(backup);
    expect(stripe, 'Stripe is last').toBeGreaterThan(key);
  });

  /*
    It must keep saying what is NOT done.

    A readiness document that only lists achievements is a brochure. These three headings are the
    parts that make it worth reading, and losing one is how it turns into one.
  */
  it('still has somewhere to put the uncomfortable things', () => {
    for (const heading of ['## Assumed', '## Unknown', '## Designed but not built']) {
      expect(doc, `${heading} is gone from the readiness list`).toContain(heading);
    }
  });
});
