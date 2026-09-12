import { describe, it, expect } from 'vitest';
import {
  daysWaiting, toneFor, fromStored, derived, queue, ageLabel, handled,
  type StoredApproval, type DerivedInputs,
} from '../src/lib/inbox';

const AT = new Date('2026-09-14T09:00:00Z');

const stored = (over: Partial<StoredApproval> = {}): StoredApproval => ({
  id: 'a1', kind: 'connection', title: 'Safety system connection',
  detail: 'Incident records and corrective actions. Read only.',
  blocks: 'Blocks: TRIFR stays unmeasured.',
  decidedByLevel: 'board', requestedBy: 'A. Morgan, GM',
  requestedAt: '2026-09-02T00:00:00Z', state: 'waiting', ...over,
});

const input = (over: Partial<DerivedInputs> = {}): DerivedInputs => ({
  submittedPeriod: null, trainingSignoffs: [], vacancies: [], targetChanges: [], ...over,
});

describe('daysWaiting', () => {
  it('counts whole days, and never goes negative', () => {
    expect(daysWaiting('2026-09-02T00:00:00Z', AT)).toBe(12);
    expect(daysWaiting('2026-09-14T00:00:00Z', AT)).toBe(0);
    expect(daysWaiting('2026-10-01T00:00:00Z', AT)).toBe(0);
    expect(daysWaiting('not a date', AT)).toBe(0);
  });
});

describe('toneFor', () => {
  // Age alone. Colouring by importance would mean ranking one person's decision above another's.
  it('gets louder with age', () => {
    expect(toneFor(0, 'x')).toBe('green');
    expect(toneFor(3, 'x')).toBe('amber');
    expect(toneFor(14, 'x')).toBe('red');
  });

  it('stays grey when nothing is actually held up', () => {
    expect(toneFor(60, null)).toBe('grey');
  });
});

describe('fromStored', () => {
  it('carries the request through with its age and its consequence', () => {
    const i = fromStored(stored(), AT);
    expect(i.kind).toBe('Connection');
    expect(i.from).toBe('Requested by A. Morgan, GM');
    expect(i.age).toBe(12);
    expect(i.tone).toBe('amber');
    expect(i.approvalId).toBe('a1');
  });

  it('falls back to a safe level and kind for anything unrecognised', () => {
    const i = fromStored(stored({ kind: 'something_new', decidedByLevel: 'nonsense' }), AT);
    expect(i.kind).toBe('Other');
    expect(i.level).toBe('board');
  });
});

describe('derived', () => {
  it('produces nothing when nothing is waiting', () => {
    expect(derived(input(), AT)).toEqual([]);
  });

  // A month waiting to be signed is a period with status submitted, not a task somebody created.
  it('raises a submitted month, and says exactly what it blocks', () => {
    const [i] = derived(input({
      submittedPeriod: { period: '2026-09', submittedBy: 'A. Morgan', submittedAt: '2026-09-12T00:00:00Z', scoredRoles: 4, flagged: 3 },
    }), AT);
    expect(i.kind).toBe('Scoring');
    expect(i.title).toBe('Sign off 2026-09 scoring');
    expect(i.detail).toBe('4 roles scored, 3 figures flagged as unmeasurable.');
    expect(i.blocks).toContain('cannot lock');
    expect(i.age).toBe(2);
    expect(i.level).toBe('board');
  });

  it('leaves the flag clause out when nothing was flagged', () => {
    const [i] = derived(input({
      submittedPeriod: { period: '2026-09', submittedBy: null, submittedAt: null, scoredRoles: 1, flagged: 0 },
    }), AT);
    expect(i.detail).toBe('1 role scored.');
    expect(i.from).toBe('Submitted for sign-off');
  });

  it('raises a finished training path waiting on its manager', () => {
    const [i] = derived(input({
      trainingSignoffs: [{ roleId: 'r1', title: 'Site Supervisor', person: 'T. Alderson', completedModules: 7 }],
    }), AT);
    expect(i.kind).toBe('Training');
    expect(i.title).toBe('Sign off T. Alderson’s training path');
    expect(i.blocks).toContain('Ace run cannot start');
    expect(i.level).toBe('manager');
  });

  it('raises a vacancy with how long it has been open', () => {
    const [i] = derived(input({ vacancies: [{ roleId: 'r9', title: 'Yard Lead', since: '2026-07-14T00:00:00Z' }] }), AT);
    expect(i.age).toBe(62);
    expect(i.tone).toBe('red');
    expect(i.detail).toContain('rather than counted as a zero');
  });

  // Nothing is blocked by a recorded negotiation, and the queue says so rather than nagging.
  it('lists a renegotiated target as grey with nothing blocked', () => {
    const [i] = derived(input({
      targetChanges: [{ criterionId: 'c1', roleId: 'r1', text: 'Margin against quote', proposed: '30%', agreed: '32%' }],
    }), AT);
    expect(i.blocks).toBeNull();
    expect(i.tone).toBe('grey');
    expect(i.href).toBe('/scorecard/r1');
  });
});

