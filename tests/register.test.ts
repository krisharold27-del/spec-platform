import { describe, it, expect } from 'vitest';
import type { Pillar } from '../src/lib/scoring';
import {
  FIX_ORDER, fixOrder, priorityOf, PRIORITY_LABEL, visibleTo, rank, similar,
  recurrenceOf, auditDue, isOverdue, waitingOn, bloomLetters, snapScore,
  type RegisterEntry, type Bloom,
  lifeOf,
  LIFE_ASKS,
} from '../src/lib/register';

/**
 * The improvement register.
 *
 * These rules decide whose problem something is, why it sits above somebody else's, and who gets to
 * read it. Every one of them is a thing a person will argue with at some point, so each is pinned
 * here rather than living inside a page where changing it looks harmless.
 */

const bloom = (...pairs: [string, 'definite' | 'possible'][]): Bloom[] =>
  pairs.map(([p, certainty]) => ({ pillar: p as Bloom['pillar'], certainty }));

function entry(over: Partial<RegisterEntry> = {}): RegisterEntry {
  return {
    id: 'r1',
    text: 'the yard is a mess every Monday morning',
    createdBy: 'Dane Whitmore',
    createdAt: 1_000,
    bloom: bloom(['people', 'definite']),
    chain: ['people'],
    noOwner: false,
    errorLine: 'Gear goes back wherever it fits, so Monday starts with a search.',
    solutionLine: 'Give the yard an owner, then a weekly check they sign.',
    status: 'open',
    owner: null,
    accepted: null,
    deadline: null,
    recurrenceCount: 1,
    reopenCount: 0,
    signedOffAt: null,
    ...over,
  };
}

describe('the fix happens in one order', () => {
  it('is always People, then Compliance, then Earnings', () => {
    expect(FIX_ORDER).toEqual(['people', 'compliance', 'earnings']);
  });

  it('reorders whatever it is handed into that sequence', () => {
    expect(fixOrder(['earnings', 'people'])).toEqual(['people', 'earnings']);
    expect(fixOrder(['earnings', 'compliance', 'people'])).toEqual(['people', 'compliance', 'earnings']);
  });

  // "If a pillar genuinely doesn't feature in this story, skip it and keep the rest in that order —
  // do not reorder around it."
  it('drops what the story does not touch without disturbing the rest', () => {
    expect(fixOrder(['earnings', 'people'])).toEqual(['people', 'earnings']);
    expect(fixOrder(['compliance'])).toEqual(['compliance']);
    expect(fixOrder([])).toEqual([]);
  });

  /**
   * Earnings is never the lever. A business that starts at Earnings is squeezing an outcome and
   * wondering why it comes back, which is the single most common way an improvement fails.
   */
  it('never puts Earnings anywhere but last', () => {
    for (const input of [['earnings'], ['earnings', 'people'], ['earnings', 'compliance', 'people']] as const) {
      const out = fixOrder([...input]);
      expect(out[out.length - 1]).toBe('earnings');
    }
  });

  // Safety is what a chain is usually ABOUT. It is not a step in fixing one.
  it('has no place for Safety, because Safety is the problem and not the remedy', () => {
    expect(FIX_ORDER).not.toContain('safety');
    expect(fixOrder(['safety', 'people'])).toEqual(['people']);
  });
});

