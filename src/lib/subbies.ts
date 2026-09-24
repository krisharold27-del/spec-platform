/**
 * Subcontractors — the six checks that decide whether somebody can be booked.
 *
 * ── Kris's correction, 24 September ──────────────────────────────────────────────────────────────
 *
 * An earlier draft of the design had subbies free on SPEC, on the reasoning that a free seat means
 * every subbie gets set up. Kris reversed it: *"subcontractors are people working for the business
 * and are held to the full expectation on every job. Each subbie is a PAID TEAM SEAT, not free.
 * Same SWMS, checklists and KPIs as employees; their scores count on their supervisor's team board
 * and feed the team KPIs."*
 *
 * That is the whole design of this file. A subcontractor is not a supplier with a folder of
 * certificates — they are a person on the job, held to what everybody else is held to, and the only
 * thing that differs is what they can SEE: their own jobs, never the business's prices.
 *
 * ── Six checks, all six, or they cannot be booked ────────────────────────────────────────────────
 *
 * Not a score, not a percentage — six yes-or-no answers, and all six have to be yes. A business
 * that books an uninsured subbie onto a site is carrying that risk itself, and "five out of six"
 * is exactly the reasoning that gets somebody onto a site uninsured.
 */

export type CheckKind = 'abn' | 'subcontract' | 'liability' | 'workers_comp' | 'licence' | 'induction';

export const CHECKS: { key: CheckKind; label: string; why: string; expires: boolean }[] = [
  { key: 'abn', label: 'ABN and GST', why: 'Without it the payment is wages, not a subcontract, and the business carries the tax.', expires: false },
  { key: 'subcontract', label: 'Subcontract', why: 'Rates and payment terms in writing, before the first job rather than after the first argument.', expires: false },
  { key: 'liability', label: 'Public liability', why: 'If they put a screwdriver through a water main, this is what stands between the business and the bill.', expires: true },
  { key: 'workers_comp', label: 'Workers’ comp or personal accident', why: 'If they are hurt on your site with neither, the claim comes to you.', expires: true },
  { key: 'licence', label: 'Trade licence and White Card', why: 'Unlicensed work is not work — it has to be done again by somebody licensed.', expires: true },
  { key: 'induction', label: 'Site induction and SWMS', why: 'The same induction and the same SWMS as everybody else. They are on the job, not beside it.', expires: false },
];

export const isCheckKind = (v: string): v is CheckKind => CHECKS.some(c => c.key === v);

export const checkLabel = (v: string): string => CHECKS.find(c => c.key === v)?.label ?? 'Check';

/** How far ahead an expiry is warned. The same 30 days Clear to Work uses, so one rule, one number. */
export const WARN_DAYS = 30;

export type CheckState = 'missing' | 'current' | 'expiring' | 'expired';

export interface Check {
  kind: string;
  expiresAt: string | null;
  state: string;
}

/**
 * What a check actually is today.
 *
 * The stored state says what was recorded; this says what is true now, because a certificate
 * recorded as current in March is not current in October. A date that has passed outranks whatever
 * anybody typed.
 */
