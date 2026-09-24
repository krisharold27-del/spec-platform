/**
 * Government money for taking on an apprentice, and the day each claim opens.
 *
 * ── Money left on the table ──────────────────────────────────────────────────────────────────────
 *
 * Incentives and rebates for apprentices are real money a business is entitled to and routinely
 * does not claim — not because anybody decides not to, but because the claim opens on a date
 * somewhere in a training contract, nobody is watching for it, and by the time it comes up the
 * window has closed. The whole value of this is the date.
 *
 * ── SPEC never invents an amount ─────────────────────────────────────────────────────────────────
 *
 * The design is explicit: *"Amounts are confirmed with your Apprenticeship Support Network
 * provider."* The figures change with the scheme, the state, the year of the apprenticeship and
 * who the employer is, and a number SPEC made up and showed as claimable is worse than no number —
 * it is a business budgeting for money that is not coming.
 *
 * So an amount is only ever what somebody recorded after confirming it, and a claim with no amount
 * says so rather than showing a zero. `tests/apprentice-funding.test.ts` fails if a figure is ever
 * hard-coded here.
 */

export type ClaimState = 'not_open' | 'claimable' | 'claimed' | 'received' | 'missed';

export const CLAIM_LABEL: Record<ClaimState, string> = {
  not_open: 'Not open yet',
  claimable: 'Claimable now',
  claimed: 'Claimed, waiting',
  received: 'Received',
  missed: 'Window closed',
};

export interface Claim {
  id: string;
  /** Who it is for. */
  who: string;
  /** What the claim is, in the provider's own words — never SPEC's. */
  what: string;
  /** YYYY-MM-DD, the day it can be lodged. */
  opensAt: string | null;
  /** YYYY-MM-DD, after which it cannot. Null when the scheme sets no closing date. */
  closesAt: string | null;
  /** Only ever what somebody recorded after confirming it. Null until then. */
  amountCents: number | null;
  claimedAt: string | null;
  receivedAt: string | null;
}

/**
 * Where a claim has got to.
 *
 * Read from the dates rather than a stored status, for the same reason every other date in SPEC is:
 * a claim recorded as "claimable" in March is not claimable in October if its window shut in June,
 * and the row would go on saying it was.
 */
export function claimState(c: Claim, today: string): ClaimState {
  if (c.receivedAt) return 'received';
  if (c.claimedAt) return 'claimed';
  if (c.closesAt && c.closesAt < today) return 'missed';
  if (!c.opensAt || c.opensAt > today) return 'not_open';
  return 'claimable';
}

/** How many days until it opens — the number that makes this worth looking at. */
export function daysUntil(opensAt: string | null, today: string): number | null {
  if (!opensAt) return null;
  return Math.round((Date.parse(`${opensAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Claimable now, or opening soon enough to get the paperwork ready. */
export const SOON_DAYS = 30;

export function needsAttention(c: Claim, today: string): boolean {
  const s = claimState(c, today);
  if (s === 'claimable') return true;
  if (s !== 'not_open') return false;
  const d = daysUntil(c.opensAt, today);
  return d !== null && d <= SOON_DAYS;
}

/** Claimable first, then whatever opens soonest. A missed one sinks — it cannot be acted on. */
export function byUrgency(rows: readonly Claim[], today: string): Claim[] {
  const rank = (c: Claim) => {
    const s = claimState(c, today);
    return s === 'claimable' ? 0 : s === 'not_open' ? 1 : s === 'claimed' ? 2 : s === 'received' ? 3 : 4;
  };
  return [...rows].sort((a, b) =>
    rank(a) - rank(b) || (a.opensAt ?? '9999').localeCompare(b.opensAt ?? '9999'));
}

export interface FundingStats {
  claimable: number;
  soon: number;
  waiting: number;
  missed: number;
  /** Only what has actually been confirmed and received. Never a forecast. */
  receivedCents: number;
  /** True when at least one claimable row has no confirmed amount. */
  unconfirmed: boolean;
}

export function fundingStats(rows: readonly Claim[], today: string): FundingStats {
  const states = rows.map(c => ({ c, s: claimState(c, today) }));
  return {
    claimable: states.filter(x => x.s === 'claimable').length,
    soon: rows.filter(c => claimState(c, today) === 'not_open' && needsAttention(c, today)).length,
    waiting: states.filter(x => x.s === 'claimed').length,
    missed: states.filter(x => x.s === 'missed').length,
    receivedCents: states.filter(x => x.s === 'received')
      .reduce((t, x) => t + (x.c.amountCents ?? 0), 0),
    unconfirmed: states.some(x => x.s === 'claimable' && x.c.amountCents === null),
  };
}

/** The headline. Leads on money that can be claimed today, because that is the only urgent state. */
export function fundingLine(s: FundingStats): string {
  if (s.claimable > 0) {
    return `${s.claimable} ${s.claimable === 1 ? 'claim is' : 'claims are'} open now.${s.unconfirmed ? ' Confirm the amounts with your Apprenticeship Support Network provider — SPEC does not guess them.' : ''}`;
  }
  if (s.soon > 0) return `${s.soon} ${s.soon === 1 ? 'claim opens' : 'claims open'} within ${SOON_DAYS} days.`;
  if (s.missed > 0) return `${s.missed} ${s.missed === 1 ? 'window has' : 'windows have'} closed. Nothing to do about those — the next one is what matters.`;
  if (s.waiting > 0) return `${s.waiting} lodged, waiting on payment.`;
  return 'Nothing claimable right now.';
}

/** What an amount reads as. A confirmed figure, or plainly nothing — never a zero. */
export function amountLabel(cents: number | null): string {
  if (cents === null) return 'Amount not confirmed yet';
  return `$${(cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
}
