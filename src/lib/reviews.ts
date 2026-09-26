/**
 * Asking every paid customer for a review — the same way, every time.
 *
 * ── The rule that decides this whole file ────────────────────────────────────────────────────────
 *
 * **No review gating.** Every customer whose job is paid gets the same message with the same link.
 * SPEC never asks how it went first and then sends the link only to the ones who said "good".
 *
 * That is not squeamishness. Selectively asking happy customers is against Google's own policy, and
 * a business caught doing it can have its reviews removed — so the feature that looks like it would
 * work better is the one that puts the customer's rating at risk. It is also, separately, a lie
 * about what the business's rating means.
 *
 * So there is one message, sent on one trigger, and this file has no branch on sentiment anywhere
 * in it. `tests/reviews.test.ts` fails if one appears.
 *
 * ── An unhappy customer is a callback, not a review problem ──────────────────────────────────────
 *
 * When somebody is not happy, the answer is not to withhold the link — it is to send the supervisor
 * a callback before the review is written. That is the honest version of "protect the rating", and
 * it is the version that also fixes the job.
 */

/** The one trigger. A job is paid, so the work is finished and settled. */
export type ReviewTrigger = 'paid';

/**
 * The message. One EMAIL for everybody — the business's name and the customer's are filled in, and
 * nothing else varies.
 *
 * An email rather than a text (Kris, 26 September): it carries a link, and a link read down a phone
 * is a link nobody taps. The "how did we go?" call is a separate thing and comes first — that one
 * is a call precisely so anything wrong becomes a callback for the supervisor before it becomes a
 * review. See lib/channels.
 */
export function thankYou(business: string, customer: string, link: string): string {
  const who = customer.trim().split(/\s+/)[0] || 'there';
  return `Hi ${who}, thanks for having ${business.trim()} out. If you have a minute, a quick review really helps us: ${link.trim()}`;
}

/**
 * May this customer be asked?
 *
 * Paid, not asked before, and a link to send them to. Nothing about how the job went — see the note
 * at the top of this file.
 */
export function mayAsk(job: {
  stage: string;
  reviewAskedAt: string | null;
}, link: string | null): { ok: boolean; why: string } {
  if (!link) return { ok: false, why: 'No review link set for this business yet — add one in Setup.' };
  if (job.stage !== 'paid') return { ok: false, why: 'Asked once the job is paid, not before.' };
  if (job.reviewAskedAt) return { ok: false, why: 'Already asked. Nobody gets asked twice.' };
  return { ok: true, why: '' };
}

export interface Review {
  id: string;
  who: string;
  /** 1–5. */
  stars: number;
  text: string;
  at: string;
  /** The business's answer, once somebody has approved it. */
  repliedAt: string | null;
}

/**
 * Every review gets a reply, not only the bad ones.
 *
 * A business that answers its complaints and ignores its compliments reads, on the page, as a
 * business that only shows up when there is trouble.
 */
export const needsReply = (r: Review): boolean => !r.repliedAt;

/** A review this low is a job that went wrong; the supervisor hears about it as a callback. */
export const POOR_AT = 3;

export const isComplaint = (r: Review): boolean => r.stars <= POOR_AT;

export interface ReviewStats {
  asked: number;
  /** Jobs paid and not yet asked — the gap between the rule and what happened. */
  toAsk: number;
  reviews: number;
  average: number;
  needReply: number;
  complaints: number;
}

export function reviewStats(
  reviews: readonly Review[],
  asked: number,
  toAsk: number,
): ReviewStats {
  const stars = reviews.reduce((t, r) => t + r.stars, 0);
  return {
    asked,
    toAsk,
    reviews: reviews.length,
    average: reviews.length ? Math.round((stars / reviews.length) * 10) / 10 : 0,
    needReply: reviews.filter(needsReply).length,
    complaints: reviews.filter(isComplaint).length,
  };
}

/** The headline. Leads on what is owed to somebody, not on the average. */
export function reviewLine(s: ReviewStats): string {
  if (s.complaints > 0) {
    return `${s.complaints} ${s.complaints === 1 ? 'review needs' : 'reviews need'} more than a reply — ${s.complaints === 1 ? 'it is' : 'they are'} with the supervisor as a callback.`;
  }
  if (s.needReply > 0) return `${s.needReply} ${s.needReply === 1 ? 'review is' : 'reviews are'} waiting on a reply.`;
  if (s.toAsk > 0) return `${s.toAsk} paid ${s.toAsk === 1 ? 'job has' : 'jobs have'} not been asked yet.`;
  if (s.reviews > 0) return `${s.reviews} reviews, ${s.average} average. Everyone asked, everyone answered.`;
  return 'Nothing to ask for yet.';
}
