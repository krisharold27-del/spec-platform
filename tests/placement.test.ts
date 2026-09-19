import { describe, it, expect } from 'vitest';
import { placementShown } from '../src/lib/queries';

/**
 * ── Which person is in this role, answered the same way everywhere ───────────────────────────────
 *
 * Kris, 19 September, on JBI: *"i am the GM but it wont let me change from anthony to my name"*.
 *
 * A role is meant to hold one person and nothing in the schema enforces it. When a role carries two
 * open placements — an account holder and a pencilled-in name — the chart draws the ACCOUNT HOLDER.
 * The rename action had that rule written a second time, and wrote it as "whichever row came back
 * first". So the rename could land on the staff row while the card was reading the user row: press
 * Save, the name on the card does not change, no error, nothing to do about it.
 *
 * ── Why this is a unit test and not a browser check ──────────────────────────────────────────────
 *
 * I wrote the browser check first, put the fault back to prove it bit, and it passed anyway:
 * Postgres returned the account holder's row first regardless of the order the rows went in. That
 * is the whole point — a database promises NOTHING about row order without an `order by`, so the
 * old code was a coin toss and no end-to-end check can force the coin. A check that cannot fail
 * when the fault is present is not a check.
 *
 * So the rule lives in one function, and this hands it the rows in both orders. Reverting it to
 * "the first row" fails this every single run.
 */

const holder = { userId: 'u-1', staffId: null, id: 'placement-account' };
const pencilled = { userId: null, staffId: 's-1', id: 'placement-pencilled' };

describe('who the card is showing', () => {
  it('PREFERS THE ACCOUNT HOLDER, whichever order the rows arrive in', () => {
    expect(placementShown([holder, pencilled])?.id).toBe('placement-account');
    expect(placementShown([pencilled, holder])?.id).toBe('placement-account');
  });

  it('falls back to the pencilled-in name when nobody holds an account', () => {
    expect(placementShown([pencilled])?.id).toBe('placement-pencilled');
  });

  it('and a vacant role shows nobody', () => {
    expect(placementShown([])).toBe(null);
  });

  /*
    A closed placement is history and must never be drawn. The callers filter on `to_date is null`
    before they get here, so this only records the division of labour — the rule itself is about
    which of the OPEN placements wins, and it must not start guessing about dates as well.
  */
  it('is only ever given open placements to choose between', () => {
    const both = [pencilled, holder];
    expect(placementShown(both)).toBe(holder);
    expect(both).toEqual([pencilled, holder]);   // and it never reorders what it was handed
  });
});
