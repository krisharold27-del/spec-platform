import { ACE_MONTHS_REQUIRED, type AceName } from './incentive';
import { AT_THE_STANDARD, PILLARS, type Pillar } from './scoring';

/**
 * Ace watch — every role's run, in one place.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Kris: "add an Ace to each role — scored when the person hits 3 months in a row — resets and then
 * begins the 3 month focus again."
 *
 * The Ace was real but private: it only appeared on the one scorecard whose roleId was in the URL.
 * So the person on their third month could see it, and the director signing the month off — the one
 * who actually approves the doubled payment — could not see it anywhere at all. The design has
 * carried "Ace watch" on Monthly Scoring since the first export: a card per role, the run as month
 * pills, and a line saying what broke it.
 *
 * ── Why this half has no database in it ──────────────────────────────────────────────────────────
 *
 * The shape lib/incentive and lib/incentive-data already use: the rule is pure and testable, the
 * read is separate. What a manager READS — the note naming the quadrant that broke a run, the order
 * the rows come in — is the whole value of this section, and it can be proved here without standing
 * up a database. lib/ace-watch-data does the reading.
 */

export interface AceWatchRow {
  roleId: string;
  roleTitle: string;
  /** The person in the seat, or null for a seat nobody holds yet. */
  person: string | null;
  /** Sales Ace in BD, Ops Ace in Operations, plain Ace above both. */
  aceName: AceName;
  /** The recent closed months, oldest first, with whether each held. */
  run: { period: string; held: boolean }[];
  consecutive: number;
  required: number;
  /** The run completed on the last closed month, so the month being scored is doubled. */
  doublesNow: boolean;
  /** The run is there and the sign-off is not. */
  blockedBySignoff: boolean;
  /**
   * Trained on the job and signed off in THIS role.
   *
   * Carried so the card cannot contradict itself. The months are counted whether or not somebody is
   * signed off — they should be able to see where they are — but a card reading "1 of 3 months"
   * beside a note saying the run cannot start is two answers to one question, and this codebase has
   * already shipped that fault once (95% on a green tile labelled "Watch"). The chip says which of
   * the two things is missing; the pills still show the months.
   */
  signedOff: boolean;
  /** Plain English: what state this is and what did it. Never just a count. */
  note: string;
}

/** How many closed months of history to show as pills. The run itself reads all of them. */
export const SHOW_MONTHS = 3;

/**
 * The ones closest to the money first: paying now, then blocked only by a sign-off somebody can go
 * and do today, then by how far along the run is, then alphabetically so the order is stable between
 * two loads of the same page.
 *
 * A director reading this top-down reads it in the order they can act on it, which is the only
 * ordering worth having — "everybody, alphabetically" makes them scan a list to find the one row
 * that costs money this month.
 */
export function byClosestToPaying(a: AceWatchRow, b: AceWatchRow): number {
  return Number(b.doublesNow) - Number(a.doublesNow)
    || Number(b.blockedBySignoff) - Number(a.blockedBySignoff)
    || b.consecutive - a.consecutive
    || a.roleTitle.localeCompare(b.roleTitle);
}

/**
 * What state this is, and what put it there.
 *
 * A count is not an answer. "1 of 3" tells a manager nothing they can act on; "People at 86% broke
 * the run in August" tells them what the conversation is. So when a run has been broken, the note
 * names the weakest quadrant of the month that broke it — which is nearly always the thing a
 * one-to-one would have caught.
 */
export function noteFor({ state, history, signedOff }: {
  state: { consecutive: number; doublesNow: boolean; blockedBySignoff: boolean };
  history: { period: string; combined: number | null; pillars: Record<Pillar, number | null> }[];
  signedOff: boolean;
}): string {
  const standard = Math.round(AT_THE_STANDARD * 100);

  if (state.doublesNow) {
    return `Three closed months at ${standard}% or above. The incentive is doubled for this month, and the three-month focus starts again.`;
  }
  if (state.blockedBySignoff) {
    return `Three closed months at ${standard}% or above — the numbers are there. The doubling waits on being trained on the job and signed off.`;
  }
  if (!signedOff) {
    return 'Not yet signed off on the role’s on-the-job training, so the run cannot start.';
  }
  if (history.length === 0) {
    return `No closed months yet. The run starts with the first month that closes at ${standard}% or above.`;
  }

  const last = history[history.length - 1];
  if (last.combined === null) {
    return `Nothing was scored in ${last.period}, so the run is back to nothing.`;
  }
  if (state.consecutive === 0) {
    const weakest = PILLARS
      .map(p => ({ p, v: last.pillars[p] }))
      .filter((x): x is { p: Pillar; v: number } => x.v !== null)
      .sort((a, b) => a.v - b.v)[0];
    const because = weakest
      ? ` ${weakest.p[0].toUpperCase()}${weakest.p.slice(1)} at ${Math.round(weakest.v * 100)}% is what pulled it down.`
      : '';
    return `${last.period} combined at ${(last.combined * 100).toFixed(1)}%, which breaks the run.${because}`;
  }
  const left = ACE_MONTHS_REQUIRED - state.consecutive;
  return `${state.consecutive} of ${ACE_MONTHS_REQUIRED} months held. ${left === 1 ? 'One more month' : `${left} more months`} at ${standard}% or above and the incentive doubles the month after.`;
}
