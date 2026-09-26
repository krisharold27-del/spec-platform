/**
 * The Angus Card: a company card on a phone, where every spend picks a job.
 *
 * ── Kris, 25 September, marked a development item ────────────────────────────────────────────────
 *
 * *"company expense card, PHONE ONLY (Apple/Google wallet). Issued to owner and managers,
 * supervisors, every tech who buys materials or fuel, and office staff (not apprentices). Limits set
 * PER ROLE. EVERY spend must pick a job (or Office/overhead). Receipt photographed at point of
 * spend; if none within 24 h the person's LEADER is reminded (card is not paused). Merchant-category
 * blocks: alcohol, gambling, cash withdrawals. Spend posts to the job cost, the books and the BAS
 * automatically. Needs a card-issuing partner."*
 *
 * ── What is real here and what is not ────────────────────────────────────────────────────────────
 *
 * Said plainly because the alternative is the failure `tests/no-false-feed.test.ts` exists to
 * prevent. **SPEC cannot issue a card.** That takes a card-issuing partner, a regulated one, and
 * there is no agreement and no integration. Nothing in this file talks to anything.
 *
 * What it does hold is the POLICY — who gets one, what their limit is, what is blocked, and what
 * happens when a receipt does not appear. That is worth building before the partner exists, because
 * it is the part the business argues about, and because a card programme launched without it is a
 * business handing out cards and finding out in March what everybody spent.
 *
 * `CARD_NOT_ISSUED` is what the screen says, and a test fails the build if this module ever claims
 * a card was issued, activated or loaded.
 *
 * ── The two decisions worth defending ────────────────────────────────────────────────────────────
 *
 * **A missing receipt reminds the LEADER, and does not pause the card.** The obvious design pauses
 * it. It is wrong: the person whose card stops is on a site, and what they do is buy the part on
 * their own card and claim it back — which is the exact thing the card existed to stop, with an
 * unhappy tradesman attached. Telling their leader costs nothing and works, because the leader is
 * the person who can actually ask.
 *
 * **Apprentices do not get one.** Not about trust. An apprentice buying materials unsupervised is a
 * job going wrong in a different way, and the card is not the place to fix that.
 */

/** Nothing here issues anything. Shown on the screen, asserted by the test. */
export const CARD_NOT_ISSUED =
  'SPEC cannot issue you a card. That needs a card-issuing partner and there is not one yet — what is set up here is the policy: who gets a card, what their limit is, what is blocked, and what happens when a receipt does not turn up. When a partner is in place, this is what it runs on.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Who gets one, and for how much
 * ───────────────────────────────────────────────────────────────────────────── */

export type CardRole = 'owner_manager' | 'supervisor' | 'technician' | 'office';

export interface RolePolicy {
  key: CardRole;
  label: string;
  /** Why this role has one. The justification, not the entitlement. */
  because: string;
}

export const CARD_ROLES: RolePolicy[] = [
  { key: 'owner_manager', label: 'Owner and managers', because: 'They commit the business already.' },
  { key: 'supervisor', label: 'Supervisors', because: 'They are the ones told when a job needs something today.' },
  { key: 'technician', label: 'Technicians', because: 'Every tech who buys materials or fuel — which is most of them.' },
  { key: 'office', label: 'Office', because: 'Subscriptions, stationery, the things that stop the office working.' },
];

/**
 * Apprentices are not on the list, and it is said rather than left as an absence.
 *
 * An absence reads as an oversight and somebody adds them. This reads as a decision.
 */
export const NOT_APPRENTICES =
  'Apprentices do not get one. Not about trust — an apprentice buying materials on their own is a job going wrong in a different way, and a card is not where that gets fixed.';

export interface Limit {
  role: CardRole;
  /** Monthly, in cents. Null means the business has not set one — and nothing is issued without it. */
  monthlyCents: number | null;
}

export const limitFor = (limits: readonly Limit[], role: CardRole): number | null =>
  limits.find(l => l.role === role)?.monthlyCents ?? null;

