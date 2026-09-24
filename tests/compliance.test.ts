import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AREAS, STORED_AREAS, isComplianceArea, areaSpec,
  stateOf, stateNote, stopsWork, byUrgency, complianceStats, headline,
  WARN_BEFORE_DAYS, CLEAR_TO_WORK_WARNS_AT, STATE_LABEL,
} from '../src/lib/compliance';
import { EXPIRING_WITHIN_DAYS } from '../src/lib/obligations';

/*
  ── Do what we say, and prove it ─────────────────────────────────────────────────────────────────

  Kris's design of 24 September: "Every licence, policy, certificate, contract and audit in one
  place. SPEC warns 60 days before anything lapses, and anything that lapses stops the work it
  covers."
*/

const at = new Date('2026-09-24T09:00:00.000Z');
const inDays = (n: number) => new Date(at.getTime() + n * 864e5).toISOString().slice(0, 10);

describe('the six areas', () => {
  it('are the six the design names, in its order', () => {
    expect(AREAS.map(a => a.key))
      .toEqual(['licences', 'insurance', 'certificates', 'audits', 'contracts', 'breaches']);
  });

  /*
    ── Two of the six are read, not copied ──────────────────────────────────────────────────────

    Licences are the `obligations` rows that already gate Clear to Work on People; breaches are the
    corrective actions already raised on Safety. A second copy of a hard gate is what makes both
    pages untrustworthy the day they disagree — the same rule the safety register was built on.
  */
  it('HOLD ONLY THE FOUR SPEC DOES NOT ALREADY KNOW', () => {
    expect(STORED_AREAS).toEqual(['insurance', 'certificates', 'audits', 'contracts']);
    expect(areaSpec('licences').readOnly, 'licences live on People').toBe(true);
    expect(areaSpec('breaches').readOnly, 'breaches live on Safety').toBe(true);
  });

  /* And the action refuses to write one of the two, rather than trusting the form's `kind`. */
  it('AND THE ACTION REFUSES TO WRITE ONE OF THE OTHER TWO', () => {
    const action = readFileSync('src/app/compliance/actions.ts', 'utf8');
    expect(action).toContain('STORED_AREAS.includes(kind)');
    expect(action).toContain('refuseTo');
  });

  it('every area says what it is for and what it feeds', () => {
    for (const a of AREAS) {
      expect(a.blurb.length, a.key).toBeGreaterThan(40);
      expect(a.feeds, a.key).toMatch(/^Compliance · /);
    }
  });

  it('refuses an area the product does not know', () => {
    expect(isComplianceArea('audits')).toBe(true);
    expect(isComplianceArea('toolbox')).toBe(false);
  });
});

describe('where something stands', () => {
  it('is current when it is a long way off', () => {
    expect(stateOf({ expiresAt: inDays(200) }, at)).toBe('current');
  });

  it('WARNS 60 DAYS OUT, not 30', () => {
    expect(WARN_BEFORE_DAYS).toBe(60);
    expect(stateOf({ expiresAt: inDays(59) }, at)).toBe('expiring');
    expect(stateOf({ expiresAt: inDays(61) }, at)).toBe('current');
  });

  /*
    ── The two windows differ on purpose ────────────────────────────────────────────────────────

    `obligations` warns at 30, with the reasoning "a month is enough to renew most things." That is
    true of most things and not of these: an expiry here does not merely lapse, it STOPS THE WORK.
    A renewal that takes six weeks against a thirty-day warning is a fortnight of somebody who
    cannot be sent anywhere. Clear to Work keeps 30, because it answers a different question —
    whether this person can work today — and widening it would turn things that are fine into
    things that look broken.

    This asserts they are DIFFERENT, so that somebody "tidying up" the duplication has to read the
    reasoning first.
  */
  it('AND CLEAR TO WORK DELIBERATELY DOES NOT — they answer different questions', () => {
    expect(CLEAR_TO_WORK_WARNS_AT).toBe(EXPIRING_WITHIN_DAYS);
    expect(WARN_BEFORE_DAYS).not.toBe(CLEAR_TO_WORK_WARNS_AT);
    expect(WARN_BEFORE_DAYS).toBeGreaterThan(CLEAR_TO_WORK_WARNS_AT);
  });

  it('is lapsed once the date has gone', () => {
    expect(stateOf({ expiresAt: inDays(-1) }, at)).toBe('lapsed');
  });

  /*
    A policy nobody has recorded an expiry for is not a policy anybody can say is in force. Reading
    it as fine is how a business discovers its public liability lapsed in March.
  */
  it('READS NO DATE AS MISSING, never as fine', () => {
    expect(stateOf({ expiresAt: null }, at)).toBe('missing');
    expect(STATE_LABEL.missing).toBe('Not recorded');
  });

  /* A one-off — a certificate lodged, an audit held — is done rather than renewed. */
  it('treats something satisfied as current, whatever its date said', () => {
    expect(stateOf({ expiresAt: inDays(-400), satisfiedAt: '2026-09-01' }, at)).toBe('current');
  });

  it('says how it reads, in days rather than in a status name', () => {
    expect(stateNote({ expiresAt: inDays(-3) }, at)).toBe('Lapsed 3 days ago');
    expect(stateNote({ expiresAt: inDays(0) }, at)).toBe('Expires today');
    expect(stateNote({ expiresAt: inDays(1) }, at)).toBe('1 day left');
    expect(stateNote({ expiresAt: null }, at)).toMatch(/cannot say this is in force/);
  });
});