describe('what sits at the top of the list', () => {
  it('ranks harm, then money, then people, then everything else', () => {
    expect(priorityOf({ bloom: bloom(['safety', 'definite']) })).toBe(1);
    expect(priorityOf({ bloom: bloom(['earnings', 'definite']) })).toBe(2);
    expect(priorityOf({ bloom: bloom(['people', 'definite']) })).toBe(3);
    expect(priorityOf({ bloom: bloom(['compliance', 'definite']) })).toBe(4);
    expect(PRIORITY_LABEL[1]).toBe('Harm — act now');
  });

  it('takes the worst pillar in the chain, not the first', () => {
    expect(priorityOf({ bloom: bloom(['people', 'definite'], ['safety', 'definite']) })).toBe(1);
  });

  /**
   * A "possible" pillar is the diagnosis being careful. If a maybe could push an entry to the top,
   * every list would open with things that might be nothing, and a ranked list nobody trusts is
   * just a list.
   */
  it('ignores a maybe entirely when ranking', () => {
    expect(priorityOf({ bloom: bloom(['safety', 'possible'], ['people', 'definite']) })).toBe(3);
    expect(priorityOf({ bloom: bloom(['safety', 'possible']) })).toBe(4);
  });

  it('sorts by priority, then by how often it has come back, then newest', () => {
    const harm = entry({ id: 'harm', bloom: bloom(['safety', 'definite']), createdAt: 1 });
    const onceRaised = entry({ id: 'once', bloom: bloom(['people', 'definite']), recurrenceCount: 1, createdAt: 9 });
    const raisedFourTimes = entry({ id: 'four', bloom: bloom(['people', 'definite']), recurrenceCount: 4, createdAt: 2 });
    expect(rank([onceRaised, raisedFourTimes, harm]).map(e => e.id)).toEqual(['harm', 'four', 'once']);
  });

  // The same thing raised four times is worse than a new one, and it is the signal a business is
  // most likely to miss on its own, because each individual raising feels small.
  it('puts a problem raised again above a newer one', () => {
    const older = entry({ id: 'older', recurrenceCount: 3, createdAt: 1 });
    const newer = entry({ id: 'newer', recurrenceCount: 1, createdAt: 100 });
    expect(rank([newer, older]).map(e => e.id)).toEqual(['older', 'newer']);
  });

  it('does not modify the list it was given', () => {
    const list = [entry({ id: 'a', createdAt: 1 }), entry({ id: 'b', createdAt: 2 })];
    rank(list);
    expect(list.map(e => e.id)).toEqual(['a', 'b']);
  });
});

describe('who can see a problem', () => {
  const me = 'Dane Whitmore';
  const reports = ['Tom Alderson', 'Amrit Kaur'];

  it('shows me what I raised and what I own', () => {
    expect(visibleTo({ createdBy: me, owner: null }, me, reports)).toBe(true);
    expect(visibleTo({ createdBy: 'Someone Else', owner: me }, me, reports)).toBe(true);
  });

  it('shows me what my direct reports raised or were given', () => {
    expect(visibleTo({ createdBy: 'Tom Alderson', owner: null }, me, reports)).toBe(true);
    expect(visibleTo({ createdBy: 'Someone Else', owner: 'Amrit Kaur' }, me, reports)).toBe(true);
  });

  /**
   * Never sideways and never the whole business — the same rule as every card in SPEC. A register
   * showing everything would be a list of every failure in the company readable by anybody, which
   * is the fastest way to make people stop logging things.
   */
  it('shows me nothing from another part of the business', () => {
    expect(visibleTo({ createdBy: 'A Peer', owner: 'Another Peer' }, me, reports)).toBe(false);
  });

  // An unowned entry has owner null. It must not match a person whose name is missing.
  it('does not match an unowned entry to somebody with no name', () => {
    expect(visibleTo({ createdBy: null, owner: null }, me, reports)).toBe(false);
    expect(visibleTo({ createdBy: null, owner: null }, me, [])).toBe(false);
  });
});

describe('the same problem, raised again', () => {
  it('recognises a rewording of something already logged', () => {
    expect(similar('the yard is a mess every Monday', 'yard is a mess again on Mondays')).toBe(true);
  });

  it('does not match two unrelated problems that share a word', () => {
    expect(similar('the yard is a mess every Monday', 'Monday invoicing takes all afternoon')).toBe(false);
  });

  // Compared against the shorter side, so somebody who writes a paragraph still gets credited with
  // raising the same thing as somebody who wrote one line.
  it('matches a long description against the terse version of itself', () => {
    const long = 'the yard is a mess every Monday morning because nobody puts the gear away on Friday';
    expect(similar(long, 'yard is a mess Monday')).toBe(true);
  });

  it('finds nothing in an empty register, and matches nothing on empty words', () => {
    expect(recurrenceOf('a new problem', [])).toBeNull();
    expect(similar('', 'the yard is a mess')).toBe(false);
    expect(similar('a of to in', 'the yard is a mess')).toBe(false);
  });

  it('returns the entry a new raising belongs to', () => {
    const existing = entry({ id: 'yard' });
    expect(recurrenceOf('the yard is a mess again on Monday', [existing])?.id).toBe('yard');
  });
});

