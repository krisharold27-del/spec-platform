import { FIX_ORDER } from './register';
import { AT_THE_STANDARD, GREEN_FROM, RED_AT_OR_BELOW } from './pillars';
import { TRACK_RECORD } from './calculator';
import { SOFTWARE_TARGET } from './cockpit';

/**
 * The rules SPEC runs on, read from the code that enforces them.
 *
 * ── Why this is generated rather than written ────────────────────────────────────────────────────
 *
 * A page listing "our principles" is a page that drifts. Somebody changes a threshold in
 * lib/pillars, nobody remembers a paragraph on a screen restates it, and the product now says two
 * things — which is worse than saying nothing, because one of them is being believed.
 *
 * So every line below is BUILT FROM the constant or function that actually decides the behaviour.
 * Change the rule and this changes with it. Get rid of the rule and this stops compiling.
 *
 * What it is for: the owner opening the cockpit should be able to see, without reading code, that
 * the method he spent fifteen years proving is the method the software is running — and that it
 * cannot quietly stop being so.
 */

export interface Rule {
  /** The rule, in the words a person would say it. */
  says: string;
  /** What makes it true — a file, a constant, a test. Checkable, never "we're careful". */
  held: string;
}

const pillarNames: Record<string, string> = {
  people: 'People', compliance: 'Compliance', earnings: 'Earnings', safety: 'Safety',
};

export function rules(): Rule[] {
  return [
    {
      says: `Every fix runs ${FIX_ORDER.map(p => pillarNames[p]).join(', then ')}. Always. Earnings is the result, never the lever.`,
      held: 'FIX_ORDER in lib/register, applied by fixOrder() and held by four tests — including one that fails if a fix ever opens on earnings.',
    },
    {
      says: 'People is never hedged. If people are in it, that is definite, not "possible".',
      held: 'enforce() in lib/diagnose rewrites any reading that comes back otherwise, so the rule survives the model having a bad day.',
    },
    {
      says: 'Harm is a gate, not a step. Safety never appears in a fix order — it stops work instead.',
      held: 'fixOrder() drops it, and Clear to Work is pass-or-fail with no percentage anywhere near it.',
    },
    {
      says: `Green from ${Math.round(GREEN_FROM * 100)}%, amber above ${Math.round(RED_AT_OR_BELOW * 100)}%, red at or under ${Math.round(RED_AT_OR_BELOW * 100)}%. Being SPEC is a higher bar still: ${Math.round(AT_THE_STANDARD * 100)}% on every pillar, two months running.`,
      held: 'GREEN_FROM and RED_AT_OR_BELOW in lib/scoring, read by every light on every screen, and by lib/incentive as the same line a deduction falls on. Red on a card and money coming off mean exactly the same thing — one promise, not two.',
    },
    {
      says: 'A problem nobody owns is a plan, not an overdue task.',
      held: 'lifeOf() in lib/register, five tests. An unowned entry shows its whole reading and asks whether it is right.',
    },
    {
      says: 'When a story names no owner, the fix IS finding one. Nothing is invented.',
      held: 'noOwner in lib/diagnose — enforce() refuses to attach a solution to a problem with nobody behind it.',
    },
    {
      says: 'One business can never see another.',
      held: 'Scoped in application code, proven by tests/tenant-isolation.test.ts, and again by row-level security on every tenant table.',
    },
    {
      says: 'A number is measured, a target, or absent. Never invented.',
      held: 'lib/cockpit types every figure, and tests fail if an unmeasured one ever carries a value.',
    },
    {
      says: `${TRACK_RECORD.improvement}% in the first ${TRACK_RECORD.months} months, across ${TRACK_RECORD.businesses}+ businesses in ${TRACK_RECORD.years} years — the method, not the platform.`,
      held: 'TRACK_RECORD in lib/calculator, rendered from one place so the claim cannot drift between pages.',
    },
    {
      says: `The software target is ${SOFTWARE_TARGET.seats.toLocaleString('en-AU')} seats, and progress is never rounded up to flatter.`,
      held: 'pctLabel() in lib/cockpit shows 0.2% as 0.2%, with a test that says so.',
    },
  ];
}
