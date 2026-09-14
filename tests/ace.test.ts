import { describe, it, expect } from 'vitest';
import { aceState, aceName, incentiveFor, ACE_MONTHS_REQUIRED } from '../src/lib/incentive';
import { AT_THE_STANDARD, combinedScore, isSpec } from '../src/lib/scoring';

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

  A MONTH HOLDS ON THE COMBINED SCORE. Kris: "its 90% combined score - 4 quarters - for 3 months
  straight." The four quadrants average into one number and that number is the test — the same
  number the person is shown and paid on. It is NOT the SPEC standing, which is the harder
  every-pillar test in scoring.isSpec. The two quote the same 90% and measure different things.
*/

const closed = (...combined: (number | null)[]) =>
  combined.map((c, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, combined: c }));

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
    ── The combined score, four quadrants averaged, is the test ───────────────────────────────────

    100 / 100 / 100 / 62 combines to 90.5% and COUNTS. This is the deliberate difference between the
    two 90% rules: Ace pays on the number a person is shown, and the SPEC standing — the harder
    every-pillar test — is the one that will not let a weak quadrant be carried. Asserted here so
    nobody "fixes" Ace into the standing later; it has been done once.
  */
  it('counts a month on the combined score even when one quadrant is weak', () => {
    const carried = combinedScore({ safety: 1, people: 1, earnings: 1, compliance: 0.62 });
    expect(carried).toBeCloseTo(0.905, 5);
    expect(aceState(closed(carried, carried, carried), ok).doublesNow).toBe(true);
  });

  it('is not the SPEC standing, which the same months fail', () => {
    const weak = { safety: 1, people: 1, earnings: 1, compliance: 0.62 };
    expect(aceState(closed(combinedScore(weak), combinedScore(weak), combinedScore(weak)), ok).doublesNow).toBe(true);
    expect(isSpec([{ pillars: weak, overall: combinedScore(weak) }, { pillars: weak, overall: combinedScore(weak) }])).toBe(false);
  });

  /* A quadrant nobody scored is left out of the average rather than counted as zero — pending is
     never a failure. A month with nothing scored at all is null, and null breaks the run. */
  it('averages only the quadrants that were scored', () => {
    expect(combinedScore({ safety: 0.92, people: 0.94, earnings: 0.9, compliance: null })).toBeCloseTo(0.92, 5);
    expect(combinedScore({ safety: null, people: null, earnings: null, compliance: null })).toBe(null);
  });

  /*
    ── Which Ace, by department ───────────────────────────────────────────────────────────────────

    "Sales Ace under BD Department and Ops Ace under Ops Department." One rule, two names, and the
    name comes from the org chart.
  */
  it('names the Ace after the department the role sits in', () => {
    expect(aceName('operations')).toBe('Ops Ace');
    expect(aceName('growth')).toBe('Sales Ace');
    expect(aceName('commercial')).toBe('Sales Ace'); // the seed's Head of Commercial is the design's BD Manager
    expect(aceName('bd')).toBe('Sales Ace');
  });

  /* A General Manager is above both departments and in neither. Naming their standing "Sales Ace"
     was a claim about a department they do not work in. */
  it('gives a role above both departments the plain Ace', () => {
    expect(aceName('gm')).toBe('Ace');
    expect(aceName('board')).toBe('Ace');
  });

  it('doubles the ceiling in the month it applies', () => {
    const plain = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [] });
    const ace = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [], salesAce: true });
    expect(plain.ceiling).toBe(2000);
    expect(ace.ceiling).toBe(4000);
    expect(ace.payable).toBe(plain.payable * 2);
  });
});
