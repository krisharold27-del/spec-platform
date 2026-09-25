import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NO_SOPA, isSetUp, claimWatch, needsAttention, claimsLine,
  retentionState, goAndGetIt, retentionLine,
  openDefects, carriedBy, defectsLine, closingOut,
  CLIENT_NOT_BUILDER,
  type Claim, type SopaSetup, type Retention, type Defect,
} from '../src/lib/claims';

const src = readFileSync(join(process.cwd(), 'src/lib/claims.ts'), 'utf8');
const AT = new Date('2026-09-25T00:00:00Z');

const nsw: SopaSetup = {
  territory: 'NSW', actName: 'Building and Construction Industry Security of Payment Act 1999',
  scheduleWithinDays: 10, payWithinDays: 15, requiredWording: 'This is a payment claim made under…',
};

const claim = (over: Partial<Claim> = {}): Claim => ({
  id: 'c1', jobId: 'j1', jobRef: 'J-4402', client: 'Harbourview', number: 2,
  amountCents: 22_300_00, retentionCents: 1_115_00,
  servedAt: null, scheduledAt: null, scheduledCents: null, paidAt: null,
  ...over,
});

describe('SPEC never invents a statutory deadline', () => {
  /*
    The rule lib/certificates set, with money attached. A business that lets a real window lapse
    while watching a made-up one has been actively harmed by the thing it trusted.
  */
  it('has no day count anywhere in the file', () => {
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const numbers = [...code.matchAll(/\b(\d+)\s*(?:days?|business days?)\b/gi)].map(m => m[0]);
    expect(numbers, `a deadline was written into the code: ${numbers.join(', ')}`).toEqual([]);
  });

  it('will not say whether a claim is late before the business has told it the window', () => {
    const w = claimWatch(claim({ servedAt: '2026-01-01' }), NO_SOPA, AT);
    expect(w.state).toBe('awaiting_schedule');
    expect(w.says).toContain('will not');
    expect(w.nextStep).toBeNull();
  });

  it('knows when it has been told', () => {
    expect(isSetUp(NO_SOPA)).toBe(false);
    expect(isSetUp(nsw)).toBe(true);
  });
});

