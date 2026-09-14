import { describe, it, expect } from 'vitest';
import { aceState, incentiveFor, ACE_MONTHS_REQUIRED } from '../src/lib/incentive';
import { AT_THE_STANDARD } from '../src/lib/scoring';

/*
  ── Ace: three closed months at the standard, and the NEXT month is doubled ──────────────────────

  From the design, in its own words: "Trained on the job, signed off, 90% or better on the KPI board
  three consecutive closed months doubles the incentive automatically — then the three-month
  challenge starts again."

  Two things in that sentence were built wrong first time, and both are money.

  IT PAYS THE MONTH AFTER. Jul, Aug and Sep close at the standard and the incentive doubles from
  October. It is the only version that can work: a month is not known to have held until it is
  closed and signed, so a run is read backwards and the reward applies forwards. Paying September
  would mean paying for September out of September's own result before it was final.

  BEING SIGNED OFF IS A PRECONDITION. Ace says somebody can do the job to the standard, not merely
  that the numbers landed. Without the sign-off the run still shows and nothing doubles.

  A third was found later and is money too: A MONTH HOLDS ON EVERY PILLAR, NOT THE AVERAGE. Kris:
  "sales ace — 90+ on spec 3 months in a row — ops ace — 90+ on spec 3 months in a row". On spec,
  and the design says the same: "the board needs every pillar at 90% or better for three months
  straight". See the `every pillar` block at the bottom.
*/

/** A month where all four pillars landed on the same number — the shorthand most cases need. */
const closed = (...pcts: (number | null)[]) =>
  pcts.map((v, i) => ({
    period: `2026-${String(i + 1).padStart(2, '0')}`,
    pillars: { safety: v, people: v, earnings: v, compliance: v },
  }));

/** A month spelled out pillar by pillar, for the cases where they differ. */
const month = (period: string, safety: number | null, people: number | null, earnings: number | null, compliance: number | null) =>
  ({ period, pillars: { safety, people, earnings, compliance } });

const ok = { signedOff: true };

describe('the Ace run', () => {
  it('needs three consecutive closed months at the standard', () => {
    expect(ACE_MONTHS_REQUIRED).toBe(3);
    expect(aceState(closed(0.95, 0.92), ok).doublesNow).toBe(false);
    expect(aceState(closed(0.95, 0.92, 0.91), ok).doublesNow).toBe(true);
  });

  it('doubles the month AFTER the run, not the month that completes it', () => {
    // Jul, Aug, Sep closed at the standard → the open month (October) is doubled.
    const afterThree = aceState(closed(0.95, 0.95, 0.95), ok);
    expect(afterThree.doublesNow).toBe(true);
    // Once October has itself closed, the count has restarted and November is not doubled.
    const afterFour = aceState(closed(0.95, 0.95, 0.95, 0.95), ok);
    expect(afterFour.doublesNow).toBe(false);
    expect(afterFour.consecutive).toBe(1);
  });

  it('starts the challenge again, so a perfect year doubles four months', () => {
    let doubled = 0;
    for (let months = 1; months <= 12; months++) {
      if (aceState(closed(...Array(months).fill(0.95)), ok).doublesNow) doubled += 1;
    }
    expect(doubled).toBe(4);
  });

  /* No partial credit. A run that survives a bad month is not a run. */
  it('resets on a single closed month below the standard', () => {
    expect(aceState(closed(0.95, 0.95, 0.89), ok).doublesNow).toBe(false);
    expect(aceState(closed(0.95, 0.95, 0.89), ok).consecutive).toBe(0);
    expect(aceState(closed(0.95, 0.95, 0.89, 0.95, 0.95, 0.95), ok).doublesNow).toBe(true);
  });

  it('treats exactly 90% as at the standard', () => {
    expect(AT_THE_STANDARD).toBe(0.9);
    expect(aceState(closed(0.9, 0.9, 0.9), ok).doublesNow).toBe(true);
    expect(aceState(closed(0.899, 0.9, 0.9), ok).doublesNow).toBe(false);
  });

  /* An unscored month is not at the standard — counting it as one would double off a month nobody
     marked. */
  it('breaks the run on a closed month nobody scored', () => {
    expect(aceState(closed(0.95, null, 0.95), ok).doublesNow).toBe(false);
  });

  /* The precondition. The numbers alone are not Ace. */
  it('holds the doubling until the person is trained and signed off', () => {
    const notSigned = aceState(closed(0.95, 0.95, 0.95), { signedOff: false });
    expect(notSigned.doublesNow).toBe(false);
    // And says WHY, so the page can show the run rather than a flat no.
    expect(notSigned.blockedBySignoff).toBe(true);
  });

  it('does not blame the sign-off when the run is not there either', () => {
    expect(aceState(closed(0.95), { signedOff: false }).blockedBySignoff).toBe(false);
  });

  /*
    ── Every pillar, never the average ────────────────────────────────────────────────────────────

    100 / 100 / 100 / 62 averages 90.5%. On the old reading that was three months of Ace and double
    pay, with a quarter of the person's job failing the whole time — and the same run would have
    ticked green on the strip while the org chart beside it painted that quadrant amber. Averaging
    lets three strong pillars buy off a weak one, which is the trade SPEC exists to refuse.
  */
  it('does not count a month that averages 90% with a pillar below it', () => {
    const carried = [
      month('2026-07', 1, 1, 1, 0.62),
      month('2026-08', 1, 1, 1, 0.62),
      month('2026-09', 1, 1, 1, 0.62),
    ];
    expect(carried.map(m => (1 + 1 + 1 + 0.62) / 4)).toEqual([0.905, 0.905, 0.905]); // an average that passes
    expect(aceState(carried, ok).doublesNow).toBe(false); // and a run that does not
    expect(aceState(carried, ok).consecutive).toBe(0);
  });

  it('counts a month only when all four pillars are at the standard', () => {
    const allFour = [
      month('2026-07', 0.9, 0.95, 1, 0.92),
      month('2026-08', 0.91, 0.9, 0.99, 0.9),
      month('2026-09', 1, 1, 0.9, 0.95),
    ];
    expect(aceState(allFour, ok).doublesNow).toBe(true);
  });

  /* One blank quadrant is not a failure and deducts nothing — but a run is a positive claim, and
     nobody can say the board held at 90% while a quarter of it is unmarked. */
  it('does not count a month with a pillar nobody scored', () => {
    const blank = [
      month('2026-07', 1, 1, 1, 1),
      month('2026-08', 1, 1, 1, null),
      month('2026-09', 1, 1, 1, 1),
    ];
    expect(aceState(blank, ok).doublesNow).toBe(false);
    expect(aceState(blank, ok).consecutive).toBe(1);
  });

  it('doubles the ceiling in the month it applies', () => {
    const plain = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [] });
    const ace = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [], salesAce: true });
    expect(plain.ceiling).toBe(2000);
    expect(ace.ceiling).toBe(4000);
    expect(ace.payable).toBe(plain.payable * 2);
  });
});
