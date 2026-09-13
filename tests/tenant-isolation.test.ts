import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One business must never see another one's data.
 *
 * This is the guarantee everything else rests on, and in this product it rests on ONE mechanism:
 * application code putting a tenant in every query. Row-level security is enabled on every table,
 * but the app connects as the role that owns them, and Postgres lets an owner bypass RLS — so for
 * the app's own path, RLS is not a second line of defence. There is no safety net under this.
 *
 * It has already failed once. `boards-data` read every role assignment in the database and filtered
 * them in memory with `... || a.userId`, which matched any assignment anywhere that had a user on
 * it. A business could be told its chart was drawn on a date belonging to another company. The leak
 * was a date rather than a name, which is precisely why it survived review — it did not look like
 * a security bug, it looked like a slightly odd number.
 *
 * So: a select with no WHERE at all is the shape that caused it, and this test refuses that shape.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Tables that belong to everybody and therefore have no tenant.
 *
 * Deliberately short, and every entry is a deliberate decision rather than a convenience:
 *   trainingModules — the library SPEC ships; the same modules for every business.
 *   rulebookRules   — the method itself.
 *   users           — looked up by sign-in identity BEFORE a tenant is known, which is the whole
 *                     point of a sign-in. Scoping it by tenant would be circular.
 *   healthPings     — uptime readings: a timestamp, a yes-or-no and a duration. It has no tenant_id
 *                     because there is no business in it to scope to, and it is locked harder than
 *                     any table here — RLS on with no policy at all, denying everyone but the app.
 *                     See drizzle/0001_rls.sql and scripts/check-rls.mjs, which prove that lock.
 */
const SHARED = ['trainingModules', 'rulebookRules', 'users', 'healthPings'];

/**
 * The one page that is SUPPOSED to see every account.
 *
 * src/app/admin is SPEC's own operator view — the account, never the business inside it. It is
 * gated on isAdminEmail, shows plan and billing contact only, and deliberately has no "sign in as":
 * SPEC as a company has no way into a customer's business. Reading every tenant is its whole job,
 * so it is named here rather than allowed by accident.
 */
const OPERATOR_VIEW = 'src/app/admin/page.tsx';

describe('every query names a business', () => {
  it('never selects a whole table without a where clause', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles('src')) {
      const path = file.replace(/\\/g, '/');
      const text = readFileSync(file, 'utf8');

      // `db.select(...)` through to the end of the statement. A statement with no `.where(` before
      // its semicolon read every row in the table, for every business.
      for (const match of text.matchAll(/db\s*\.?\s*select\([\s\S]{0,200}?\)\s*\.from\(schema\.(\w+)\)([\s\S]{0,300}?);/g)) {
        const [, table, tail] = match;
        if (SHARED.includes(table)) continue;
        if (path === OPERATOR_VIEW) continue;
        if (tail.includes('.where(')) continue;
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${path}:${line} — select from ${table} with no where`);
      }
    }

    expect(offenders, 'these read every row in a table, across every business').toEqual([]);
  });

  /**
   * The specific mistake, named so it cannot come back wearing the same clothes.
   *
   * Filtering in memory after reading everything is not scoping. It is the same query with the
   * safety written somewhere a reviewer has to go and find, and the boards-data version got the
   * filter subtly wrong in a way nobody caught for weeks.
   */
  it('does not filter for the right business after reading every row', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      if (/\.from\(schema\.\w+\)\s*(\.orderBy\([^)]*\))?\s*;[\s\S]{0,400}?\.filter\(/.test(text)) {
        const path = file.replace(/\\/g, '/');
        // lib/register-data reads a tenant's own entries and then applies the VISIBILITY rule,
        // which is a different question from which business they belong to.
        if (path === 'src/lib/register-data.ts') continue;
        if (path === OPERATOR_VIEW) continue;
        offenders.push(path);
      }
    }
    expect(offenders, 'read everything then filtered — scope the query instead').toEqual([]);
  });
});
