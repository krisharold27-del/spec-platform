import { redirect } from 'next/navigation';

/**
 * Saying no to somebody, in words they can read.
 *
 * ── The fault this exists to end ─────────────────────────────────────────────────────────────────
 *
 * Kris, 18 September, renaming a role on JBI: *"when changing a name on the org chart it did this"*
 * — and a screenshot of **"This page did not load. Something went wrong on our end."**
 *
 * Nothing had gone wrong on SPEC's end. The server had correctly refused, and it refused by
 * `throw`ing — which renders the generic fault screen. Across the product there were **thirty-nine**
 * of these: every guard on the org chart, on People, on Monthly scoring, on a scorecard, on the KPI
 * screen. Each one carried a sentence worth reading — *"Only the top of the org chart signs the
 * month"*, *"Move the person out of that role first — removing it would lose their placement"* — and
 * not one of those sentences could ever reach a screen. The customer was told the product was
 * broken instead.
 *
 * It is the difference between a REFUSAL and a FAULT, and the product had been conflating them:
 *
 *   A fault is SPEC's problem. Nobody could have avoided it, there is nothing to do about it, and
 *   the fault screen is right — it says so, gives a reference and offers a way back.
 *
 *   A refusal is a rule working. The person asked for something SPEC will not do, there is always a
 *   reason, and the reason is nearly always the next thing they need to know.
 *
 * ── How ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The reason goes back to the screen in the address and the screen prints it. `redirect` rather
 * than `throw`, because the work genuinely did not happen and the person has to be told that
 * clearly — a refusal that looks like a success is worse than either.
 *
 * Not for programming errors. A missing row that should exist, a broken invariant, a failed write —
 * those are faults and should still throw, because a sentence in front of a customer is not the
 * right answer to SPEC being wrong.
 */
export function refuseTo(screen: string, reason: string): never {
  redirect(`${screen}?cannot=${encodeURIComponent(reason)}`);
}

/**
 * Pull the reason back off the address.
 *
 * Length-capped: it is rendered, and anything arriving in an address is somebody else's text until
 * proven otherwise. React escapes it, so this is about keeping a page readable rather than safe.
 */
export const refusedReason = (sp: Record<string, string | string[] | undefined>): string =>
  String(sp.cannot ?? '').slice(0, 300);
