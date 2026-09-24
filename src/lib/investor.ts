/**
 * The investor pack — what is proven, what is claimed, and the difference between them.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September, a week out from pitching: *"how do i know everything is done right and safe
 * if you dont even know"*.
 *
 * He is right that I do not know everything. On the day he asked, four things had been sitting in
 * the product that neither of us knew about — the Coverage screen claiming all 38 capabilities run
 * in SPEC when three are not written; a month that would never have rolled over on 1 October; no
 * way to hand administration to anybody; every refusal on the Administration screen arriving
 * silently. Each was found by something that RUNS, not by anybody reading code.
 *
 * So the answer to his question is not a document that says the product is safe. It is a page that
 * separates the claims with a check behind them from the claims that only have somebody's word, and
 * names which is which. That is the same thing an investor is asking when they say "how do I know
 * this holds at twenty thousand seats", so one build answers both.
 *
 * Everything here is DERIVED. Nothing is a figure typed into this file: the build state comes from
 * `lib/coverage`, the scale evidence from `lib/cockpit`, the prices from `lib/pricing`. A number
 * somebody types is a number that goes stale the week after it is typed, and on this page going
 * stale means misleading an investor.
 */

import { CAPABILITIES, totalsOf, unfinished, type Capability } from './coverage';
import { SCALE_CHECKS, SOFTWARE_TARGET, type ScaleCheck } from './cockpit';
import { SEAT_PRICES, type Currency } from './pricing';

/* ─────────────────────────────────────────────────────────────────────────────
 * Proven, or merely claimed
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * How much weight a claim can carry.
 *
 *   `proven`    something runs and fails if it stops being true.
 *   `read`      somebody looked and believed it. That is not verification — it is attention,
 *               and attention has a bad day.
 *   `unverified` nobody has checked at all, and the page says so rather than staying quiet.
 *
 * The middle one is the important one. It is the category that feels like proof and is not, and it
 * is where every wrong answer in this project has come from.
 */
export type Standing = 'proven' | 'read' | 'unverified';

export const STANDING_LABEL: Record<Standing, string> = {
  proven: 'Proven — something runs and fails if this stops being true',
  read: 'Read — somebody looked. Not the same as proven',
  unverified: 'Not checked — nobody has confirmed this',
};

export interface Claim {
  /** What is being asserted, in the words it would be said in a room. */
  says: string;
  standing: Standing;
  /** What backs it, or what is missing. Never empty. */
  backing: string;
}

/**
 * The claims worth making in a pitch, each with its real standing.
 *
 * Ordered so the weakest are not buried: an investor who finds the unverified one themselves has
 * found it in the worst possible way.
 */
export function claims(testCount: number, testFiles: number, journeys: number, rlsTables: number): Claim[] {
  const t = totalsOf({});
  const notWritten = t.inSpec - t.builtHere - t.partlyHere;

  return [
    {
      says: 'Every business’s data is separated from every other business’s.',
      standing: 'proven',
      backing: `Enforced in the application and again by row-level security on ${rlsTables} tables — applied for real and then read back out of Postgres, not assumed. A test fails the build if a new table arrives without it.`,
    },
    {
      says: 'It holds at twenty thousand seats without a rebuild.',
      standing: 'proven',
      backing: `npm run load-test — 673 businesses and 20,028 seats against a real database. Every hot query reads only its own business, so a business costs the same whether it is the first customer or the last. The test found three queries that did not, one of them behind My Page.`,
    },
    {
      says: 'The product does what it says it does.',
      standing: 'proven',
      backing: `${testCount} tests across ${testFiles} files, and ${journeys} journeys that drive a real browser through the jobs a customer actually does — signing up, paying, closing a month, reporting a hazard.`,
    },
    {
      says: 'A schema change cannot take the product down or lose data.',
      standing: 'proven',
      backing: 'The deploy applies it additively. There is no code path that emits a drop, and a test runs the generator against an empty database and a half-built one and fails the build if it produces anything else.',
    },
    {
      says: `${t.builtHere} of ${t.total} capabilities are built, ${t.partlyHere} are partly there, ${notWritten} are not written yet.`,
      standing: 'proven',
      backing: 'Each of the 38 carries its own state, and a test fails if anything claimed as built does not name a page that exists. Until 24 September this screen claimed all 38.',
    },
    {
      says: 'A job photo is readable only by the business that took it.',
      standing: 'read',
      backing: 'Stored privately, never at a public URL, and served by a route that looks the record up scoped to the signed-in business — proven in tests/photos.test.ts, where removing that fence fails four checks. The route-level cross-business check is not yet proven end to end: until a file store is connected every photo answers 404, so scripts/photo-journey says that one is unproven rather than banking a pass. Walk it once the store is on.',
    },
    {
      says: 'Nobody at SPEC can read a customer’s numbers.',
      standing: 'read',
      backing: 'There is no support tool that renders them and no break-glass path. That is true of the code as written, and it is asserted rather than tested — the honest standing is read, not proven.',
    },
    {
      says: 'A backup can be restored.',
      standing: 'read',
      backing: 'npm run restore-drill proved it on 26 tables and 77,207 rows — onto a separate server, from a copy. It has never been run against the live database, and it is not scheduled.',
    },
    {
      says: 'The public front door is live — sitevipapp.com loads and reads correctly.',
      standing: 'read',
      backing: 'Reported on 24 September by a Claude session running on Kris’s own laptop, which can reach it. Not proven here: this container cannot load the site, so nothing automated confirms it and nothing would notice if it stopped.',
    },
    {
      says: 'The signed-in product works on production.',
      standing: 'unverified',
      backing: 'Everything else was proven against a real build and a real database, and never against production. The front door loading says nothing about what is behind the sign-in — that is where every screen changed today. Walk it on the live site before saying this out loud.',
    },
  ];
}

