/**
 * Progress claims, retentions and defects — the money a project is owed and has not been paid yet.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"every progress claim to a CLIENT (builder, head contractor, strata, government, business owner,
 * anyone) built to the state Security of Payment rules (required wording, dated, served), with the
 * client's payment-schedule deadline tracked; if missed, SPEC alerts AND drafts the next step."*
 *
 * And the wording rule, which is its own instruction: *"the people who pay us are CLIENTS, never
 * 'builders' as a general term. A builder is one kind of client."* `tests/claims.test.ts` fails the
 * build if the word appears as a general term anywhere in this file.
 *
 * ── Why the wording rule is not fussiness ────────────────────────────────────────────────────────
 *
 * Half of JBI's work is industrial, mining and renewables, where the client is a plant manager, a
 * mine operator or an EPC contractor and there is no builder anywhere in the job. A product that
 * calls every payer a builder is telling those customers it was written for somebody else — and it
 * is the kind of detail an owner notices in the first ten minutes and never stops noticing.
 *
 * ── The part SPEC must not invent ────────────────────────────────────────────────────────────────
 *
 * Security of Payment is eight different Acts. The required wording differs, the time a client has
 * to respond with a payment schedule differs, what happens when they miss it differs, and all of it
 * changes. `lib/certificates` set the rule and it applies here with money attached:
 *
 *   **A deadline SPEC invented is worse than no deadline**, because a business that lets a real
 *   statutory window lapse while watching a made-up one has been actively harmed by the thing it
 *   trusted.
 *
 * So there is not a single day count in this file, and a test fails the build if one appears. The
 * windows are the business's own, set once from their own legislation or their own lawyer, and
 * until they are set SPEC tracks the claim, says it is outstanding, and refuses to say it is late.
 */

/** The eight, the same list `lib/certificates` holds, because it is the same eight. */
export type Territory = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'NT' | 'ACT';

/**
 * What the business sets, once, from its own legislation.
 *
 * Every field is nullable and null is a real state meaning "nobody has told SPEC". The alternative —
 * a plausible default — is the failure this whole file is written around.
 */
export interface SopaSetup {
  territory: Territory | null;
  /** What the Act is called where they are. Their words, confirmed. */
  actName: string | null;
  /** Days the client has to respond with a payment schedule. From their Act, never from SPEC. */
  scheduleWithinDays: number | null;
  /** Days to pay once a claim is served or scheduled. From their Act. */
  payWithinDays: number | null;
  /** The wording their Act requires on the face of a claim. Pasted in, never generated. */
  requiredWording: string | null;
}

export const NO_SOPA: SopaSetup = {
  territory: null, actName: null, scheduleWithinDays: null, payWithinDays: null, requiredWording: null,
};

export const isSetUp = (s: SopaSetup): boolean =>
  Boolean(s.actName?.trim()) && s.scheduleWithinDays !== null && s.payWithinDays !== null;

export const WHY_YOURS =
  'Security of Payment is a different Act in every state — different wording on the claim, different time for the client to respond, different consequences when they do not, and it all changes. SPEC will not guess at any of it. Set it once from your own Act, and every claim is built and tracked against that.';

export const NOT_SET_YET =
  'Nobody has told SPEC which Act you work under, so it will track these claims and it will not tell you whether any of them is late. Set it once and it will.';

/* ─────────────────────────────────────────────────────────────────────────────
 * A claim
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Claim {
  id: string;
  jobId: string;
  jobRef: string;
  /** Who is being claimed from. A client. */
  client: string;
  /** Claim 1, 2, 3 — clients and adjudicators both reference these by number. */
  number: number;
  amountCents: number;
  /** Retention held out of this claim, which is genuinely the business's money, later. */
  retentionCents: number;
  /** When it was SERVED, which is the date the statutory clock runs from. Null while it is a draft. */
  servedAt: string | null;
  /** When the client responded with a payment schedule, if they did. */
  scheduledAt: string | null;
  /** What they said they would pay, which is very often not what was claimed. */
  scheduledCents: number | null;
  paidAt: string | null;
}

export type ClaimState =
  | 'draft'            // not served, so no clock is running
  | 'awaiting_schedule' // served, inside the window for a response
  | 'schedule_missed'   // served, the window passed, no response
  | 'scheduled_short'   // they responded and are paying less than claimed
  | 'scheduled'         // they responded and agreed
  | 'overdue'           // agreed and not paid by the date
  | 'paid';

export interface ClaimWatch {
  claim: Claim;
  state: ClaimState;
  /** Days since it was served. Null when it has not been. */
  daysSince: number | null;
  says: string;
  /** What to do about it, when there is something. Drafted, never sent on its own. */
  nextStep: string | null;
}

