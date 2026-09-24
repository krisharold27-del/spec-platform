/**
 * Setting a business's people up — the list you work down once, before anybody is charged.
 *
 * ── What this screen is for ──────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September, the weekend before putting JBI in with his HR admin: every person on a row,
 * a tick for what they are, their licences and training and induction captured, and *"finalise
 * payment after everything is set"*.
 *
 * That last part is the reason this exists as its own thing. Billing reads a person's seat kind off
 * their ACCOUNT, and an account only exists once they are invited — so without somewhere to record
 * the intent first, a business would have to invite all thirty-eight people, and start paying for
 * them, before it could say which ones were leadership. The list is filled in free, then confirmed
 * once.
 *
 * ── Everybody gets a company email ───────────────────────────────────────────────────────────────
 *
 * Kris's rule at JBI, and SPEC's recommendation to every business: a person gets a company email
 * when they are onboarded. It is not an administrative preference — it is how they get their own
 * page, their SWMS, their payslip and their sign-in. A person set up without one has a record in
 * SPEC and no way into it, which is half a person.
 *
 * So the list asks for it, says why, and counts who is missing one. It does not REFUSE somebody
 * without one: a business part-way through a rollout has people who genuinely do not have one yet,
 * and a screen that blocks on it is a screen they stop filling in.
 */

import { SEAT_PRICES, type Currency } from './pricing';

/* ─────────────────────────────────────────────────────────────────────────────
 * What a person is
 * ───────────────────────────────────────────────────────────────────────────── */

export type SeatKind = 'leadership' | 'team';

export const SEAT_KINDS: { key: SeatKind; label: string; who: string }[] = [
  {
    key: 'team', label: 'Team member',
    who: 'Does the work. Their own page, their jobs, their SWMS, their timesheet.',
  },
  {
    key: 'leadership', label: 'Leadership',
    who: 'Runs people or numbers. Everything a team member has, plus a scorecard, a team board and the month.',
  },
];

export const isSeatKind = (v: string): v is SeatKind =>
  v === 'leadership' || v === 'team';

export const seatKindLabel = (v: string | null): string =>
  SEAT_KINDS.find(k => k.key === v)?.label ?? 'Team member';

/**
 * What this person's seat is, once everything is taken into account.
 *
 * The tick on this screen wins, then the chart. Deliberately in that order: the chart is SPEC's
 * guess from the role's title and whether anybody reports to them, and a guess must never overrule
 * somebody who has actually looked at the person and said.
 */
export function seatKindOf(
  person: { seatKind: string | null },
  fromChart: SeatKind,
): SeatKind {
  return isSeatKind(person.seatKind ?? '') ? (person.seatKind as SeatKind) : fromChart;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What each person needs before they can be booked
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Person {
  id: string;
  name: string;
  email: string | null;
  roleTitle: string | null;
  seatKind: string | null;
  isSubcontractor: boolean;
  inductedAt: string | null;
  /** Their licences and tickets, with expiries. */
  licences: { what: string; expiresAt: string | null }[];
  /** Training modules finished, out of what their role's path asks for. */
  trainingDone: number;
  trainingNeeded: number;
  /** Set once they have an account — which is when the seat starts being charged. */
  invited: boolean;
}

export type Gap = 'email' | 'personal_email' | 'role' | 'licence' | 'induction' | 'training';

export const GAP_LABEL: Record<Gap, string> = {
  email: 'No company email',
  personal_email: 'Personal email, not a company one',
  role: 'No role on the chart',
  licence: 'No licence or ticket recorded',
  induction: 'Not inducted',
  training: 'Training not finished',
};

/**
 * The addresses people already have, which are not the business's.
 *
 * ── Why this is worth catching ───────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"email is the login for the job system — so no personal emails
 * recommended"*. That is the whole argument. The address is not a contact detail here, it is the
 * key: it signs them in, it receives the sign-in link, and it is what an account is recovered
 * through. On a personal account the business does not hold the key — so when somebody leaves, the
 * account, and anything sent to it, leaves with them.
 *
 * A RECOMMENDATION, never a refusal. A business part-way through a rollout has people on a personal
 * address today, and a screen that blocks on it is a screen they stop filling in. It says which
 * ones and why, once, and lets the work carry on.
 *
 * The list is the handful anybody would recognise. It is deliberately not exhaustive — a check that
 * tried to know every personal domain in the world would wrongly accuse somebody's real company of
 * being a webmail provider, which is worse than missing one.
 */
export const PERSONAL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com',
  'live.com.au', 'yahoo.com', 'yahoo.com.au', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'msn.com', 'proton.me', 'protonmail.com', 'bigpond.com', 'bigpond.net.au',
  'optusnet.com.au', 'iinet.net.au', 'tpg.com.au', 'internode.on.net',
] as const;

