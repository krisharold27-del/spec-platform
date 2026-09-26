/**
 * What the customer sees — the link that goes in every email SPEC sends them.
 *
 * ── The one screen the business does not control ─────────────────────────────────────────────────
 *
 * Everything else in SPEC is for people who work at the business. This is the other side: the
 * customer, on their phone, who wants to know when somebody is coming and what it is going to cost.
 * Most of the phone calls a trade business fields are one of five questions, and all five are
 * answered here without anybody picking up.
 *
 * ── No sign-in, and what that costs ──────────────────────────────────────────────────────────────
 *
 * A customer will not make an account to find out when the electrician is arriving. So the link
 * itself is the key: a long random token, one per job, that names nothing about the customer and
 * can be revoked. That is the same trade-off every booking confirmation on the internet makes, and
 * it is worth being explicit about — anybody with the link sees the job, so the link is treated as
 * a credential: it is never in an address SPEC prints in a page, never guessable, and can be turned
 * off when a job is finished.
 *
 * The page shows the job, the times, the variation and the invoice. It never shows what the work
 * cost the business, the margin, the crew's rates, or any other job.
 */

/** Long enough that guessing is not a strategy. 32 hex characters, from a real random source. */
export const TOKEN_LENGTH = 32;

export const isToken = (v: string): boolean => /^[0-9a-f]{32}$/.test(String(v ?? ''));

/* ─────────────────────────────────────────────────────────────────────────────
 * Where the job has got to, in the customer's words
 * ───────────────────────────────────────────────────────────────────────────── */

export type CustomerStage = 'approved' | 'booked' | 'on_the_way' | 'working' | 'done' | 'paid';

export const CUSTOMER_STAGES: { key: CustomerStage; label: string }[] = [
  { key: 'approved', label: 'Quote approved' },
  { key: 'booked', label: 'Booked' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'working', label: 'Working' },
  { key: 'done', label: 'Done' },
  { key: 'paid', label: 'Paid' },
];

/**
 * The job's own stage, said the way a customer would say it.
 *
 * The board's words are for the business — "won", "invoiced" — and they mean nothing to somebody
 * waiting at home. A customer never sees "enquiry" either: a job nobody has quoted yet has nothing
 * to tell them, and this page is not where a quote is negotiated.
 */
export function customerStage(job: { stage: string; bookedAt?: string | null; onWayAt?: string | null }): CustomerStage {
  if (job.stage === 'paid') return 'paid';
  if (job.stage === 'invoiced') return 'done';
  if (job.stage === 'onsite') return job.onWayAt ? 'on_the_way' : 'working';
  if (job.stage === 'scheduled') return 'booked';
  return 'approved';
}

/** The heading, which is the answer to the question they opened the link to ask. */
export function headline(stage: CustomerStage, who: string, slot: string | null): string {
  switch (stage) {
    case 'approved': return 'Your quote is approved. Pick a time.';
    case 'booked': return slot ? `Booked for ${slot}` : 'Booked. We will confirm the time.';
    case 'on_the_way': return `${who || 'Your electrician'} is on the way`;
    case 'working': return `${who || 'Your electrician'} is on site`;
    case 'done': return 'All done. Here is your invoice.';
    case 'paid': return 'Paid. Thank you.';
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A variation, decided by the person paying for it
 * ───────────────────────────────────────────────────────────────────────────── */

export type VariationAnswer = 'approved' | 'call_me';

/**
 * Extra work, priced, with two honest answers.
 *
 * "Approve" and "Call me first" — and NOT a bare "decline", which sounds like refusing the work
 * rather than wanting to talk about it. Almost nobody who hesitates over an extra cost wants to say
 * no outright; they want two minutes on the phone. Giving them a button that says that is what
 * turns a variation into an agreed variation instead of an argument at invoicing.
 */
export const VARIATION_ANSWERS: { key: VariationAnswer; label: string }[] = [
  { key: 'approved', label: 'Approve the extra cost' },
  { key: 'call_me', label: 'Call me first' },
];

export const isVariationAnswer = (v: string): v is VariationAnswer =>
  VARIATION_ANSWERS.some(a => a.key === v);

/**
 * May this customer still answer the variation?
 *
 * Only while it is unanswered and the job is not finished. A variation approved after the invoice
 * has gone is not an agreement, it is a customer being asked to sign something retrospectively.
 */
export function mayAnswer(v: { state: string } | null, jobStage: string): boolean {
  if (!v) return false;
  if (v.state !== 'draft') return false;
  return jobStage !== 'paid';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What the customer may never see
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The fields that must never reach this page.
 *
 * Written down as a list, and checked by a test, because the danger here is not a decision anybody
 * makes — it is a future edit passing the whole job row to a template that renders what it is
 * given. What the work cost, the margin, the labour rates and the supplier prices are the
 * business's, and a customer who sees a 42% margin on their switchboard does not come back.
 */
export const NEVER_SHOWN = [
  'costCents', 'materialsCents', 'labourCents', 'margin', 'chargeCents', 'supplier',
] as const;

/** Exactly what the page is allowed to know about a job. Built here so nothing else can widen it. */
export interface CustomerView {
  ref: string;
  title: string;
  site: string;
  business: string;
  stage: CustomerStage;
  /** Who is coming, first name only — the customer does not need a staff directory. */
  who: string;
  slot: string | null;
  /** How far away, in minutes, when somebody has said they are on the way. */
  etaMinutes: number | null;
  vehicle: string | null;
  variation: { what: string; amountCents: number; state: string } | null;
  invoice: { amountCents: number; state: string; ref: string } | null;
}

/**
 * "Hi Sam" — the first line of the page, as the design has it (`SPEC Customer Page.dc.html`).
 *
 * Only a first name, and only when the job is for a person: a job logged against "Ridge Homes Pty
 * Ltd" is read by whoever at Ridge Homes opened the link, and "Hi Ridge" is worse than "Hi there".
 * The first name is all the page needs; the rest of the customer's name never reaches it.
 */
export function greeting(client: string | null | undefined): string {
  const c = (client ?? '').trim();
  const business = /\b(pty|ltd|limited|inc|group|homes|builders?|construction|constructions|services|holdings|trust|co|company|council|school|church|club|&)\b/i;
  const first = c.split(/\s+/)[0] ?? '';
  if (!c || business.test(c) || !/^[A-Za-z][A-Za-z'’-]{0,29}$/.test(first) || /^new$/i.test(first)) return 'Hi there';
  return `Hi ${first[0].toUpperCase()}${first.slice(1)}`;
}
