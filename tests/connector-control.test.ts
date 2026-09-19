import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileUnder, isSensitive, guessCategory, STATUS_LABEL } from '../src/lib/systems';

/**
 * ── Who can connect the ledger ───────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September, before connecting JBI to anything real: *"be very careful with connectors
 * especially xero and financials - how are we controlling this - not everyone should be able to
 * connect Xero"*.
 *
 * The control was already real and enforced on the server: only an administrator may add a system
 * at all; anything in a SENSITIVE category is created disconnected, raises a board-level approval
 * carrying its exact read-only scope, and `markLive` refuses to turn it on until that approval
 * exists. Administration never widens what somebody may decide, so an administrator cannot approve
 * their own request by virtue of being one — a board decision needs the top of the chart.
 *
 * It had one way round it, and this file is why the way round is closed.
 *
 * Sensitivity is decided by CATEGORY rather than by vendor, deliberately: a list of products SPEC
 * has heard of would let a business on anything else walk straight past the board. But the category
 * came off the FORM. `guessCategory` has always known Xero is financials — it was used to
 * pre-select a dropdown, and the dropdown could be changed. Type Xero, choose "Something else", and
 * the ledger connected on one person's say-so.
 *
 * A category may now be made more sensitive than the person chose, never less.
 */

describe('a financial system cannot be filed as something lighter', () => {
  it('KNOWS XERO IS FINANCIAL, whatever the dropdown said', () => {
    expect(fileUnder('other', 'Xero')).toBe('financials');
    expect(fileUnder('job_management', 'Xero API')).toBe('financials');
    expect(fileUnder('crm', 'MYOB AccountRight')).toBe('financials');
  });

  it('and the same for payroll, which carries people rather than money', () => {
    expect(fileUnder('other', 'Employment Hero')).toBe('payroll');
    expect(fileUnder('crm', 'KeyPay')).toBe('payroll');
  });

  /*
    The upgrade only ever runs one way. A business that calls its job system "financial reporting"
    is filed as financials and goes to the board — the safe direction to be wrong in — but nothing
    quietly downgrades a category somebody deliberately chose.
  */
  it('never files something as LESS sensitive than it was chosen to be', () => {
    expect(fileUnder('financials', 'Simpro')).toBe('financials');
    expect(fileUnder('payroll', 'a spreadsheet')).toBe('payroll');
  });

  it('and leaves an ordinary system exactly where it was put', () => {
    expect(fileUnder('job_management', 'Simpro')).toBe('job_management');
    expect(fileUnder('crm', 'HubSpot')).toBe('crm');
    expect(fileUnder('communications', 'Microsoft 365')).toBe('communications');
  });

  it('falls back to the guess when the category is not one SPEC has', () => {
    expect(fileUnder('nonsense', 'Simpro')).toBe('job_management');
    expect(fileUnder('', 'something nobody has heard of')).toBe('other');
  });

  it('and the sensitive list is the ledger and people, not a vendor list', () => {
    expect(isSensitive('financials')).toBe(true);
    expect(isSensitive('payroll')).toBe(true);
    expect(isSensitive('job_management')).toBe(false);
    expect(isSensitive('crm')).toBe(false);
    // The point of categories: a product nobody has heard of is still judged on what it holds.
    expect(isSensitive(guessCategory('Ledgerly'))).toBe(true);
  });
});

describe('the guard is on the write, not only on the screen', () => {
  const actions = readFileSync('src/app/connections/actions.ts', 'utf8');

  it('ONLY AN ADMINISTRATOR MAY ADD OR TURN ON A SYSTEM', () => {
    expect(actions).toContain('assertAdministrator');
    // Every exported action goes through the same door.
    for (const fn of ['connectSystem', 'markLive']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 200), `${fn} does not start from administrator()`).toContain('administrator()');
    }
  });

  it('AND A SENSITIVE SYSTEM CANNOT BE MARKED LIVE WITHOUT AN APPROVAL', () => {
    const live = actions.slice(actions.indexOf('export async function markLive'));
    expect(live).toContain('isSensitive(connection.category)');
    expect(live).toContain("a.state === 'approved'");
    expect(live).toContain('refuseTo');
  });

  it('and the board decides it — never an administrator by virtue of being one', () => {
    expect(actions).toContain("decidedByLevel: 'board'");
    const inbox = readFileSync('src/app/inbox/actions.ts', 'utf8');
    expect(inbox).toContain('isTopOfChart');
  });

  it('and the file is what it is filed under, not what was typed in the form', () => {
    expect(actions).toContain('fileUnder(');
    expect(actions).not.toMatch(/category = String\(formData\.get\('category'\)[^;]*\|\| guessCategory/);
  });
});

/**
 * ── And nothing claims a number arrived on its own ───────────────────────────────────────────────
 *
 * `tests/no-false-feed.test.ts` tore this claim out of four screens on 18 September. It survived in
 * a LOOKUP TABLE — "Live — numbers arriving automatically" — which is exactly where a claim goes to
 * hide from a check that reads pages.
 */
describe('a connection never says a number has arrived', () => {
  it('BECAUSE NOTHING HAS: there is no connector yet', () => {
    for (const label of Object.values(STATUS_LABEL)) {
      /*
        The ban is on CLAIMING movement, not on the words. My first pattern included "reading
        from" and failed against the honest label that says SPEC is NOT reading from it yet — a
        check that cannot tell a claim from its denial will eventually be satisfied by deleting the
        denial, which is the opposite of what it is for.
      */
      expect(label, `"${label}" claims data is moving`).not.toMatch(/arriving|automatic|syncing/i);
    }
  });

  it('and turning one on does not stamp a read that never happened', () => {
    const actions = readFileSync('src/app/connections/actions.ts', 'utf8');
    const live = actions.slice(actions.indexOf('export async function markLive'));
    expect(live).not.toMatch(/lastSyncAt: new Date/);
  });
});
