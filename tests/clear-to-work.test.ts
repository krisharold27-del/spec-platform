import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * One gate, read from one place.
 *
 * ── Why this test exists ─────────────────────────────────────────────────────────────────────────
 *
 * The rule — `clearToWork` in lib/people — was never the problem. The LOADING of it was: on
 * 26 September four files each assembled the gate's facts for themselves, and the month-ahead
 * schedule, having no role data to hand, gave up and used "is there an induction date?" instead.
 *
 * Four assemblies of one rule is four chances to disagree, and they did. The schedule refused people
 * the People screen called clear, and nothing in the product could say which was right.
 *
 * The fix was a shared loader. The risk with a shared loader is that somebody in a hurry writes a
 * fifth assembly next to it — which would compile, pass every test about its own behaviour, and
 * quietly restore the exact fault. So this test reads the source. Prose asking people not to do it
 * is not a check; this is.
 */

const read = (p: string) => readFileSync(p, 'utf8');

describe('one gate, one loader', () => {
  it('the schedule reads the gate rather than a floor of its own', () => {
    const src = read('src/lib/schedule-ahead-data.ts');
    expect(src).toContain("from './clear-to-work-data'");
    /*
      The floor that stood here until today, put back as a string so it cannot return unnoticed.
      `staff.inductedAt` is a real fact and the loader uses it — what must never come back is this
      file deciding availability from it alone.
    */
    expect(src).not.toMatch(/const inducted = Boolean\(/);
    expect(src).not.toMatch(/clear:\s*inducted/);
  });

  it('the crew picker reads the same loader', () => {
    const src = read('src/lib/jobs-data.ts');
    expect(src).toContain('clearAcross(');
    /* It must not assemble the facts again beside it — that is how the fifth copy starts. */
    expect(src).not.toContain('blockingReasons(');
  });

  /*
    The gate itself takes BOTH halves, and the field is required rather than optional. An optional
    one would let a caller that never looked pass nothing and be told "clear", which is the failure
    the gate exists to prevent wearing the shape of a convenience.
  */
  it('the gate cannot be called with the person half left out', () => {
    const src = read('src/lib/people.ts');
    expect(src).toMatch(/personal: Personal \| null;/);
    expect(src).not.toMatch(/personal\?:/);
  });

  /*
    Proved by putting the fault back: every caller of the gate supplies the person half. If one is
    added that does not, TypeScript refuses it — but a caller can still pass a hard-coded `null` to
    get past the compiler, so the ones that exist are named here and each has a reason.
  */
  it('every caller of the gate passes real facts, not a null to quieten the compiler', () => {
    for (const file of ['src/app/people/page.tsx', 'src/lib/ioc-data.ts', 'src/lib/clear-to-work-data.ts']) {
      const src = read(file);
      expect(src, `${file} should look up a staff row for the person half`).toMatch(/inductedAt: staff/i);
      expect(src, `${file} should pass the tickets it found`).toMatch(/licences:/);
    }
  });

  /* The schema said `inducted_at` "is what Clear to Work reads" while nothing read it. Now it is. */
  it('makes the schema comment true rather than leaving it as prose', () => {
    expect(read('src/db/schema.ts')).toContain('is what Clear to Work reads');
    expect(read('src/lib/people.ts')).toMatch(/inductedAt/);
  });
});