describe('the people who pay us are clients', () => {
  /*
    Kris's wording rule. Half of JBI's work is industrial, mining and renewables, where there is no
    builder anywhere in the job — a product that calls every payer a builder was written for
    somebody else, and an owner notices that in the first ten minutes.
  */
  it('never uses "builder" as the general term in anything a person reads', () => {
    /*
      Scanned over the STRINGS the product renders, not over the prose. The comments in this file
      quote Kris using the word and explain the rule, which is the point of them; what must not
      happen is a screen telling a mine operator that their builder has not responded.

      The one allowed use is CLIENT_NOT_BUILDER, which exists to say a builder is one kind of
      client — naming it is how the rule gets taught.
    */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const strings = [...code.matchAll(/'((?:[^'\\]|\\.)*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2]);
    const offenders = strings.filter(v =>
      /\bbuilders?\b/i.test(v) && !/one kind of client/i.test(v));
    expect(offenders, `these strings call a client a builder: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('says so where anybody building a screen will read it', () => {
    expect(CLIENT_NOT_BUILDER).toContain('one kind of client');
    expect(CLIENT_NOT_BUILDER).toContain('mine');
  });
});

describe('a claim, through its life', () => {
  it('runs no clock while it is a draft', () => {
    const w = claimWatch(claim(), nsw, AT);
    expect(w.state).toBe('draft');
    expect(w.daysSince).toBeNull();
    expect(w.nextStep).toContain('Serve it');
  });

  it('counts down while the client still has time', () => {
    const w = claimWatch(claim({ servedAt: '2026-09-20' }), nsw, AT);
    expect(w.state).toBe('awaiting_schedule');
    expect(w.says).toContain('5 left to respond');
    expect(w.nextStep).toBeNull();
  });

  it('is loud the moment the window passes', () => {
    const w = claimWatch(claim({ servedAt: '2026-09-01' }), nsw, AT);
    expect(w.state).toBe('schedule_missed');
    /* The sentence a small business most often does not know. */
    expect(w.nextStep).toContain('loses the right to dispute');
  });

  it('flags a short schedule as the thing to decide about now', () => {
    const w = claimWatch(claim({ servedAt: '2026-09-15', scheduledAt: '2026-09-20', scheduledCents: 18_000_00 }), nsw, AT);
    expect(w.state).toBe('scheduled_short');
    expect(w.says).toContain('$4,300 short');
    expect(w.nextStep).toContain('time limit');
  });

  it('is quiet when they scheduled it in full and are inside terms', () => {
    const w = claimWatch(claim({ servedAt: '2026-09-15', scheduledAt: '2026-09-20', scheduledCents: 22_300_00 }), nsw, AT);
    expect(w.state).toBe('scheduled');
    expect(w.nextStep).toBeNull();
  });

  it('calls scheduled-and-unpaid the strongest position there is', () => {
    const w = claimWatch(claim({ servedAt: '2026-08-01', scheduledAt: '2026-08-05', scheduledCents: 22_300_00 }), nsw, AT);
    expect(w.state).toBe('overdue');
    expect(w.nextStep).toContain('strongest position');
  });

  it('stops entirely once it is paid', () => {
    const w = claimWatch(claim({ servedAt: '2026-08-01', paidAt: '2026-08-20' }), nsw, AT);
    expect(w.state).toBe('paid');
    expect(w.nextStep).toBeNull();
  });
});

describe('what needs somebody', () => {
  it('puts a missed payment schedule above everything else', () => {
    const list = [
      claim({ id: 'a', servedAt: '2026-08-01', scheduledAt: '2026-08-05', scheduledCents: 22_300_00 }),
      claim({ id: 'b', servedAt: '2026-09-01' }),
      claim({ id: 'c' }),
    ];
    expect(needsAttention(list, nsw, AT).map(w => w.claim.id)).toEqual(['b', 'a', 'c']);
  });

  it('leaves out everything that is fine', () => {
    const list = [claim({ servedAt: '2026-09-15', scheduledAt: '2026-09-20', scheduledCents: 22_300_00 })];
    expect(needsAttention(list, nsw, AT)).toHaveLength(0);
  });

  it('summarises honestly with no Act set', () => {
    const list = [claimWatch(claim({ servedAt: '2026-01-01' }), NO_SOPA, AT)];
    expect(claimsLine(list, NO_SOPA)).toContain('will not');
  });
});

describe('retention', () => {
  const held = (over: Partial<Retention> = {}): Retention => ({
    jobId: 'j1', jobRef: 'J-4402', client: 'Harbourview', heldCents: 11_150_00,
    releaseTerms: '5% for 12 months from practical completion',
    defectsEndAt: '2026-09-01', requestedAt: null, releasedAt: null,
    ...over,
  });

  it('is releasable once the defects period has ended', () => {
    expect(retentionState(held(), AT)).toBe('releasable');
    expect(retentionState(held({ defectsEndAt: '2027-01-01' }), AT)).toBe('held');
    expect(retentionState(held({ requestedAt: '2026-09-10' }), AT)).toBe('requested');
    expect(retentionState(held({ releasedAt: '2026-09-15' }), AT)).toBe('released');
  });

  it('finds the money nobody has asked for, biggest first', () => {
    const found = goAndGetIt([held({ heldCents: 2_000_00 }), held({ heldCents: 11_150_00 })], AT);
    expect(found.map(r => r.heldCents)).toEqual([11_150_00, 2_000_00]);
  });

  it('says when it cannot tell you the date', () => {
    expect(retentionLine([held({ defectsEndAt: null })], AT)).toContain('cannot tell you when');
  });

  it('names what is sitting there', () => {
    expect(retentionLine([held()], AT)).toContain('due back and nobody has asked');
  });

  it('says nothing dramatic when there is none', () => {
    expect(retentionLine([], AT)).toBe('No retention held.');
  });
});

describe('defects', () => {
  const defect = (over: Partial<Defect> = {}): Defect => ({
    id: 'd1', jobId: 'j1', jobRef: 'J-4402', what: 'Emergency light not discharging',
    raisedAt: '2026-08-20', freeToUs: true, closedAt: null, productSerial: null,
    ...over,
  });

  it('counts what is ours to carry', () => {
    const list = [defect(), defect({ id: 'd2', freeToUs: false })];
    expect(openDefects(list)).toHaveLength(2);
    expect(carriedBy(openDefects(list))).toHaveLength(1);
    expect(defectsLine(list)).toContain('ours to carry');
  });

  it('is quiet once they are closed', () => {
    expect(defectsLine([defect({ closedAt: '2026-09-01' })])).toContain('all closed out');
  });
});

describe('closing a job out', () => {
  const r: Retention = {
    jobId: 'j1', jobRef: 'J-4402', client: 'Harbourview', heldCents: 11_150_00,
    releaseTerms: '5%', defectsEndAt: '2026-09-01', requestedAt: null, releasedAt: null,
  };

  it('does not ask for the money with defects still open', () => {
    const said = closingOut(r, [{
      id: 'd1', jobId: 'j1', jobRef: 'J-4402', what: 'x', raisedAt: '2026-08-01',
      freeToUs: true, closedAt: null, productSerial: null,
    }], AT)!;
    expect(said).toContain('invites a reason to say no');
  });

  it('asks for it when there is nothing outstanding', () => {
    expect(closingOut(r, [], AT)).toContain('drafted');
  });

  it('says nothing while the period is still running', () => {
    expect(closingOut({ ...r, defectsEndAt: '2027-01-01' }, [], AT)).toBeNull();
  });
});