const days = (from: string | null, at: Date): number | null => {
  if (!from) return null;
  const t = Date.parse(from);
  return Number.isFinite(t) ? Math.floor((at.getTime() - t) / 86_400_000) : null;
};

const money = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-AU')}`;

export function claimWatch(claim: Claim, setup: SopaSetup, at: Date = new Date()): ClaimWatch {
  const daysSince = days(claim.servedAt, at);

  if (claim.paidAt) {
    return { claim, state: 'paid', daysSince, says: `Paid ${claim.paidAt.slice(0, 10)}.`, nextStep: null };
  }
  if (!claim.servedAt) {
    return {
      claim, state: 'draft', daysSince: null,
      says: `Claim ${claim.number} for ${money(claim.amountCents)} is drafted and not served. Nothing is running until it is.`,
      nextStep: 'Serve it. The clock only starts when the client has it.',
    };
  }

  if (claim.scheduledAt) {
    const short = claim.scheduledCents !== null && claim.scheduledCents < claim.amountCents;
    const dueDays = setup.payWithinDays;
    const sinceSchedule = days(claim.scheduledAt, at);
    const overdue = dueDays !== null && sinceSchedule !== null && sinceSchedule > dueDays;

    if (overdue) {
      return {
        claim, state: 'overdue', daysSince,
        says: `${money(claim.scheduledCents ?? claim.amountCents)} was scheduled and is ${sinceSchedule} days on, past the ${dueDays} you set.`,
        nextStep: 'This is unpaid scheduled money, which is the strongest position you can be in. A letter of demand is drafted and ready to send.',
      };
    }
    if (short) {
      return {
        claim, state: 'scheduled_short', daysSince,
        says: `They scheduled ${money(claim.scheduledCents!)} against your ${money(claim.amountCents)} — ${money(claim.amountCents - claim.scheduledCents!)} short.`,
        nextStep: 'The difference is what an adjudication would be about, and there is a time limit on starting one. Worth a decision this week rather than next month.',
      };
    }
    return { claim, state: 'scheduled', daysSince, says: `Scheduled in full, ${money(claim.amountCents)}.`, nextStep: null };
  }

  /* Served, no response. The window is the business's own, and SPEC will not invent it. */
  if (setup.scheduleWithinDays === null || daysSince === null) {
    return {
      claim, state: 'awaiting_schedule', daysSince,
      says: `Claim ${claim.number} for ${money(claim.amountCents)} served, no payment schedule yet. ${NOT_SET_YET}`,
      nextStep: null,
    };
  }
  if (daysSince > setup.scheduleWithinDays) {
    return {
      claim, state: 'schedule_missed', daysSince,
      says: `${daysSince} days since it was served and no payment schedule, past the ${setup.scheduleWithinDays} you set.`,
      /*
        The most valuable sentence in this file. Under every one of these Acts, a client who misses
        the schedule window loses the right to argue about the amount — and it is the thing small
        businesses most often do not know, or know and miss because nobody was counting.
      */
      nextStep: `A client who does not respond in time generally loses the right to dispute the amount. The next step under your Act is drafted and ready — do not let this one sit.`,
    };
  }
  const left = setup.scheduleWithinDays - daysSince;
  return {
    claim, state: 'awaiting_schedule', daysSince,
    says: `Served ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago. They have ${left} left to respond.`,
    nextStep: null,
  };
}

/** Everything that needs somebody. Worst first, which is missed schedules before anything else. */
export function needsAttention(
  claims: readonly Claim[],
  setup: SopaSetup,
  at: Date = new Date(),
): ClaimWatch[] {
  const rank: Record<ClaimState, number> = {
    schedule_missed: 0, overdue: 1, scheduled_short: 2, draft: 3,
    awaiting_schedule: 4, scheduled: 5, paid: 6,
  };
  return claims
    .map(c => claimWatch(c, setup, at))
    .filter(w => w.nextStep !== null)
    .sort((a, b) => rank[a.state] - rank[b.state]);
}