describe('what stops work', () => {
  /* The sentence the whole page turns on. */
  it('IS ANYTHING LAPSED — and anything nobody recorded', () => {
    expect(stopsWork('lapsed')).toBe(true);
    expect(stopsWork('missing'), 'an unrecorded policy is not evidence of cover').toBe(true);
    expect(stopsWork('expiring'), 'still in force — loud, but not blocking').toBe(false);
    expect(stopsWork('current')).toBe(false);
  });
});

describe('the order things are read in', () => {
  /*
    A list in the order it was entered is a list nobody reads twice. What stops work today belongs
    above what lapses in seven weeks.
  */
  it('PUTS WHAT STOPS WORK FIRST, then what is soonest', () => {
    const rows = [
      { id: 'fine', expiresAt: inDays(300) },
      { id: 'soon', expiresAt: inDays(10) },
      { id: 'lapsed-old', expiresAt: inDays(-90) },
      { id: 'lapsed-recent', expiresAt: inDays(-2) },
      { id: 'nodate', expiresAt: null },
    ];
    expect(byUrgency(rows, at).map(r => r.id))
      .toEqual(['lapsed-old', 'lapsed-recent', 'nodate', 'soon', 'fine']);
  });
});

describe('the four numbers, and the sentence above them', () => {
  it('counts what is current, expiring and stopping work', () => {
    const rows = [
      { expiresAt: inDays(300) }, { expiresAt: inDays(20) },
      { expiresAt: inDays(-5) }, { expiresAt: null },
    ];
    const s = complianceStats(rows, 0, at);
    expect(s.total).toBe(4);
    expect(s.current).toBe(1);
    expect(s.expiringSoon).toBe(1);
    expect(s.stoppingWork, 'the lapsed one and the unrecorded one').toBe(2);
  });

  /*
    ── The most misleading thing this page could say ────────────────────────────────────────────

    An empty register counts zero stopping work and zero breaches, which is exactly what a
    perfectly-run business looks like. It is not one; it is a business that has told SPEC nothing.
  */
  it('NEVER CONGRATULATES A BUSINESS THAT HAS RECORDED NOTHING', () => {
    const line = headline(complianceStats([], 0, at));
    expect(line).toMatch(/cannot tell you that you are compliant/i);
    expect(line, 'and never the opposite').not.toMatch(/everything.*current|all current/i);
  });

  it('leads on what is stopping work when anything is', () => {
    expect(headline(complianceStats([{ expiresAt: inDays(-1) }], 0, at)))
      .toMatch(/1 thing is stopping work/);
  });

  it('says what needs renewing when nothing is blocking', () => {
    expect(headline(complianceStats([{ expiresAt: inDays(10) }], 0, at)))
      .toMatch(/Nothing is stopping work.*1 thing needs renewing/);
  });

  it('and says so plainly when everything really is current', () => {
    expect(headline(complianceStats([{ expiresAt: inDays(300) }], 0, at)))
      .toBe('Everything recorded is current.');
  });
});

describe('where it lives', () => {
  it('is on the bar and in the directory', () => {
    const doors = readFileSync('src/lib/doors.ts', 'utf8');
    expect(doors).toContain("'/compliance'");
    expect(doors).toContain("label: 'Compliance'");
  });

  /* Kept scoped by business, and without a foreign key like every table added since the CRM. */
  it('is scoped by business, and carries no foreign key', () => {
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    const block = schema.slice(schema.indexOf('export const complianceItems'));
    expect(block).toContain("tenantId: text('tenant_id').notNull()");
    expect(block.slice(0, block.indexOf('enableRLS'))).not.toContain('.references(');
    expect(block).toContain('enableRLS');
  });

  it('carries the tenant policy in the real policy file', () => {
    expect(readFileSync('drizzle/0001_rls.sql', 'utf8')).toContain("'compliance_items'");
  });
});
