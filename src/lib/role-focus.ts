/**
 * Making a general role specific — pure, no I/O.
 *
 * ── The idea, in Kris's words ────────────────────────────────────────────────────────────────────
 *
 *   "this add as a general sales supervisor and the function can be adjusted based on other
 *    companies - for jbi this role is for solar sales"
 *
 * One role definition, not one per industry. A Sales Supervisor supervises selling, and the job is
 * the same job whether the thing being sold is solar systems, new homes or service contracts: chase
 * the enquiry, get the quote out, convert it, log it properly, ask for the review. What changes is
 * the noun.
 *
 * The alternative — a separate "Solar Sales Supervisor" template, then a "New Homes Sales
 * Supervisor", then a "Service Contracts Sales Supervisor" — is the trap. Six months later they
 * have drifted apart, an improvement made to one is missing from the others, and nobody can say
 * which is the real one. That is the same drift this codebase keeps catching in itself, and the
 * same answer applies: one definition, varied at the edge.
 *
 * So the template writes {focus} and the business fills it in once.
 */

/**
 * Put the business's word where the template left a gap.
 *
 * With no focus set the placeholder is removed rather than left showing, and the spacing tidied.
 * "{focus} quote turnaround within target" has to read as "Quote turnaround within target" for a
 * business that has not set one — never as "{focus} quote turnaround", which looks broken and is
 * the exact fault lib/targets was written to avoid on the targets side.
 */
export function applyFocus(text: string, focus: string | null | undefined): string {
  const word = (focus ?? '').trim();
  const out = text.replace(/\{focus\}/gi, word).replace(/\s{2,}/g, ' ').trim();
  // A sentence that began with the placeholder now begins lower-case. Put the capital back.
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

/**
 * How the role reads on a chart and a scorecard.
 *
 * An em-dash rather than brackets or a slash: "Sales Supervisor — Solar" is how somebody would say
 * it out loud, and the chart is read by people who have never used software like this before.
 */
export function focusedTitle(title: string, focus: string | null | undefined): string {
  const word = (focus ?? '').trim();
  if (!word) return title;
  // Already says it — "Solar Sales Supervisor" with focus "Solar" must not become
  // "Solar Sales Supervisor — Solar".
  if (title.toLowerCase().includes(word.toLowerCase())) return title;
  return `${title} — ${word}`;
}

/**
 * Which roles are worth asking the question about.
 *
 * Only roles whose template left a {focus} gap, or whose title is generic enough that the business
 * will want to say. Asking a Managing Director what their General Manager role "focuses on" is a
 * question with no good answer, and a setup screen full of those is how somebody gives up.
 */
export function needsFocus(templateId: string | null | undefined, criteriaText: string[]): boolean {
  if (templateId === 'sales_supervisor') return true;
  return criteriaText.some(t => /\{focus\}/i.test(t));
}

/** What to suggest before the business has said. Never invented — only ever what the template set. */
export const FOCUS_PROMPT = 'What does this role sell or cover? One or two words — Solar, New Homes, Service Contracts.';