export function isPersonalEmail(email: string | null | undefined): boolean {
  const at = String(email ?? '').trim().toLowerCase().split('@')[1];
  return Boolean(at) && PERSONAL_DOMAINS.includes(at as (typeof PERSONAL_DOMAINS)[number]);
}

/** Why a company address matters, in the words to say it to somebody who asks. */
export const WHY_COMPANY_EMAIL =
  'The email is the login. It signs them in, it is where the sign-in link goes, and it is how the account is recovered — so on a personal address the business does not hold the key, and when somebody leaves the account goes with them.';

/**
 * What is still missing for this person.
 *
 * Reported as a list rather than a score, because each one is fixed by a different person doing a
 * different thing — and "72% complete" tells an HR admin nothing about what to do next.
 *
 * Training is included but is NOT a gap that stops work: it is a path somebody works through over
 * weeks. `stopsWork` is the narrower question.
 */
export function gapsFor(p: Person): Gap[] {
  const out: Gap[] = [];
  if (!p.email?.trim()) out.push('email');
  else if (isPersonalEmail(p.email)) out.push('personal_email');
  if (!p.roleTitle) out.push('role');
  if (!p.licences.length) out.push('licence');
  if (!p.inductedAt) out.push('induction');
  if (p.trainingNeeded > 0 && p.trainingDone < p.trainingNeeded) out.push('training');
  return out;
}

/**
 * The gaps that mean this person cannot be sent to a job.
 *
 * Induction and a licence — the two a regulator, an insurer or a builder asks about. An email and a
 * training path matter, and neither of them stops somebody working today, so neither is reported as
 * though it does. A screen that cries wolf about a missing email stops being read about the licence.
 */
export function stopsWork(p: Person): Gap[] {
  return gapsFor(p).filter(g => g === 'licence' || g === 'induction');
}

/** A licence that has run out is the same as not having one. */
export function lapsedLicences(p: Person, today: string): string[] {
  return p.licences.filter(l => l.expiresAt && l.expiresAt < today).map(l => l.what);
}

export const readyToWork = (p: Person, today: string): boolean =>
  stopsWork(p).length === 0 && lapsedLicences(p, today).length === 0;

/* ─────────────────────────────────────────────────────────────────────────────
 * What it will cost, before anybody is charged
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Bill {
  leadership: number;
  team: number;
  /** Everybody on the list. */
  people: number;
  /** What is actually charged — the first seat is free. */
  charged: number;
  monthlyCents: number;
  symbol: string;
}

/**
 * The monthly bill for this list, as it stands.
 *
 * ── The first seat is free, in the total and not just the wording ────────────────────────────────
 *
 * Kris, 16 September: *"yes do the first seat free"*. It comes off the DEAREST seat, because that
 * is what a business would choose if it were asked, and a free seat that quietly comes off the
 * cheapest one is a discount somebody has to check to believe.
 *
 * Nothing here charges anybody. It is what the bill WILL be when the list is confirmed — which is
 * the number an HR admin needs while they are still deciding who is what.
 */
export function billFor(
  people: readonly { seatKind: SeatKind }[],
  currency: Currency = 'aud',
): Bill {
  const p = SEAT_PRICES[currency];
  const leadership = people.filter(x => x.seatKind === 'leadership').length;
  const team = people.length - leadership;

  // The free one comes off the dearest seat there is.
  const freeLeadership = leadership > 0 ? 1 : 0;
  const freeTeam = freeLeadership ? 0 : Math.min(1, team);

  return {
    leadership,
    team,
    people: people.length,
    charged: Math.max(0, people.length - 1),
    monthlyCents: ((leadership - freeLeadership) * p.leadership + (team - freeTeam) * p.team) * 100,
    symbol: p.symbol,
  };
}

export function money(cents: number, symbol = 'A$'): string {
  return `${symbol}${Math.round(cents / 100).toLocaleString('en-AU')}`;
}