export function claimsLine(watches: readonly ClaimWatch[], setup: SopaSetup): string {
  if (watches.length === 0) return 'No progress claims out.';
  if (!isSetUp(setup)) return `${watches.length} claims out. ${NOT_SET_YET}`;
  const missed = watches.filter(w => w.state === 'schedule_missed').length;
  const overdue = watches.filter(w => w.state === 'overdue').length;
  const out = watches.filter(w => w.state !== 'paid').length;
  const bits = [`${out} ${out === 1 ? 'claim' : 'claims'} out`];
  if (missed) bits.push(`${missed} with no payment schedule past the window`);
  if (overdue) bits.push(`${overdue} scheduled and unpaid`);
  return `${bits.join(' · ')}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Retention
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Retention {
  jobId: string;
  jobRef: string;
  client: string;
  heldCents: number;
  /** What has to happen before it comes back, in the contract's own words. */
  releaseTerms: string;
  /** When the defects period ends, from the contract. Null when nobody has said. */
  defectsEndAt: string | null;
  requestedAt: string | null;
  releasedAt: string | null;
}

export type RetentionState = 'held' | 'releasable' | 'requested' | 'released';

export function retentionState(r: Retention, at: Date = new Date()): RetentionState {
  if (r.releasedAt) return 'released';
  if (r.requestedAt) return 'requested';
  if (r.defectsEndAt && Date.parse(r.defectsEndAt) <= at.getTime()) return 'releasable';
  return 'held';
}

/**
 * Retention that is due back and nobody has asked for.
 *
 * The single most commonly forgotten money in the trade: five per cent of a job, held for a year,
 * against a job everybody stopped thinking about eleven months ago. Nothing clever about finding
 * it — the value is entirely that somebody is counting.
 */
export function goAndGetIt(retentions: readonly Retention[], at: Date = new Date()): Retention[] {
  return retentions
    .filter(r => retentionState(r, at) === 'releasable')
    .sort((a, b) => b.heldCents - a.heldCents);
}

export function retentionLine(retentions: readonly Retention[], at: Date = new Date()): string {
  const open = retentions.filter(r => !r.releasedAt);
  if (open.length === 0) return 'No retention held.';
  const total = open.reduce((a, r) => a + r.heldCents, 0);
  const due = goAndGetIt(retentions, at);
  const noDate = open.filter(r => !r.defectsEndAt).length;

  const bits = [`${money(total)} held across ${open.length} ${open.length === 1 ? 'job' : 'jobs'}`];
  if (due.length > 0) bits.push(`${money(due.reduce((a, r) => a + r.heldCents, 0))} is due back and nobody has asked`);
  if (noDate > 0) bits.push(`${noDate} with no release date recorded, so SPEC cannot tell you when`);
  return `${bits.join(' · ')}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Defects
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Defect {
  id: string;
  jobId: string;
  jobRef: string;
  what: string;
  raisedAt: string;
  /** Inside the defects period, so it is free — and tracked, which is the point. */
  freeToUs: boolean;
  /**
   * Whether it is closed, which is a different fact from WHEN.
   *
   * Two fields rather than one nullable date, learnt the hard way: reading "closed" off the date
   * means a defect closed before anybody recorded a date reads as still open, and an open defect is
   * what stops a retention being asked for. Knowing something happened and not knowing when is a
   * normal state and it has to be representable.
   */
  closed: boolean;
  closedAt: string | null;
  /** A product that failed, with the serial that makes a warranty claim possible. */
  productSerial: string | null;
}

export const openDefects = (list: readonly Defect[]): Defect[] =>
  list.filter(d => !d.closed);

/**
 * A defect inside the period is free work, and it still costs.
 *
 * Which is exactly the `lib/rework` rule: unpaid work is negative to the business whether or not
 * anybody agreed it was fair. Free to the CLIENT is not free — it is a van, two people and a day,
 * and a business that does not count it thinks its margins are better than they are.
 */
export const carriedBy = (list: readonly Defect[]): Defect[] =>
  list.filter(d => d.freeToUs);

export function defectsLine(list: readonly Defect[]): string {
  const open = openDefects(list);
  if (list.length === 0) return 'No defects raised.';
  if (open.length === 0) return `${list.length} ${list.length === 1 ? 'defect' : 'defects'}, all closed out.`;
  const free = carriedBy(open).length;
  return free > 0
    ? `${open.length} open. ${free} ${free === 1 ? 'is' : 'are'} inside the defects period, so ${free === 1 ? 'it is' : 'they are'} ours to carry.`
    : `${open.length} open.`;
}

/** When the defects period ends, close it and ask for the retention. One action, both halves. */
export function closingOut(r: Retention, defects: readonly Defect[], at: Date = new Date()): string | null {
  if (retentionState(r, at) !== 'releasable') return null;
  const open = openDefects(defects.filter(d => d.jobId === r.jobId));
  if (open.length > 0) {
    return `${r.jobRef}: the defects period has ended with ${open.length} still open. Close those before asking for the ${money(r.heldCents)} — asking now invites a reason to say no.`;
  }
  return `${r.jobRef}: defects period over, nothing outstanding, ${money(r.heldCents)} to come back from ${r.client}. The request is drafted.`;
}

/** Said wherever a claim, a retention or a payment schedule is shown. One word, used everywhere. */
export const CLIENT_NOT_BUILDER =
  'The people who pay you are clients. A builder is one kind of client, and so is a mine, a strata committee, a facilities manager and a business owner.';
