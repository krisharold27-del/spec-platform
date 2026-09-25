import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cardFor, inForce, overlapping, priceFrom, cardLine, type RateCard } from '../src/lib/rate-cards';
import { hireWatch, shouldBeBack, plantLine, type Hire } from '../src/lib/plant';
import { LAST_DAY, BITES, leaverWatch, stillOpen, lastDayLine, type Leaver } from '../src/lib/last-day';

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/* ── A builder's agreed rates ─────────────────────────────────────────────────────────────────── */
const card = (over: Partial<RateCard> = {}): RateCard => ({
  id: 'c1', customerKey: 'big-builder', customerName: 'Big Builder', name: '2026 schedule',
  startsAt: '2026-01-01', endsAt: '2026-12-31',
  lines: [
    { id: 'l1', what: 'Double GPO', unit: 'each', cents: 12_500 },
    { id: 'l2', what: 'LED batten', unit: 'each', cents: 8_900 },
  ],
  ...over,
});

describe('a rate card belongs to a customer, not to a spreadsheet', () => {
  it('applies only inside its dates', () => {
    expect(inForce(card(), '2026-06-01')).toBe(true);
    expect(inForce(card(), '2025-12-31')).toBe(false);
    expect(inForce(card(), '2027-01-01')).toBe(false);
    expect(inForce(card({ startsAt: null, endsAt: null }), '2030-01-01')).toBe(true);
  });

  it('finds the one in force for that customer', () => {
    const cards = [card(), card({ id: 'c2', customerKey: 'other', customerName: 'Other' })];
    expect(cardFor(cards, 'big-builder', '2026-06-01')?.id).toBe('c1');
    expect(cardFor(cards, 'nobody', '2026-06-01')).toBeNull();
  });

  it('two cards in force for one customer is a fault, and is named', () => {
    /* An argument waiting to happen: the most recently started wins, and the pair is reported. */
    const cards = [card(), card({ id: 'c2', name: 'Old schedule', startsAt: '2025-06-01', endsAt: '2026-06-30' })];
    expect(cardFor(cards, 'big-builder', '2026-06-01')?.id).toBe('c1');
    expect(overlapping(cards, '2026-06-01')).toHaveLength(1);
    expect(overlapping([card()], '2026-06-01')).toEqual([]);
  });

  it('prices off the card, and says where the price came from', () => {
    const p = priceFrom(card(), 'Double GPO', 12)!;
    expect(p.cents).toBe(150_000);
    expect(p.from).toMatch(/2026 schedule — Big Builder/);
  });

  it('matches exactly, and returns nothing rather than near enough', () => {
    /*
      A near-enough match is how a business bills a builder for something the schedule does not
      cover, and loses the argument.
    */
    expect(priceFrom(card(), '  double gpo ', 1)?.cents).toBe(12_500);
    expect(priceFrom(card(), 'Double GPO with USB', 1)).toBeNull();
    expect(priceFrom(card(), 'GPO', 1)).toBeNull();
  });

  it('warns before it lapses, and says plainly when it already has', () => {
    expect(cardLine(card(), '2026-06-01')).toMatch(/2 rates, to 2026-12-31/);
    expect(cardLine(card(), '2026-11-15')).toMatch(/worth agreeing the next one/i);
    expect(cardLine(card(), '2027-02-01')).toMatch(/priced off nothing/i);
    expect(cardLine(card({ endsAt: null }), '2026-06-01')).toMatch(/no end date/);
  });
});

/* ── Plant on hire ────────────────────────────────────────────────────────────────────────────── */
const hire = (over: Partial<Hire> = {}): Hire => ({
  id: 'h1', jobId: 'j1', jobRef: 'J-1001', what: 'Scissor lift', supplier: 'Hire Co',
  onHireAt: '2026-06-01T00:00:00.000Z', offHireAt: null, perDayCents: 12_000, ...over,
});

describe('plant that should have gone back', () => {
  it('is fine while the job is still running', () => {
    const w = hireWatch(hire(), null, at('2026-06-10'));
    expect(w.state).toBe('on_hire');
    expect(w.idleDays).toBe(0);
  });

  it('counts the waste from when the JOB finished, not from when it went on hire', () => {
    /*
      The hire up to that point was work; only what comes after is waste. Conflating them makes the
      number enormous and therefore ignorable.
    */
    const w = hireWatch(hire(), '2026-06-10T00:00:00.000Z', at('2026-06-20'));
    expect(w.state).toBe('should_be_back');
    expect(w.days).toBe(19);
    expect(w.idleDays).toBe(10);
    expect(w.wastedCents).toBe(120_000);
    expect(w.says).toMatch(/still on hire/);
  });

  it('says hours-not-dollars when the business has not priced it', () => {
    const w = hireWatch(hire({ perDayCents: null }), '2026-06-10T00:00:00.000Z', at('2026-06-20'));
    expect(w.wastedCents).toBeNull();
    expect(w.says).toMatch(/Record what it costs a day/);
    expect(w.says).not.toMatch(/\$/);
  });

  it('a returned hire is finished', () => {
    const w = hireWatch(hire({ offHireAt: '2026-06-09T00:00:00.000Z' }), '2026-06-10T00:00:00.000Z', at('2026-07-01'));
    expect(w.state).toBe('returned');
    expect(shouldBeBack([w])).toEqual([]);
  });

  it('ranks the worst first and totals what it has cost', () => {
    const ws = [
      hireWatch(hire({ id: 'a' }), '2026-06-18T00:00:00.000Z', at('2026-06-20')),
      hireWatch(hire({ id: 'b' }), '2026-06-01T00:00:00.000Z', at('2026-06-20')),
    ];
    expect(shouldBeBack(ws).map(w => w.hire.id)).toEqual(['b', 'a']);
    expect(plantLine(ws)).toMatch(/2 items are still on hire against a finished job/);
    expect(plantLine(ws)).toMatch(/\$/);
  });

  it('says nothing is on hire when nothing is', () => {
    expect(plantLine([])).toBe('Nothing on hire.');
  });
});