describe('closed is not the same as fixed', () => {
  const day = 86_400_000;

  it('checks a signed-off problem again after sixty days', () => {
    const signed = entry({ status: 'closed', signedOffAt: 0 });
    expect(auditDue(signed, 59 * day)).toBe(false);
    expect(auditDue(signed, 61 * day)).toBe(true);
  });

  it('never audits something still open', () => {
    expect(auditDue(entry({ status: 'open', signedOffAt: 0 }), 100 * day)).toBe(false);
  });

  it('knows when an owner has run past their date', () => {
    expect(isOverdue(entry({ deadline: '2026-01-01' }), Date.parse('2026-02-01'))).toBe(true);
    expect(isOverdue(entry({ deadline: '2026-03-01' }), Date.parse('2026-02-01'))).toBe(false);
    // Done is not late. Chasing somebody who finished is how a register loses its authority.
    expect(isOverdue(entry({ status: 'done', deadline: '2026-01-01' }), Date.parse('2026-02-01'))).toBe(false);
  });
});

describe('what an entry is waiting on', () => {
  /**
   * The most important line the register can produce. "Nobody owns this" is the one thing a
   * business genuinely cannot see about itself, and the design is explicit that finding the owner
   * is the first job rather than a reason to wait.
   */
  it('says plainly when nobody owns it', () => {
    expect(waitingOn(entry({ owner: null }))).toContain('Nobody owns this yet');
  });

  it('names who it is waiting on at each step', () => {
    expect(waitingOn(entry({ owner: 'Tom Alderson', accepted: null }))).toContain('not accepted yet');
    expect(waitingOn(entry({ owner: 'Tom Alderson', accepted: false }))).toContain('not theirs');
    expect(waitingOn(entry({ owner: 'Tom Alderson', accepted: true }))).toBe('Tom Alderson owns it.');
    expect(waitingOn(entry({ status: 'done' }))).toContain('waiting to be signed off');
    expect(waitingOn(entry({ status: 'closed' }))).toContain('Signed off');
  });
});

describe('the Snap Score reads the engine, not the pile', () => {
  const many = (n: number, over: Partial<RegisterEntry> = {}) =>
    Array.from({ length: n }, (_, i) => entry({ id: `e${i}`, ...over }));

  // Three problems is not a pattern, and a number drawn from two would be noise presented as insight.
  it('says nothing until there is enough to read', () => {
    expect(snapScore(many(2)).early).toBe(true);
    expect(snapScore(many(2)).pct).toBeNull();
    expect(snapScore(many(3)).early).toBe(false);
  });

  it('rises with the share actually closed out', () => {
    const allOpen = snapScore(many(10)).pct!;
    const allClosed = snapScore(many(10, { status: 'closed' })).pct!;
    expect(allClosed).toBeGreaterThan(allOpen);
  });

  /**
   * A reopen is the worst thing the register can record — it was signed off, somebody believed it
   * was finished, and it came back. It has to cost more than a problem simply being raised twice.
   */
  it('punishes a reopen harder than a recurrence', () => {
    const base = many(10, { status: 'closed' });
    const withReopen = [...base.slice(1), entry({ id: 'r', status: 'closed', reopenCount: 1 })];
    const withRecurrence = [...base.slice(1), entry({ id: 'c', status: 'closed', recurrenceCount: 2 })];
    expect(snapScore(withReopen).pct!).toBeLessThan(snapScore(withRecurrence).pct!);
  });

  /**
   * Never nought and never a hundred. A business that logs its problems honestly has already done
   * the hard part and should not be shown a zero for it; and the next problem has not happened yet.
   */
  it('stays inside its bounds however bad or good it gets', () => {
    const awful = many(10, { status: 'open', reopenCount: 9, recurrenceCount: 9 });
    const perfect = many(40, { status: 'closed' });
    expect(snapScore(awful).pct).toBe(8);
    expect(snapScore(perfect).pct!).toBeLessThanOrEqual(97);
    expect(snapScore(perfect).pct!).toBeGreaterThan(90);
  });
});