describe('queue', () => {
  it('shows only what is still waiting', () => {
    const q = queue([stored({ state: 'approved' }), stored({ id: 'a2', state: 'waiting' })], input(), AT);
    expect(q).toHaveLength(1);
    expect(q[0].approvalId).toBe('a2');
  });

  it('puts the longest wait first', () => {
    const q = queue(
      [
        stored({ id: 'new', requestedAt: '2026-09-13T00:00:00Z' }),
        stored({ id: 'old', requestedAt: '2026-08-14T00:00:00Z' }),
      ],
      input(),
      AT,
    );
    expect(q.map(i => i.approvalId)).toEqual(['old', 'new']);
  });

  it('mixes stored and derived into the one queue', () => {
    const q = queue([stored()], input({
      submittedPeriod: { period: '2026-09', submittedBy: 'A', submittedAt: '2026-09-12T00:00:00Z', scoredRoles: 2, flagged: 0 },
    }), AT);
    expect(q.map(i => i.kind)).toEqual(['Connection', 'Scoring']);
  });

  it('is empty when nothing anywhere is waiting', () => {
    expect(queue([], input(), AT)).toEqual([]);
  });
});

describe('ageLabel', () => {
  it('reads the way somebody would say it', () => {
    expect(ageLabel(0)).toBe('waiting today');
    expect(ageLabel(1)).toBe('waiting 1 day');
    expect(ageLabel(12)).toBe('waiting 12 days');
    expect(ageLabel(63)).toBe('waiting 9 weeks');
  });
});

describe('what Claude handled', () => {
  const reading = { text: 'The yard is a mess every Monday', createdAt: '2026-03-01T09:00:00Z', errorLine: 'It starts with People.' };

  it('lists a reading, and says what overrides it', () => {
    const rows = handled({ readings: [reading], packs: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].what).toContain('The yard is a mess every Monday');
    expect(rows[0].supersededBy).toMatch(/owns it decides/);
  });

  /*
    The rule the whole section rests on: nothing is claimed that was not done. A Basic entry the
    person classified themselves has no reading, and listing it here would be a straight falsehood.
  */
  it('never claims a problem nobody read', () => {
    expect(handled({ readings: [{ ...reading, errorLine: null }], packs: [] })).toEqual([]);
  });

  it('never claims a pack a person wrote', () => {
    const rows = handled({
      readings: [],
      packs: [{ period: '2026-02', generatedBy: 'a-person@x.test', approvedBy: null, createdAt: '2026-03-01T09:00:00Z' }],
    });
    expect(rows).toEqual([]);
  });

  it('says an unapproved pack has gone nowhere', () => {
    const [row] = handled({
      readings: [],
      packs: [{ period: '2026-02', generatedBy: 'claude', approvedBy: null, createdAt: '2026-03-01T09:00:00Z' }],
    });
    expect(row.supersededBy).toMatch(/goes nowhere until somebody approves/);
  });

  it('names the approver once there is one', () => {
    const [row] = handled({
      readings: [],
      packs: [{ period: '2026-02', generatedBy: 'claude', approvedBy: 'chair@x.test', createdAt: '2026-03-01T09:00:00Z' }],
    });
    expect(row.supersededBy).toBe('Approved by chair@x.test.');
  });

  it('shortens somebody’s own words without cutting mid-word', () => {
    const long = 'We keep losing the good young blokes about eighteen months in and it always lands on the same two supervisors';
    const [row] = handled({ readings: [{ text: long, createdAt: '2026-03-01T09:00:00Z', errorLine: 'x' }], packs: [] });
    expect(row.what).toMatch(/…/);
    // The character before the ellipsis is the end of a word, never the middle of one.
    const quoted = row.what.match(/“(.+)…”/)![1];
    expect(long.startsWith(quoted)).toBe(true);
    expect(long[quoted.length]).toBe(' ');
  });

  it('puts the most recent first and keeps to the limit', () => {
    const rows = handled({
      readings: [
        { text: 'old', createdAt: '2026-01-01T09:00:00Z', errorLine: 'x' },
        { text: 'new', createdAt: '2026-05-01T09:00:00Z', errorLine: 'x' },
      ],
      packs: [],
    }, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].what).toContain('new');
  });
});