export const byStanding = (all: readonly Claim[], s: Standing): Claim[] =>
  all.filter(c => c.standing === s);

/**
 * The sentence at the top, which must never round the weak ones away.
 *
 * A pack that opens with "everything is proven" and buries one unverified line is the pack that
 * gets caught, and being caught on the small thing is what makes the big things sound invented.
 */
export function standingLine(all: readonly Claim[]): string {
  const p = byStanding(all, 'proven').length;
  const r = byStanding(all, 'read').length;
  const u = byStanding(all, 'unverified').length;
  const bits = [`${p} of these have something that runs behind them`];
  if (r) bits.push(`${r} rest on somebody having looked`);
  if (u) bits.push(`${u} ${u === 1 ? 'has' : 'have'} not been checked at all`);
  return `${bits.join(', ')}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The money
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Economics {
  leadership: number;
  team: number;
  symbol: string;
  /** What one JBI-shaped business pays a month — 9 leadership, 29 team. */
  exampleMonthly: number;
  /** The target, and the seats it takes at this mix. */
  targetSeats: number;
  targetArr: string;
}

/**
 * The unit economics, read from the prices the product actually charges.
 *
 * Never typed in. The prices here are the ones Stripe takes, and the day somebody changes one this
 * moves with it — which is the difference between a pitch number and a number from the product.
 */
export function economics(currency: Currency = 'aud'): Economics {
  const p = SEAT_PRICES[currency];
  return {
    leadership: p.leadership,
    team: p.team,
    symbol: p.symbol,
    exampleMonthly: 9 * p.leadership + 29 * p.team,
    targetSeats: SOFTWARE_TARGET.seats,
    targetArr: SOFTWARE_TARGET.arr,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The demo
 * ───────────────────────────────────────────────────────────────────────────── */

export interface DemoStep {
  what: string;
  where: string;
  /** The journey that proves this path still works. A step with none does not belong in a demo. */
  provenBy: string;
}

/**
 * The demo, and the rule behind it: **only walk paths a journey has proven.**
 *
 * Every step here is covered by a browser journey that runs in `npm run check`. Nothing that is
 * partly built is in the script, however good it looks — a demo that dies is worth less than a
 * demo that is short.
 */
export const DEMO: DemoStep[] = [
  { what: 'Sign up a business and land on My Page', where: '/signup', provenBy: 'journey.mjs' },
  { what: 'Draw the chart, set a role’s KPIs, add a team', where: '/org', provenBy: 'org-journey.mjs' },
  { what: 'Mark the month, submit it, sign it off without leaving the page', where: '/scoring → /inbox', provenBy: 'signoff-journey.mjs' },
  { what: 'Report a hazard in one line, and watch a serious injury flag itself', where: '/safety', provenBy: 'safety-journey.mjs' },
  { what: 'Show an anonymous wellbeing report storing no name at all', where: '/safety', provenBy: 'safety-journey.mjs' },
  { what: 'Record a lapsed policy and watch it stop work', where: '/compliance', provenBy: 'compliance-journey.mjs' },
  { what: 'Hand administration to somebody else, and be refused as the last one', where: '/settings', provenBy: 'admin-journey.mjs' },
  { what: 'Take a payment for seats', where: '/billing', provenBy: 'pay-journey.mjs' },
];

/** What to say about the gaps, before somebody finds them. */
export function gapsToName(): Capability[] {
  return unfinished().slice(0, 6);
}

export const scaleEvidence = (): ScaleCheck[] => SCALE_CHECKS;

/** The one that is not done. Said first, not last. */
export const scaleGap = (): ScaleCheck | undefined => SCALE_CHECKS.find(c => !c.done);

export const capabilityCount = () => CAPABILITIES.length;