/* ── The last day ─────────────────────────────────────────────────────────────────────────────── */
const leaver = (over: Partial<Leaver> = {}): Leaver =>
  ({ staffId: 's1', name: 'Dana Ward', lastDay: '2026-06-01', done: [], ...over });

describe('somebody leaves', () => {
  it('the two that bite are the login and the seat', () => {
    /*
      A list where every item is equally urgent is a list where the urgent ones hide among the
      polite ones. These two cost money or create risk every day they stay open.
    */
    expect(BITES.sort()).toEqual(['access', 'seat']);
    for (const i of LAST_DAY) {
      expect(i.why.length, i.key).toBeGreaterThan(60);
      expect(i.where, i.key).toMatch(/^\//);
    }
  });

  it('every item points at a register that already exists', () => {
    /* Never a form of its own — the whole problem was that these live in six places and nothing joins them. */
    const wheres = LAST_DAY.map(i => i.where.split('?')[0]);
    expect(new Set(wheres).size).toBeGreaterThan(3);
    expect(wheres).toContain('/people');
    expect(wheres).toContain('/billing');
  });

  it('leads with what is biting, and says what it costs', () => {
    const w = leaverWatch(leaver(), at('2026-06-20'));
    expect(w.biting.map(i => i.key).sort()).toEqual(['access', 'seat']);
    expect(w.says).toMatch(/19 days since Dana Ward left/);
    expect(w.says).toMatch(/cost money or create risk/);
  });

  it('goes quiet about the rest once the biting ones are done', () => {
    const w = leaverWatch(leaver({ done: ['access', 'seat'] }), at('2026-06-20'));
    expect(w.biting).toEqual([]);
    expect(w.says).toMatch(/4 of 6 still to do/);
  });

  it('says all done when it is', () => {
    expect(leaverWatch(leaver({ done: LAST_DAY.map(i => i.key) }), at('2026-06-20')).says).toBe('All done.');
  });

  it('ranks by what is biting before how long ago', () => {
    /* An old tidy exit outranks nothing; a recent open login outranks an old loose end. */
    const ws = stillOpen([
      leaver({ staffId: 'old', name: 'Old', lastDay: '2025-01-01', done: ['access', 'seat'] }),
      leaver({ staffId: 'new', name: 'New', lastDay: '2026-06-18' }),
    ], at('2026-06-20'));
    expect(ws.map(w => w.leaver.name)).toEqual(['New', 'Old']);
  });

  it('the summary names the risk rather than counting chores', () => {
    const ws = stillOpen([leaver()], at('2026-06-20'));
    expect(lastDayLine(ws)).toMatch(/login open or a seat being paid for/);
    expect(lastDayLine([])).toMatch(/Nobody has left with anything still open/);
  });
});

describe('none of the three invents a number', () => {
  it('has no made-up rate, day cost or grace period', () => {
    for (const f of ['src/lib/rate-cards.ts', 'src/lib/plant.ts', 'src/lib/last-day.ts']) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${f} invents a price`).not.toMatch(/DEFAULT_(RATE|COST|PRICE)/);
      expect(code, `${f} invents a grace period`).not.toMatch(/GRACE|ALLOWED_DAYS/);
    }
  });
});

describe('a refusal lands on the screen it names', () => {
  it('joins the query correctly when the screen already has one', () => {
    /*
      This always appended `?cannot=`, so a refusal on `/people?mode=setup` produced an address with
      TWO question marks — and the whole of `setup?cannot=...` was read as the value of `mode`. It
      matches no tab, so somebody refused on the setup screen was silently dropped onto a different
      one with no explanation. Nothing failed, which is why it survived: landing somewhere odd after
      a refusal reads as SPEC being confusing rather than as a bug.
    */
    const src = readFileSync('src/lib/refuse.ts', 'utf8');
    expect(src).toMatch(/screen\.includes\('\?'\) \? '&' : '\?'/);
    expect(src).not.toMatch(/`\$\{screen\}\?cannot=/);
  });

  it('a successful action does not put an empty refusal on the address', () => {
    /* `refuseTo(screen, '')` renders an empty warning box after a save that worked. */
    const src = readFileSync('src/lib/refuse.ts', 'utf8');
    expect(src).toContain('export function backTo');
    for (const f of ['src/app/people/actions.ts', 'src/app/jobs/actions.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/refuseTo\([^,]+,\s*''\)/);
    }
  });
});
