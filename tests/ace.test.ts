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
*/

const closed = (...pcts: (number | null)[]) =>
  pcts.map((rolePct, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, rolePct }));

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

  it('doubles the ceiling in the month it applies', () => {
    const plain = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [] });
    const ace = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [], salesAce: true });
    expect(plain.ceiling).toBe(2000);
    expect(ace.ceiling).toBe(4000);
    expect(ace.payable).toBe(plain.payable * 2);
  });
});