describe('the causal chain reads as letters', () => {
  it('spells the pillars in the order the diagnosis found them', () => {
    expect(bloomLetters(bloom(['safety', 'definite'], ['people', 'definite']))).toEqual(['S', 'P']);
  });
});

/*
  ── The thesis ───────────────────────────────────────────────────────────────────────────────────

  "The power of SPEC is reviewing ongoing problems, then finding solutions to them, always starting
  with the people."

  That sentence is the product. It is also the thing most likely to erode quietly — somebody will
  one day have a story where earnings look like the obvious first move, and reorder a chain to suit
  it. These hold the rule in place, so that change fails a build instead of shipping.
*/
describe('always starting with the people', () => {
  it('puts people first, whatever order the pillars arrive in', () => {
    expect(fixOrder(['earnings', 'compliance', 'people'])).toEqual(['people', 'compliance', 'earnings']);
    expect(fixOrder(['earnings', 'people'])).toEqual(['people', 'earnings']);
    expect(fixOrder(['compliance', 'people'])).toEqual(['people', 'compliance']);
  });

  it('keeps the order when a pillar is missing, rather than shuffling round the gap', () => {
    expect(fixOrder(['earnings', 'compliance'])).toEqual(['compliance', 'earnings']);
  });

  /*
    Earnings is always the result, never the lever. A chain that opens on earnings is a chain that
    has skipped the work — it is the one mistake this order exists to prevent.
  */
  it('never opens a fix with earnings', () => {
    for (const given of [
      ['earnings'], ['earnings', 'people'], ['earnings', 'compliance'],
      ['earnings', 'compliance', 'people'],
    ] as Pillar[][]) {
      const fixed = fixOrder(given);
      if (fixed.length > 1) expect(fixed[0], given.join(',')).not.toBe('earnings');
    }
  });

  it('drops safety from the fix, because harm is a gate rather than a step', () => {
    expect(fixOrder(['safety', 'people'])).toEqual(['people']);
  });
});

/*
  ── A plan until somebody owns it ────────────────────────────────────────────────────────────────

  An unassigned entry is not a task nobody got to; it is a business plan. SPEC has read the problem
  and set out the fix, and that is worth something whether or not a name is against it yet. Treating
  it as an overdue task turns thinking into a chore and fills the register with things that feel
  like neglect.
*/
describe('a plan first, work second', () => {
  it('is a plan while nobody owns it', () => {
    expect(lifeOf(entry({ owner: null }))).toBe('plan');
  });

  it('becomes work once somebody owns it', () => {
    expect(lifeOf(entry({ owner: 'Tom', accepted: true }))).toBe('work');
    expect(lifeOf(entry({ owner: 'Tom', accepted: null }))).toBe('work');
  });

  /*
    Refused goes BACK to being a plan. Nobody owns it, and the next question — whose should this be?
    — is a question about the plan, not a task in flight.
  */
  it('goes back to being a plan when the owner says it is not theirs', () => {
    expect(lifeOf(entry({ owner: 'Tom', accepted: false }))).toBe('plan');
  });

  it('is finished once done or signed off', () => {
    expect(lifeOf(entry({ status: 'done', owner: 'Tom' }))).toBe('finished');
    expect(lifeOf(entry({ status: 'closed', owner: 'Tom' }))).toBe('finished');
  });

  it('asks the reader a different question in each life', () => {
    expect(LIFE_ASKS.plan).toMatch(/whether it is right/);
    expect(LIFE_ASKS.work).toMatch(/being worked on/);
  });
});

/* The reading has to survive the journey from the database to the card, or the register is a list. */
describe('the story SPEC told back', () => {
  it('is carried on the entry, not left in the database', () => {
    const e = entry();
    expect(e.errorLine).toBeTruthy();
    expect(e.solutionLine).toBeTruthy();
  });

  it('is absent rather than empty when nothing was read', () => {
    const basic = entry({ errorLine: null, solutionLine: null });
    expect(basic.errorLine).toBeNull();
    expect(basic.solutionLine).toBeNull();
  });
});
