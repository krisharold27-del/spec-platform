/**
 * Running SPEC Business Solutions — the targets, the two engines, and the road to them.
 *
 * Not the client product. This is the page the founder opens to see whether the BUSINESS is working,
 * the same way a customer opens My Page to see whether theirs is.
 *
 * ── The rule this file exists to hold ────────────────────────────────────────────────────────────
 *
 * **A number is measured, or it is a target, or it is absent. It is never invented.**
 *
 * The design carried a system-health panel reading 99.98% uptime, 180ms response, 0.02% errors.
 * Those are plausible and none of them are measured by SPEC — they would have been four decorative
 * numbers on the one screen whose entire job is to tell the truth about the business. This project
 * has just spent a week discovering what invented confidence costs: a status page that said
 * "invitations can be sent" about a deleted key, a deploy that reported success while changing
 * nothing, and an owner who concluded his product was broken when it was not.
 *
 * So every figure here is one of three kinds, and the type says which:
 *
 *   `measured`  — read from the database at request time. Cannot drift from the truth.
 *   `target`    — a goal, stated as a goal, never shown as an achievement.
 *   `unmeasured`— known to matter, not instrumented here, and SAID so, with where to look instead.
 *
 * The third is the one that took discipline to keep.
 */

export type FigureKind = 'measured' | 'target' | 'unmeasured';

export interface Figure {
  label: string;
  /** The number, or null when nothing is measured. Never a guess. */
  value: string | null;
  kind: FigureKind;
  note: string;
}

/* ── The two engines ─────────────────────────────────────────────────────────────────────────────
   Consulting earns now and proves the method; software is the thing that scales. Both are tracked
   because a business running on one engine while believing it has two is the exact failure SPEC
   tells its customers about. */

export const CONSULTING_TARGET = { clients: '4–5', perClientMonthly: 25_000, revenue: '$1.2–1.5m/yr' };
export const SOFTWARE_TARGET = { seats: 20_000, arr: '$10m', retention: 0.9 };

export interface EngineInput {
  /** Businesses on SPEC, excluding unclaimed look-arounds — a tyre-kick is not a customer. */
  tenants: number;
  /** Seats that actually bill: invited or accepted. A name pencilled on a chart costs nothing. */
  seats: number;
  /** Consulting clients. Not in the database — SPEC does not invoice through itself yet. */
  consultingClients: number;
}

export const seatProgress = (seats: number): number =>
  Math.min(100, (seats / SOFTWARE_TARGET.seats) * 100);

/**
 * How far along, as a percentage, never rounded up to flatter.
 *
 * 40 of 20,000 seats is 0.2%, and it is shown as 0.2% rather than nudged to something that looks
 * like progress. A cockpit that flatters the pilot is worse than no cockpit.
 */
