import { STATUSES, type Status } from './status';
import type { Pillar } from './scoring';

/**
 * The KPIs a mirror is about — and what they are doing right now.
 *
 * ── Why a mirror needed this ─────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"the mirrors - these should function like artifacts in claude"*, and then
 * the half that decides what that means: *"helps the staff make good decisions and aligns to key
 * kpi's in the business"*.
 *
 * A mirror's numbers were **stored text**. Every figure on one — the rate board's five rows, the
 * headline, the was-and-now — is JSON written into the row when somebody made it, and nothing has
 * ever recalculated a single one of them. The design's own sentence for this screen is *"Not a
 * snapshot; it updates as the numbers move"*, and the board carried a **Live** badge that was
 * telling the truth about something else entirely: whether the systems it NAMES are connected. The
 * connection was live. The numbers were from whenever somebody typed them.
 *
 * That is the fault this whole product keeps making — a claim nobody checks — printed on the screen
 * a business argues in front of.
 *
 * So a mirror can now carry the business's REAL KPIs: not a copied number, a pointer to the
 * criterion itself. Every time somebody opens the mirror, each one is read again for whatever month
 * they are looking at. Change the month, the lines change. Score the month, the lines change. There
 * is nothing to refresh and nothing to keep up to date, because there is no second copy.
 *
 * ── What makes it help somebody DECIDE ───────────────────────────────────────────────────────────
 *
 * A number on its own settles nothing. Each line carries three things: where it stands, what it was
 * agreed to be, and which pillar it belongs to — so the conversation in front of it is about the
 * gap rather than about whether the figure is right. That is `boards.ts` rule three, kept: every
 * mirror carries the change that would move it.
 */

export interface MirrorKpi {
  criterionId: string;
  roleId: string;
  /** The measure, in the business's own words. */
  text: string;
  pillar: Pillar;
  /** The role it belongs to, so a person knows whose number they are looking at. */
  roleTitle: string;
  /** What was agreed. Null when nobody has agreed one yet, which is itself worth seeing. */
  target: string | null;
  /** How it is going this period, in the business's word for it. Null when the month is unmarked. */
  status: Status | null;
  /** The value as reported — "$827,172 (94.0%)", "16 invoices over 90 days". */
  result: string | null;
}

/**
 * What a line should SAY when there is nothing to say yet.
 *
 * An unmarked month is not a failure and must never read as one. It is the most common state a
 * mirror will be opened in — somebody looks at this month on the 3rd — and a line that shows a red
 * dash for it would have the whole team arguing about a month nobody has scored.
 */
export const kpiStanding = (kpi: MirrorKpi): { label: string; tone: 'green' | 'red' | 'grey' } => {
  if (!kpi.status) return { label: 'Not marked yet', tone: 'grey' };
  const meta = STATUSES[kpi.status];
  if (!meta) return { label: kpi.status, tone: 'grey' };
  return { label: meta.label, tone: meta.tone === 'good' ? 'green' : meta.tone === 'bad' ? 'red' : 'grey' };
};

/**
 * The sentence under a line that turns it into a decision.
 *
 * Deliberately not advice. SPEC states the gap and stops — naming what somebody should do about
 * their own number is the consultant confronting them again, wearing a chart, which is the first
 * rule in `boards.ts` and the reason these things work at all.
 */
export function kpiGap(kpi: MirrorKpi): string {
  if (!kpi.target) return 'No target agreed yet, so there is nothing to be behind.';
  if (!kpi.status) return `Agreed target: ${kpi.target}. This month is not marked yet.`;
  if (!kpi.result) return `Agreed target: ${kpi.target}. Marked, but no figure was entered.`;
  return `${kpi.result} against an agreed ${kpi.target}.`;
}

/**
 * Which of a mirror's rows are live KPIs and which are text somebody typed.
 *
 * Both are legitimate — a plan or a meeting output is genuinely a document, and forcing those
 * through a KPI would be worse. What is not legitimate is a screen that shows them identically, so
 * this exists to keep the two apart everywhere they are drawn.
 */
export const isLive = (row: { criterionId?: string | null }): boolean => !!row.criterionId;
