import { describe, it, expect } from 'vitest';
import {
  TAKE5, complete, mayStart, concerns, needsNote, take5Line, emptyTake5, isQuestion, type Take5,
} from '../src/lib/take5';
import {
  catalogueHealth, catalogueAlert, unused, toRetire, UNUSED_DAYS, WATCH_FROM, BLOATED_AT,
  KEEP_IT_SHORT, type Item,
} from '../src/lib/catalogue-health';

/*
  ── The two minutes before the tools come out ────────────────────────────────────────────────────

  Kris: "start with a safety take 5 and set up the day right".
*/

const TODAY = '2026-09-24';

const answered = (over: Record<string, 'yes' | 'no'> = {}): Take5 => ({
  answers: Object.fromEntries(TAKE5.map(q => [q.key, over[q.key] ?? 'yes'])) as Record<string, 'yes' | 'no'>,
  note: '',
  at: TODAY,
});

describe('the five questions', () => {
  /*
    Five is short enough to do properly every day. Ten gets tapped through — and a Take 5 that gets
    tapped through is worse than none, because it produces a record saying somebody checked when
    nobody did. That is what gets read out at an inquiry.
  */
  it('IS FIVE, and no more', () => {
    expect(TAKE5).toHaveLength(5);
    expect(isQuestion('isolation')).toBe(true);
    expect(isQuestion('paperwork')).toBe(false);
  });

  /* Questions, not tick-boxes: "Is the area clear?" makes somebody look up. "Area clear ✓" does not. */
  it('ASKS RATHER THAN TICKS', () => {
    for (const q of TAKE5) expect(q.ask.trim().endsWith('?'), q.key).toBe(true);
  });

  /* And every "no" has something specific to do — never "report it". */
  it('AND SAYS WHAT TO DO WHEN THE ANSWER IS NO', () => {
    for (const q of TAKE5) {
      expect(q.ifNot.length, q.key).toBeGreaterThan(25);
      expect(q.ifNot, q.key).not.toMatch(/^report it\.?$/i);
    }
  });
});

describe('whether work can start', () => {
  it('needs all five answered — and a no is a perfectly good answer', () => {
    expect(complete(emptyTake5())).toBe(false);
    expect(complete(answered({ hazards: 'no' })), 'a no is still an answer').toBe(true);
    expect(mayStart(emptyTake5()).why).toContain('Answer the five');
  });

  /*
    ── The one that stops the day ───────────────────────────────────────────────────────────────

    Four of the five can be a no with a note and the day carries on sensibly. Working on something
    that has not been isolated and tested dead is the thing that kills electricians, so that one
    stops work and says so plainly.
  */
  it('STOPS THE DAY WHEN NOTHING IS ISOLATED, and only for that one', () => {
    const stop = mayStart(answered({ isolation: 'no' }));
    expect(stop.ok).toBe(false);
    expect(stop.why).toContain('isolated, locked and tested dead');
    expect(stop.why).toContain('supervisor');

    for (const k of ['area', 'hazards', 'gear', 'people']) {
      expect(mayStart(answered({ [k]: 'no' })).ok, `${k} should not stop work`).toBe(true);
    }
  });

  it('lets a clean Take 5 through', () => {
    expect(mayStart(answered()).ok).toBe(true);
  });
});

describe('what the day has to work around', () => {
  it('lists what was answered no', () => {
    expect(concerns(answered({ gear: 'no', people: 'no' })).map(q => q.key)).toEqual(['gear', 'people']);
    expect(concerns(answered())).toEqual([]);
  });

  /* A no with nothing written down is a no nobody can act on. */
  it('ASKS FOR A NOTE WHEN SOMETHING WAS RAISED', () => {
    expect(needsNote(answered({ gear: 'no' }))).toBe(true);
    expect(needsNote({ ...answered({ gear: 'no' }), note: 'Test leads out of date' })).toBe(false);
    expect(needsNote(answered()), 'nothing raised, nothing to write').toBe(false);
  });

  it('reads back plainly to the office', () => {
    expect(take5Line(emptyTake5())).toContain('not done');
    expect(take5Line(answered())).toContain('Nothing of concern');
    expect(take5Line({ ...answered({ gear: 'no' }), note: 'Leads out of date' }))
      .toContain('Leads out of date');
  });
});