export function stateOf(c: Check, today: string): CheckState {
  if (c.state === 'missing') return 'missing';
  if (!c.expiresAt) return 'current';
  if (c.expiresAt < today) return 'expired';
  return c.expiresAt <= addDays(today, WARN_DAYS) ? 'expiring' : 'current';
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * May this subcontractor be booked onto a job?
 *
 * All six current. Not five, not "the important ones" — see the note at the top. The refusal names
 * what is missing, because a refusal somebody cannot act on becomes a refusal somebody works
 * around.
 */
export function mayBook(checks: readonly Check[], today: string): { ok: boolean; why: string; blocked: string[] } {
  const bad = CHECKS.filter(c => {
    const found = checks.find(x => x.kind === c.key);
    if (!found) return true;
    const s = stateOf(found, today);
    return s === 'missing' || s === 'expired';
  });
  if (!bad.length) return { ok: true, why: '', blocked: [] };
  const names = bad.map(c => c.label);
  return {
    ok: false,
    why: `Not clear to work: ${names.join(', ')}. ${bad.length === 1 ? 'That one is' : 'Those are'} what stops them being booked.`,
    blocked: names,
  };
}

/** What is about to lapse, so it is chased before it stops work rather than after. */
export function expiringSoon(checks: readonly Check[], today: string): Check[] {
  return checks.filter(c => stateOf(c, today) === 'expiring');
}

/**
 * The chase, drafted.
 *
 * SPEC writes it; a person sends it. A message that goes out on its own is a message the business
 * did not know it sent, and the first time it is wrong it is the business's name on it.
 */
export function chaseText(business: string, subbie: string, kind: string, expiresAt: string): string {
  const who = subbie.trim().split(/\s+/)[0] || 'there';
  return `Hi ${who}, your ${checkLabel(kind).toLowerCase()} expires ${expiresAt}. Send the new one through and we will keep you on the schedule — without it we cannot book you after that date. Thanks, ${business.trim()}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What a subbie may see
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The fields a subcontractor must never be shown.
 *
 * They see their own jobs — where, when, the SWMS, what to do — and nothing about what the business
 * charges for it. This is written down and tested for the same reason the customer page's list is:
 * the risk is not a decision anybody makes, it is a later edit handing a whole row to a template.
 */
export const HIDDEN_FROM_SUBBIES = [
  'valueCents', 'materialsCents', 'labourCents', 'margin', 'chargeCents', 'quotedCents',
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
 * The invoice they send
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Check a subbie's invoice against what the schedule and the job actually say.
 *
 * The example Kris gave is the exact case: five days of scaffold hire claimed against four on the
 * schedule. Nobody has the schedule in front of them when the invoice lands three weeks later, so
 * it gets paid. Holding the payment and drafting the query is the entire value — the query is the
 * hard part, not the arithmetic.
 */
export interface SubbieClaim {
  /** What they are claiming for, in their words. */
  what: string;
  claimedDays: number;
  claimedCents: number;
}

export function checkClaim(
  claim: SubbieClaim,
  booked: { days: number },
): { ok: boolean; holds: boolean; says: string } {
  if (claim.claimedDays <= booked.days) {
    return { ok: true, holds: false, says: 'Matches the schedule.' };
  }
  const over = claim.claimedDays - booked.days;
  return {
    ok: false,
    holds: true,
    says: `${claim.claimedDays} days claimed, ${booked.days} on the schedule — ${over} more. Held until somebody checks; it may be right, and the schedule may be what is wrong.`,
  };
}

/** Draft the query. Never an accusation — the schedule is wrong about as often as the invoice is. */
export function queryText(business: string, subbie: string, claim: SubbieClaim, booked: { days: number }): string {
  const who = subbie.trim().split(/\s+/)[0] || 'there';
  return `Hi ${who}, quick one on your invoice for ${claim.what}: we have ${booked.days} days on the schedule and the invoice is for ${claim.claimedDays}. Can you let us know which days so we can line it up? Thanks, ${business.trim()}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Where they sit
 * ───────────────────────────────────────────────────────────────────────────── */

export interface SubbieStats {
  active: number;
  onboarding: number;
  blocked: number;
  expiring: number;
}

export function subbieStats(
  rows: readonly { id: string; status: string }[],
  checksBySubbie: Map<string, Check[]>,
  today: string,
): SubbieStats {
  const live = rows.filter(r => r.status === 'active');
  return {
    active: live.filter(r => mayBook(checksBySubbie.get(r.id) ?? [], today).ok).length,
    onboarding: rows.filter(r => ['invited', 'onboarding'].includes(r.status)).length,
    blocked: live.filter(r => !mayBook(checksBySubbie.get(r.id) ?? [], today).ok).length,
    expiring: live.reduce((t, r) => t + expiringSoon(checksBySubbie.get(r.id) ?? [], today).length, 0),
  };
}

/** The headline. Never reads as fine while somebody on the schedule cannot legally be there. */
export function subbieLine(s: SubbieStats): string {
  if (s.blocked > 0) {
    return `${s.blocked} ${s.blocked === 1 ? 'subcontractor is' : 'subcontractors are'} not clear to work and cannot be booked.`;
  }
  if (s.expiring > 0) return `${s.expiring} ${s.expiring === 1 ? 'check expires' : 'checks expire'} within ${WARN_DAYS} days.`;
  if (s.onboarding > 0) return `${s.onboarding} still setting themselves up.`;
  if (s.active > 0) return `${s.active} clear to work. Nothing expiring.`;
  return 'No subcontractors yet.';
}