/** Every role needs a limit before any card goes out. A card with no limit is a signed blank cheque. */
export function limitsReady(limits: readonly Limit[]): { ready: boolean; missing: RolePolicy[]; says: string } {
  const missing = CARD_ROLES.filter(r => limitFor(limits, r.key) === null);
  if (missing.length === 0) return { ready: true, missing, says: 'Every role has a monthly limit.' };
  return {
    ready: false, missing,
    says: `${missing.length} ${missing.length === 1 ? 'role has' : 'roles have'} no limit: ${missing.map(m => m.label).join(', ')}. Nothing goes out without one — a card with no limit is a signed blank cheque.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What cannot be bought with it
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Merchant categories the card refuses.
 *
 * Three, and only three. A long block list is a list that stops somebody buying a part at a
 * hardware shop that miscoded itself, on a Saturday, with a customer waiting — and the next thing
 * that happens is the card gets left in a drawer. These three are the ones where a false block
 * costs nothing and a false allow costs a great deal.
 */
export const BLOCKED = [
  { key: 'alcohol', label: 'Alcohol', because: 'Not a business expense, and it is the one that ends up in a newspaper.' },
  { key: 'gambling', label: 'Gambling', because: 'Nothing good is on the other side of this one.' },
  { key: 'cash', label: 'Cash withdrawals', because: 'Cash off a company card is spend with no receipt and no category, by definition.' },
] as const;

export type BlockedKey = (typeof BLOCKED)[number]['key'];

export const isBlocked = (category: string): boolean =>
  BLOCKED.some(b => b.key === category);

/* ─────────────────────────────────────────────────────────────────────────────
 * One spend
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Spend {
  id: string;
  who: string;
  /** Who they report to — the person reminded when a receipt does not appear. */
  leader: string | null;
  merchant: string;
  cents: number;
  at: string;
  /** The job it belongs to, or null for office and overhead. */
  jobRef: string | null;
  /** True when it was deliberately put to overhead rather than simply not coded. */
  toOverhead: boolean;
  receiptAt: string | null;
  blockedAs: BlockedKey | null;
}

/** How long somebody has to photograph a receipt before their leader hears about it. */
export const RECEIPT_WITHIN_HOURS = 24;

export type SpendState = 'blocked' | 'uncoded' | 'no_receipt' | 'late_receipt' | 'good';

export interface SpendWatch {
  spend: Spend;
  state: SpendState;
  says: string;
  /** Who to remind, when somebody should be. Never the person themselves. */
  remind: string | null;
}

const hoursSince = (at: string, now: Date): number | null => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? (now.getTime() - t) / 3_600_000 : null;
};

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function spendWatch(spend: Spend, now: Date = new Date()): SpendWatch {
  if (spend.blockedAs) {
    const blocked = BLOCKED.find(b => b.key === spend.blockedAs);
    return {
      spend, state: 'blocked', remind: null,
      says: `Blocked at the till: ${blocked?.label.toLowerCase() ?? spend.blockedAs}.`,
    };
  }

  /*
    Uncoded is worse than a missing receipt and it is listed first for that reason. A spend with no
    job and no deliberate overhead is a cost that lands nowhere — it does not reach the job's margin
    and it does not reach overhead either, so the business's numbers are quietly wrong rather than
    visibly incomplete.
  */
  if (!spend.jobRef && !spend.toOverhead) {
    return {
      spend, state: 'uncoded', remind: spend.leader,
      says: `${money(spend.cents)} at ${spend.merchant} with no job against it. Until it has one it does not reach any job's cost and it does not reach overhead either.`,
    };
  }

  const where = spend.jobRef ?? 'Office';
  if (spend.receiptAt) {
    /* How long the receipt actually took, measured to when it arrived rather than to now. */
    const took = hoursSince(spend.at, new Date(spend.receiptAt));
    if (took !== null && took > RECEIPT_WITHIN_HOURS) {
      return {
        spend, state: 'late_receipt', remind: null,
        says: `${money(spend.cents)} at ${spend.merchant} · ${where}. Receipt came in ${Math.round(took)} hours later.`,
      };
    }
    return {
      spend, state: 'good', remind: null,
      says: `${money(spend.cents)} at ${spend.merchant} · ${where}. Receipt in.`,
    };
  }

  const hours = hoursSince(spend.at, now);
  if (hours !== null && hours > RECEIPT_WITHIN_HOURS) {
    return {
      spend, state: 'no_receipt', remind: spend.leader,
      says: `${money(spend.cents)} at ${spend.merchant} · ${where}. No receipt after ${Math.round(hours)} hours.`,
    };
  }
  return {
    spend, state: 'good', remind: null,
    says: `${money(spend.cents)} at ${spend.merchant} · ${where}. Receipt not in yet.`,
  };
}

/**
 * What the LEADER is told. Never the cardholder, and never a pause.
 *
 * The card staying live is the point. A paused card means somebody on a site buying the part on
 * their own money and claiming it back — the exact thing the card existed to stop, with an unhappy
 * tradesman attached. A leader who can walk over and ask costs nothing and works.
 */
export function remindLeader(watch: SpendWatch): string | null {
  if (!watch.remind) return null;
  if (watch.state === 'uncoded') {
    return `${watch.spend.who} has a ${money(watch.spend.cents)} spend with no job on it. Their card still works — it just needs a job before it can be costed.`;
  }
  if (watch.state === 'no_receipt') {
    return `${watch.spend.who} has no receipt for ${money(watch.spend.cents)} at ${watch.spend.merchant}. Their card still works; a photo is all that is missing.`;
  }
  return null;
}

export const CARD_IS_NOT_PAUSED =
  'A missing receipt reminds the person’s leader and never pauses the card. A card that stops working on site means somebody buying the part on their own money and claiming it back, which is the thing the card was meant to stop.';

export interface CardReading {
  spends: SpendWatch[];
  needing: SpendWatch[];
  uncoded: number;
  noReceipt: number;
  blocked: number;
  says: string;
}

export function readSpends(spends: readonly Spend[], now: Date = new Date()): CardReading {
  const watches = spends.map(s => spendWatch(s, now));
  const uncoded = watches.filter(w => w.state === 'uncoded').length;
  const noReceipt = watches.filter(w => w.state === 'no_receipt').length;
  const blocked = watches.filter(w => w.state === 'blocked').length;
  const needing = watches.filter(w => w.remind !== null);

  const bits: string[] = [];
  if (uncoded > 0) bits.push(`${uncoded} with no job against ${uncoded === 1 ? 'it' : 'them'}`);
  if (noReceipt > 0) bits.push(`${noReceipt} with no receipt`);
  if (blocked > 0) bits.push(`${blocked} blocked at the till`);

  return {
    spends: watches,
    needing,
    uncoded,
    noReceipt,
    blocked,
    says: spends.length === 0
      ? 'No spend on cards yet.'
      : bits.length === 0
        ? `${spends.length} ${spends.length === 1 ? 'spend' : 'spends'}, all costed with receipts.`
        : `${spends.length} ${spends.length === 1 ? 'spend' : 'spends'} · ${bits.join(' · ')}.`,
  };
}

export const EVERY_SPEND_PICKS_A_JOB =
  'Every spend picks a job, or Office. Not afterwards from a statement — at the till, while the person still knows what it was for, which is the only moment anybody does.';
