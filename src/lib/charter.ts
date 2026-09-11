/**
 * The Board Charter — the four commitments underneath every scorecard. Pure, no I/O.
 *
 * Everything else in SPEC is negotiated: which roles exist, which two measures sit under each
 * pillar, what each target is. The charter is the part that is not. It is one commitment per
 * pillar, it is the same in every business, and a business that does not hold all four is not
 * running SPEC — it is running a scorecard that happens to have four columns.
 *
 * The distinction that makes the charter work is BASIS.
 *
 * Three of the four are ABSOLUTE. Their number is nought and it is never derived from what the
 * business has been managing. You do not average a year of injuries and set next year's target at
 * what looks achievable — a tolerable number of hurt people is not something a board can put its
 * name to, and the same is true of a breach and of losing somebody the business wanted to keep.
 *
 * One is EARNED. Gross profit has to be the percentage this business needs in order to be
 * profitable, and SPEC does not know that percentage — it is a fact about the business's own costs,
 * read out of its own rolling actuals. Every other number in the charter is fixed precisely because
 * it is not a fact about the business; this one is fixed precisely because it is.
 *
 * See lib/targets for what makes a negotiated target sound rather than merely agreed.
 */

import type { Pillar } from './scoring';

export type Basis = 'absolute' | 'earned';

export interface Commitment {
  pillar: Pillar;
  /** The commitment, in the words a board would sign. */
  says: string;
  /** What the business actually counts to know whether it is holding it. */
  measured: string;
  basis: Basis;
  /** The only acceptable figure, for an absolute commitment. Null where the business supplies it. */
  figure: string | null;
  /** Why this one is not open to negotiation. Shown, not buried — it is the argument for the rule. */
  because: string;
}

/**
 * The four. Deliberately not configurable.
 *
 * Nothing here names an industry, a figure a business would recognise as somebody else's, or a
 * threshold SPEC invented. The Earnings commitment names no percentage at all, because the whole
 * point of it is that the percentage belongs to the business.
 */
export const CHARTER: Commitment[] = [
  {
    pillar: 'safety',
    says: 'Zero harm, physical or mental.',
    measured: 'Injuries, workers compensation claims, and psychosocial harm — counted together, because a business that is safe in one and not the other is not safe.',
    basis: 'absolute',
    figure: '0',
    because: 'A safety target derived from what a business has been managing is a statement about how many people it expects to hurt. There is no version of that a board can sign, so this one is not derived from anything.',
  },
  {
    pillar: 'people',
    says: 'Never lose great talent.',
    measured: 'Departures the business did not want — recorded once, at the exit, by the manager who is losing them.',
    basis: 'absolute',
    figure: '0',
    because: 'Somebody good leaving is the most expensive thing that happens to a business and the one thing that never appears on a P&L. It is counted here so it appears somewhere.',
  },
  {
    pillar: 'earnings',
    says: 'Gross profit at the percentage this business needs to be profitable.',
    measured: 'Gross profit percentage, against the figure read out of the business’s own rolling actuals.',
    basis: 'earned',
    figure: null,
    because: 'This is the one number in the charter SPEC cannot supply. It is a fact about this business’s own costs, and a figure taken from anywhere else is either comfortable enough to be useless or high enough to be ignored.',
  },
  {
    pillar: 'compliance',
    says: 'No breach of the commitments the business has already made.',
    measured: 'Breaches of contract terms and of the people obligations under workplace law — counted as breaches, not scored as a percentage.',
    basis: 'absolute',
    figure: '0',
    because: 'These are promises the business has already given to somebody else. A target of most of them is not a target, it is a plan to break some.',
  },
];

export const commitmentFor = (pillar: Pillar): Commitment =>
  CHARTER.find(c => c.pillar === pillar)!;

/**
 * Each commitment is carried by a hard gate, not by a criterion inside a pillar's percentage.
 *
 * This is the existing Zero Harm mechanism generalised rather than a new one invented: pass or
 * fail, reported beside the score and never averaged into it. That treatment is the whole point —
 * a commitment that can be diluted by three good measures sitting next to it is not a commitment,
 * and a business that hurt somebody has not had a 94% month.
 *
 * Safety deliberately reuses `zero_harm`, which businesses already enter every month. SPEC does not
 * re-ask for anything it has already been told.
 */
export const GATE_KEY: Record<Pillar, string> = {
  safety: 'zero_harm',
  people: 'great_talent',
  earnings: 'gross_profit',
  compliance: 'no_breach',
};

export const pillarForGate = (gate: string): Pillar | null =>
  (Object.keys(GATE_KEY) as Pillar[]).find(p => GATE_KEY[p] === gate) ?? null;

/**
 * Whether a business is holding the charter, pillar by pillar.
 *
 * `held` is deliberately three-valued. A commitment nobody has measured yet is NOT a breach — it is
 * unmeasured, and reporting it as a failure would teach a business to enter something rather than
 * to go and find out. Pending is never red.
 */
export type Held = 'held' | 'broken' | 'unmeasured';

export interface CharterLine {
  commitment: Commitment;
  held: Held;
  /** What the business recorded against it, in its own words. */
  reading: string | null;
  /** The one sentence this line is worth on a board paper. */
  line: string;
}

export function charterStanding(
  readings: { pillar: Pillar; reading: string | null; breached: boolean | null }[],
): CharterLine[] {
  return CHARTER.map(commitment => {
    const found = readings.find(r => r.pillar === commitment.pillar);
    const held: Held = !found || found.breached === null ? 'unmeasured' : found.breached ? 'broken' : 'held';
    return {
      commitment,
      held,
      reading: found?.reading ?? null,
      line:
        held === 'unmeasured'
          ? `Nothing has been recorded against this yet, so the charter cannot say. That is a gap in the record rather than a breach.`
          : held === 'broken'
            ? `Not held this period. A broken commitment goes to the board as a breach with a name and a date against it, not as a percentage.`
            : `Held.`,
    };
  });
}

/** Whether every commitment that has been measured is being held. Unmeasured ones do not count against. */
export const charterHeld = (lines: CharterLine[]): boolean => lines.every(l => l.held !== 'broken');