/*
  ── Keeping the parts list usable ────────────────────────────────────────────────────────────────

  Kris: "the catalogue must always be streamlined and the system must alert the business if speeds
  slow due to excess items". Nobody decides to let a catalogue reach nine thousand lines — somebody
  imports a supplier's whole file and every search gets slower from then on.
*/

const item = (over: Partial<Item> = {}): Item =>
  ({ id: 'i1', name: 'Double GPO', lastUsedAt: '2026-09-01', createdAt: '2025-01-01', ...over });

describe('the catalogue', () => {
  it('calls an item unused after two quarters', () => {
    expect(UNUSED_DAYS).toBe(180);
    expect(unused(item({ lastUsedAt: '2026-09-01' }), TODAY)).toBe(false);
    expect(unused(item({ lastUsedAt: '2025-01-01' }), TODAY)).toBe(true);
  });

  /*
    An item never used is measured from when it was ADDED — so a file imported this morning is not
    called dead the same day. A business needs time to actually use what it loaded.
  */
  it('DOES NOT CALL THIS MORNING’S IMPORT DEAD', () => {
    expect(unused(item({ lastUsedAt: null, createdAt: TODAY }), TODAY)).toBe(false);
    expect(unused(item({ lastUsedAt: null, createdAt: '2024-01-01' }), TODAY)).toBe(true);
  });

  /*
    Both conditions. A big list that is all in use is a busy business. A small list mostly unused is
    a business that has not started. It is large AND mostly dead that slows everybody down.
  */
  it('ALERTS ONLY WHEN THE LIST IS BIG AND MOSTLY DEAD', () => {
    const big = (n: number, deadFrom: number) =>
      Array.from({ length: n }, (_, i) =>
        item({ id: `i${i}`, lastUsedAt: i < deadFrom ? '2026-09-01' : '2024-01-01' }));

    expect(catalogueHealth(big(1000, 1000), TODAY).slowing, 'big but all used').toBe(false);
    expect(catalogueHealth(big(50, 0), TODAY).slowing, 'all dead but tiny').toBe(false);
    expect(catalogueHealth(big(1000, 100), TODAY).slowing, 'big and 90% dead').toBe(true);
    expect(WATCH_FROM).toBe(300);
    expect(BLOATED_AT).toBe(0.6);
  });

  /* Nothing to report shows NOTHING — an alert that is always on the page is furniture. */
  it('SAYS NOTHING WHEN THERE IS NOTHING TO SAY', () => {
    expect(catalogueAlert(catalogueHealth([item()], TODAY))).toBeNull();
  });

  it('and when there is, it says why it matters and that nothing is deleted', () => {
    const rows = Array.from({ length: 900 }, (_, i) =>
      item({ id: `i${i}`, lastUsedAt: i < 100 ? '2026-09-01' : '2024-01-01' }));
    const said = catalogueAlert(catalogueHealth(rows, TODAY))!;
    expect(said).toContain('search through all of them');
    expect(said).toContain('does not delete anything');
  });

  /* Never automatic — a quietly deleted part is found out the first time somebody needs it. */
  it('OFFERS A LIST TO RETIRE RATHER THAN RETIRING ANYTHING', () => {
    const rows = [item({ id: 'old', lastUsedAt: '2023-01-01' }), item({ id: 'fresh' })];
    expect(toRetire(rows, TODAY).map(i => i.id)).toEqual(['old']);
  });

  it('and names how to keep it short in the first place', () => {
    expect(KEEP_IT_SHORT).toHaveLength(2);
    expect(KEEP_IT_SHORT.join(' ')).toContain('ute');
    // Categories, never vendors — the business names its own suppliers.
    expect(KEEP_IT_SHORT.join(' ')).not.toMatch(/middy|rexel|cnw|mmem/i);
  });
});