/** The bill in a sentence, with the free seat said out loud so nobody has to work it out. */
export function billLine(b: Bill): string {
  if (b.people === 0) return 'Nobody on the list yet.';
  if (b.people === 1) return '1 person, and the first seat is free. Nothing to pay.';
  const bits: string[] = [];
  if (b.leadership) bits.push(`${b.leadership} leadership`);
  if (b.team) bits.push(`${b.team} team`);
  return `${b.people} people — ${bits.join(', ')}. ${money(b.monthlyCents, b.symbol)} a month, first seat free.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Finishing
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Readiness {
  people: number;
  ready: number;
  missingEmail: number;
  /** On an address the business does not control — a recommendation, never a block. */
  personalEmail: number;
  cannotBeBooked: number;
  /** True when the list is worth confirming — somebody on it, and everybody has a role. */
  canFinalise: boolean;
}

export function readiness(people: readonly Person[], today: string): Readiness {
  return {
    people: people.length,
    ready: people.filter(p => readyToWork(p, today)).length,
    missingEmail: people.filter(p => !p.email?.trim()).length,
    personalEmail: people.filter(p => isPersonalEmail(p.email)).length,
    cannotBeBooked: people.filter(p => !readyToWork(p, today)).length,
    /*
      Deliberately NOT "everything is filled in". Licences, inductions and training arrive over
      weeks, and a business that cannot turn SPEC on until every certificate is scanned is a
      business that never turns it on. What has to be true is that there are people and they have
      roles — everything else is work SPEC then helps them chase.
    */
    canFinalise: people.length > 0 && people.every(p => Boolean(p.roleTitle)),
  };
}

/** What the finalise button says, and why it is not available when it is not. */
export function finaliseLine(r: Readiness, b: Bill): string {
  if (r.people === 0) return 'Add your people first.';
  if (!r.canFinalise) {
    const n = r.people - (r.people - 1);
    return `${n === 1 ? 'Somebody has' : 'Some people have'} no role on the chart yet. Give everybody a role and the bill can be confirmed.`;
  }
  if (b.monthlyCents === 0) return 'Nothing to pay — the first seat is free. Confirm the list and everybody gets their invitation.';
  return `Confirm the list and everybody gets their invitation. ${money(b.monthlyCents, b.symbol)} a month from then, first seat free.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The half the person does themselves, on their phone
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Why each person finishes their own record.
 *
 * Kris, 24 September, on how the list gets filled in: *"on their phone"*.
 *
 * The arithmetic is the argument. Thirty-eight people with a licence, a ticket, an induction and a
 * start date is well over a hundred fields, and an HR admin typing them from a pile of photocopies
 * is a day's work that produces a register nobody trusts — because the certificate is in a drawer
 * and the row is somebody's transcription of it.
 *
 * So the office puts in what only the office knows — who they are, their role, what kind of seat,
 * whether they are a subcontractor — and the person puts in what only they have: their licence
 * numbers, their expiry dates, their tickets. It is the same shape as a subcontractor onboarding
 * themselves, and for the same reason.
 *
 * The link is a credential, exactly as the customer page's is: long, random, one per person, and
 * never printed anywhere else.
 */
export const SETUP_TOKEN_LENGTH = 32;

export const isSetupToken = (v: string): boolean => /^[0-9a-f]{32}$/.test(String(v ?? ''));

/** What the person is asked for, in the order it is easiest to answer. */
export const PHONE_STEPS: { key: string; label: string; why: string }[] = [
  { key: 'you', label: 'Check your details', why: 'Your name, your phone, and the email you will sign in with.' },
  { key: 'licences', label: 'Your licences and tickets', why: 'The ones that have to be current for you to be on site — with the date each runs out.' },
  { key: 'induction', label: 'Your induction', why: 'The business’s own induction, and the SWMS for the work you do.' },
];

/** How far through their own setup somebody is. */
export function phoneProgress(p: Person): { done: number; of: number; next: string | null } {
  const done = [
    Boolean(p.email?.trim()),
    p.licences.length > 0,
    Boolean(p.inductedAt),
  ];
  const at = done.indexOf(false);
  return {
    done: done.filter(Boolean).length,
    of: done.length,
    next: at === -1 ? null : PHONE_STEPS[at].label,
  };
}

/**
 * What to send them.
 *
 * Short, because it arrives as a text on a phone and a long one does not get read. It says what it
 * is, roughly how long, and nothing else — no login, no password, no app to install.
 */
export function inviteText(business: string, who: string, link: string): string {
  const first = who.trim().split(/\s+/)[0] || 'there';
  return `Hi ${first}, ${business.trim()} is setting you up on SPEC. Two minutes on your phone to add your licences and tickets: ${link.trim()}`;
}