export function pctLabel(n: number, of: number): string {
  if (of <= 0) return '—';
  const pct = (n / of) * 100;
  if (pct === 0) return '0%';
  return pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** Whole dollars, grouped — the same shape the pricing calculator uses. */
export const money = (n: number): string => `$${Math.round(n).toLocaleString('en-AU')}`;

/**
 * Where the build is up to on carrying twenty thousand seats.
 *
 * Every line is a fact about this repository that somebody can go and check, and the two that are
 * NOT done say so. A readiness list where everything is green is a readiness list nobody wrote
 * honestly.
 */
export interface ScaleCheck { label: string; done: boolean; evidence: string }

export const SCALE_CHECKS: ScaleCheck[] = [
  {
    label: 'Every business’s data separated',
    done: true,
    evidence: 'Enforced in application code, proven by tests/tenant-isolation.test.ts, and again by row-level security on 24 of 24 tables.',
  },
  {
    label: 'The database keeps up with the build',
    done: true,
    evidence: 'Applied by the deploy itself, additively, and CI plants a forgotten table to prove it cannot freeze again.',
  },
  {
    label: 'Nothing reaches production unchecked',
    done: true,
    evidence: 'npm run check — 647 tests, the security policies, and four customer journeys driven in a real browser.',
  },
  {
    label: 'Anybody can see whether it is working',
    done: true,
    evidence: '/status, no sign-in, in plain words — and it tests things rather than assuming them.',
  },
  {
    label: 'Load-tested to twenty thousand seats',
    done: false,
    evidence: 'Never run. The largest thing SPEC has served is one business. This is the honest gap.',
  },
  {
    label: 'A backup restored, at least once',
    done: false,
    evidence: 'A backup nobody has restored is a belief, not a backup.',
  },
];

/* ── The road ───────────────────────────────────────────────────────────────────────────────────── */

export interface Phase { tag: string; title: string; body: string; tone: 'early' | 'building' | 'compounding' }

export const PHASES: Phase[] = [
  {
    tag: 'Phase 1',
    title: 'Seed',
    tone: 'early',
    body: 'All paid. LinkedIn hunts owners and GMs of $8–30m businesses; Google Ads catches the ones already searching. Expensive per customer, and meant to be — this is buying first believers, not volume.',
  },
  {
    tag: 'Phase 2',
    title: 'Prove and delight',
    tone: 'building',
    body: 'The first customers get a genuinely great experience — the product working, reliably, every day. They become the sales force. Nothing in phase three works if this one is rushed.',
  },
  {
    tag: 'Phase 3',
    title: 'Referral flywheel',
    tone: 'compounding',
    body: 'Accountant referrals and client word-of-mouth switch on once a happy base exists. Cheap, and it compounds. The divisional customers arrive through warm introductions rather than advertising.',
  },
];

/**
 * Things worth buying once the business can afford them — kept on the page so they are decisions
 * with a trigger rather than things remembered at the wrong moment.
 *
 * `spec.com` is the one that matters. The name is the product, and specbizhq.com is a workaround
 * for not owning it yet: every customer who mistypes it lands somewhere that is not SPEC, and every
 * referral has to carry three extra words. A premium single-word domain is a five-to-six-figure
 * purchase, which is exactly why it belongs against a trigger — bought too early it is money the
 * business needed for customers, and bought too late it is paid for out of confusion that already
 * cost more.
 */
export interface Milestone { what: string; when: string; why: string }

export const MILESTONES: Milestone[] = [
  {
    what: 'Buy spec.com',
    when: 'Once the referral flywheel is turning — phase three, or the first year the software engine covers its own costs.',
    why: 'The name is the product. Until then every referral carries three extra words and every mistype lands somewhere that is not SPEC. A premium one-word domain is a serious purchase, so it waits for a business that can absorb it without taking money away from finding customers.',
  },
];

export interface Channel { label: string; seats: number }

/**
 * Illustrative, and labelled as such wherever it is drawn.
 *
 * These add to roughly 19,000 of the 20,000 — a shape for thinking with, not a forecast and not a
 * commitment. Three of the five are referral-based, which is the actual point of the chart: the
 * volume does not come from advertising, so the money spent early buys the customers who later
 * bring the rest.
 */
export const CHANNELS: Channel[] = [
  { label: 'Accountant referrals', seats: 6000 },
  { label: 'LinkedIn', seats: 4000 },
  { label: 'Divisional customers (~20 of them)', seats: 4000 },
  { label: 'Client word-of-mouth', seats: 3000 },
  { label: 'Google Ads', seats: 2000 },
];

export const CHANNEL_TOTAL = CHANNELS.reduce((t, c) => t + c.seats, 0);

/**
 * System health, told honestly.
 *
 * Two of these SPEC genuinely knows, because it can count its own rows. The rest — uptime, response
 * time, error rate — are real and important and measured by Vercel, not by this. Rather than
 * printing a plausible number, each says what it is and where the true one lives. The day SPEC
 * collects them for real, they become `measured` and this comment can go.
 */
export function health(input: EngineInput): Figure[] {
  return [
    {
      label: 'Businesses on SPEC',
      value: String(input.tenants),
      kind: 'measured',
      note: 'Counted just now, excluding unclaimed look-arounds.',
    },
    {
      label: 'Seats that bill',
      value: String(input.seats),
      kind: 'measured',
      note: 'Invited or taken. A name pencilled onto a chart is free and is not counted.',
    },
    {
      label: 'Uptime and response time',
      value: null,
      kind: 'unmeasured',
      note: 'Not collected by SPEC. Vercel measures both — its dashboard is the honest source, and inventing a figure here would make this whole panel worthless.',
    },
    {
      label: 'Error rate',
      value: null,
      kind: 'unmeasured',
      note: 'Same: Vercel records runtime errors per deployment. Worth wiring in here once there is more than one business to average across.',
    },
  ];
}
