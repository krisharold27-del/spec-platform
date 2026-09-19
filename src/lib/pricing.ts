/**
 * Seat prices — decided per region, never converted (BUILD_SPEC §8.1). Pure, no I/O.
 *
 * Every published price reduces to 8. A price never moves because an exchange rate did; a new
 * region gets a round local number chosen to obey the rule and checked before it is published.
 * The business is billed in its own currency, set by where it is.
 */
export type Currency = 'aud' | 'nzd' | 'gbp' | 'eur' | 'usd' | 'cad';

export interface SeatPrice {
  /** Somebody who leads people. */
  leadership: number;
  leadershipWithAi: number;
  /** Somebody who is led — priced in a pool, not one at a time. */
  team: number;
  teamWithAi: number;
  symbol: string;
}

/**
 * ── Two seats, not one ──────────────────────────────────────────────────────────────────────────
 *
 * Design 15, 19 September, replacing a single flat seat: **"if you lead people, you're a leadership
 * seat. If you're led, you're a team seat in a pool."**
 *
 * The old table had one `seat` and a `withTraining` beside it. Both are gone: the A$44 training
 * seat was published for months and never sellable — the supervisor pack was never finished — and
 * the design retires it in favour of an AI variant on each of the two real seats.
 *
 * ── The two numbers that were drawn and could not be published ──────────────────────────────────
 *
 * The design draws the AI seats at **$227** and **$29**. Neither reduces to 8, and every published
 * price in this product does — it is the rule at the top of this file and two tests enforce it.
 * Kris, 19 September, given the nearest numbers that obey it: **"224 and 26"**.
 *
 * ── And the other five currencies ───────────────────────────────────────────────────────────────
 *
 * The design gives Australian dollars only. Kris: **"fix all pricing"**. These follow the
 * relationship the old table already expressed — New Zealand and Canada above Australia, Britain
 * about two thirds of it — moved to the nearest number that reduces to 8. They are chosen local
 * numbers, not conversions, which is this file's first rule: *a price never moves because an
 * exchange rate did*.
 *
 * `gbp.team` at £8 is the one to look at twice. It is the nearest number to the two-thirds
 * relationship that obeys the rule, and the alternative is £17 — the same figure as Australia.
 */
export const SEAT_PRICES: Record<Currency, SeatPrice> = {
  aud: { leadership: 134, leadershipWithAi: 224, team: 17, teamWithAi: 26, symbol: 'A$' },
  nzd: { leadership: 179, leadershipWithAi: 296, team: 26, teamWithAi: 44, symbol: 'NZ$' },
  gbp: { leadership: 89, leadershipWithAi: 152, team: 8, teamWithAi: 17, symbol: '£' },
  eur: { leadership: 134, leadershipWithAi: 224, team: 17, teamWithAi: 26, symbol: '€' },
  usd: { leadership: 134, leadershipWithAi: 224, team: 17, teamWithAi: 26, symbol: 'US$' },
  cad: { leadership: 179, leadershipWithAi: 296, team: 26, teamWithAi: 44, symbol: 'CA$' },
};

/** Every number this table publishes, for the rule that they all reduce to 8. */
export const everyPublishedSeatPrice = (p: SeatPrice): number[] =>
  [p.leadership, p.leadershipWithAi, p.team, p.teamWithAi];

/** SPEC's home market — used when there is no way to tell where a business is. */
export const HOME_CURRENCY: Currency = 'aud';

const EURO_AREA = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES']);

/** From the country a business is in (ISO 3166 alpha-2). Anywhere without its own price pays in US dollars. */
export function currencyForCountry(country: string | null | undefined): Currency {
  const c = (country ?? '').trim().toUpperCase();
  if (!c) return HOME_CURRENCY;
  if (c === 'AU') return 'aud';
  if (c === 'NZ') return 'nzd';
  if (c === 'GB' || c === 'UK') return 'gbp';
  if (c === 'US') return 'usd';
  if (c === 'CA') return 'cad';
  if (EURO_AREA.has(c)) return 'eur';
  return 'usd';
}

/** Repeated digit sum: 26 → 8, 35 → 8, 1,700 → 8. */
export function digitRoot(n: number): number {
  let x = Math.abs(Math.round(n));
  while (x >= 10) x = String(x).split('').reduce((s, d) => s + Number(d), 0);
  return x;
}

export type SeatKind = 'leadership' | 'team';

/**
 * Which seat somebody is on, from the chart rather than from their job title.
 *
 * The design describes leadership seats by title — "team leader, supervisor, manager +". SPEC does
 * not have to guess: it holds the org chart, and the chart already knows who has somebody reporting
 * to them. A title is what a business calls a person; the chart is what the person actually does,
 * and the two disagree in every business that has ever existed.
 *
 * So: anybody with a direct report is a leadership seat. Everybody else is a team seat.
 */
export const seatKindFor = (hasDirectReports: boolean): SeatKind =>
  (hasDirectReports ? 'leadership' : 'team');

/** What one seat of a kind costs, with or without the AI. */
export function seatPrice(currency: Currency, kind: SeatKind, withAi = false): number {
  const p = SEAT_PRICES[currency];
  if (kind === 'leadership') return withAi ? p.leadershipWithAi : p.leadership;
  return withAi ? p.teamWithAi : p.team;
}

export const seatLabel = (currency: Currency, kind: SeatKind = 'leadership', withAi = false) =>
  `${SEAT_PRICES[currency].symbol}${seatPrice(currency, kind, withAi)}`;
export const moneyLabel = (currency: Currency, amount: number) => `${SEAT_PRICES[currency].symbol}${amount}`;

/* ─────────────────────────────────────────────────────────────────────────────
 * The four things a business can be buying
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Kris, 16 September 2026, setting the shape of what SPEC sells:
 *
 *   "there are 4 prices = 26 single seat, 44 plus training online through this system, 1007
 *    external training through SPEC 4 1 hour sessions a month and specific to role and usage, and
 *    20888 is for full spec control 1 full day per week and attend and conduct monthly board
 *    meeting — these are controlled by the administrator"
 *
 * ── Two of them are seats and two of them are Kris ───────────────────────────────────────────────
 *
 * That is the distinction the whole file turns on, and it is not a detail of billing. The first two
 * scale with the number of people in the business: more people, more seats, more money, and the
 * marginal cost of one more is nearly nothing. The second two are a flat monthly fee for a share of
 * one person's week — four hours a month, or a full day every week plus the board meeting — and
 * they do not scale with anything. There are only so many Tuesdays.
 *
 * So `per: 'business'` is not a pricing convenience. It is the reason those two cannot be sold to
 * twenty thousand seats, and the reason the product must never quietly multiply them by a headcount.
 *
 * Named `Package` rather than `Tier` because `Tier` already means basic-or-advanced in lib/plan —
 * whether the business has connectors and the assistant. Two different questions, and a shared name
 * would have them confused inside a week.
 */
export type Package = 'seat' | 'seat_training' | 'sessions' | 'full_control';

/* ─────────────────────────────────────────────────────────────────────────────
 * Who the training seat is for
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Kris, 16 September 2026:
 *
 *   "we need to be clear what the $44 price is about — i think we need to make training materials
 *    available for front line leaders and so it need to be only $44 for people who are supervisors,
 *    team leaders etc"
 *
 * ── What the $44 was, before this ────────────────────────────────────────────────────────────────
 *
 * A number on three screens and nothing behind it. `seat_training` was a column on the business,
 * settable from /admin, printed on the pricing page and the landing page — and no line of code
 * charged it or gated anything on it. Checkout only ever used the plain seat price. A business put
 * on "Seat plus training" paid A$26 and received exactly what every other business received.
 *
 * Meanwhile the training MACHINERY already shipped to everyone: a curriculum per role, paths tied to
 * pillars, progress that belongs to the person, sign-off that belongs to the placement. What was
 * missing was the MATERIAL — every business had to write its own modules.
 *
 * So that is what the A$44 is, and the shape follows from it:
 *
 *   A$26  the seat, and the training machinery, and the modules you write yourself. Unchanged.
 *   A$44  the same, plus SPEC's own material for frontline leaders, done online at their own pace.
 *
 * Nothing is taken away from anybody to make room for it.
 *
 * ── And it is a seat, not a plan ─────────────────────────────────────────────────────────────────
 *
 * This is the part that had to change structurally. `seat_training` sat on the BUSINESS, so it could
 * only ever mean "everybody pays A$44". A business of forty with six supervisors would have been
 * charged the training price for thirty-four people who are not being trained. The entitlement moves
 * to the person, and a bill becomes a mixture.
 */
/**
 * Is the A$44 seat sellable yet?
 *
 * Kris, 16 September: *"happy to remove the 44 from the plan for the short term and start
 * cleanly... leave it as a price for the future - i havent finished the supervisor training pack
 * anyway"*.
 *
 * So the price stays — it is published, it reduces to 8, the material that exists is real — and
 * nobody can be put on it until the pack is finished. One switch, because the alternative is
 * deleting the work and rebuilding it in a month, and because a half-removed price is how a number
 * ends up on a page with nothing behind it, which is the fault this whole area was just fixed for.
 *
 * Flipping this to `true` is the only change needed when the pack is done. Everything downstream —
 * the Administration control, the eligibility check, the two-line Stripe bill — is already built and
 * tested and simply has nothing to act on while it is false.
 *
 * It also takes STRIPE_PRICE_SEAT_TRAINING_MONTHLY off the critical path for the first real payment:
 * no training seats can exist, so checkout never needs the training price.
 */
export const TRAINING_SEAT_ON_SALE = false;

export const TRAINING_LEVELS = ['supervisor'] as const;

/**
 * May somebody in this role be put on a training seat?
 *
 * Frontline leaders only — the people who run a crew day to day. Not the stream heads, not the GM,
 * not team members. That is the whole point of the price: it is what a supervisor needs in order to
 * lead the people in front of them, and pretending it suits everybody would make it suit nobody.
 *
 * Levels are `gm | manager | supervisor | staff` (db/schema roles.level). `manager` is a stream head
 * — Head of Commercial, Operations, Growth — which is a seat above the frontline, not on it.
 */
export const canBeTrained = (level: string | null | undefined): boolean =>
  TRAINING_SEAT_ON_SALE
  && TRAINING_LEVELS.includes(String(level) as (typeof TRAINING_LEVELS)[number]);

/** The same question, ignoring whether it is on sale yet — for describing the rule on a page. */
export const isFrontlineLeader = (level: string | null | undefined): boolean =>
  TRAINING_LEVELS.includes(String(level) as (typeof TRAINING_LEVELS)[number]);

/**
 * What one seat costs a month, in this currency.
 *
 * The boolean used to mean "with SPEC's training material". Design 15 retires that seat — it was
 * published for months and never sellable, because the supervisor pack was never finished — and
 * puts an AI variant on each of the two real seats instead. Same shape, different question.
 */
export const seatRate = (currency: Currency, withAi: boolean, kind: SeatKind = 'leadership'): number =>
  seatPrice(currency, kind, withAi);

export interface PackageSpec {
  label: string;
  /** What the business actually gets, in the words it was sold in. */
  what: string;
  /** Multiplied by the number of people, or one flat monthly fee for the business. */
  per: 'seat' | 'business';
  /** The Australian price. Every price SPEC publishes reduces to 8 by digit sum. */
  aud: number;
  /**
   * Whether it has its own chosen price in every currency.
   *
   * True only for the two that scale with seats. The other two are a share of one person's week and
   * are quoted in Australian dollars wherever the customer is — SPEC has no business publishing a
   * euro number nobody has thought about, and a converted price moves every time a rate does.
   */
  everyCurrency: boolean;
  /**
   * Where it can actually be delivered — which is a SEPARATE question from what currency it is
   * priced in, and conflating the two was the first version's mistake.
   *
   * Kris, 16 September: *"3 can be done from australia to anywhere in the world - 4 is only
   * australia at this time"*.
   *
   * Four one-hour sessions a month travel down a video call, so a business in Leeds or Auckland can
   * buy them — they just pay in Australian dollars. A full day a week on site, plus chairing the
   * board meeting, cannot be delivered to Leeds by anybody who is in Wangaratta on Tuesday. That is
   * a fact about the calendar and the plane, not about money, and the product has to say so rather
   * than take an order it cannot fill.
   */
  availableIn: 'anywhere' | 'australia';
  /**
   * Whether the price may be PUBLISHED, as opposed to quoted in a conversation.
   *
   * Kris, 18 September: *"do NOT show the price... At this level people buy trust, not a price tag
   * — the number cold triggers sticker shock before you've framed the value."*
   *
   * This is not secrecy and it is not negotiability — the price is fixed, and /admin shows it to
   * whoever is setting a business up. It is about ORDER: a five-figure monthly number read before
   * anybody has explained what a full day a week buys is a number that ends the conversation
   * instead of starting it.
   *
   * The seat price is the opposite case and stays published: low friction, and transparency is the
   * whole argument for it.
   */
  publishPrice: boolean;
}

export const PACKAGES: Record<Package, PackageSpec> = {
  /*
    ── The package keys are older than the model they now describe ────────────────────────────

    `seat` and `seat_training` are stored on businesses, so the KEYS are left alone: renaming them
    is a data migration, not a rename. What they mean has changed with design 15 — `seat_training`
    is now the AI variant rather than SPEC's training material, which was published for months and
    never sellable. The names should follow in a migration; until then this note is the only thing
    stopping somebody reading the key and believing it.

    Team seats are deliberately NOT a package. A business does not choose them: every business has
    both kinds the moment it has a chart, and which seat a person is on is read from who reports to
    whom. See `seatKindFor`.
  */
  seat: {
    label: 'Leadership seat',
    what: 'One person who leads people. Their scorecard, their page, their part of the chart.',
    per: 'seat',
    aud: 134,
    everyCurrency: true,
    availableIn: 'anywhere',
    publishPrice: true,
  },
  seat_training: {
    label: 'Leadership seat with AI',
    what: 'The same seat, with the assistant on it — SPEC reading the numbers with them rather than '
      + 'just holding them.',
    per: 'seat',
    aud: 224,
    everyCurrency: true,
    availableIn: 'anywhere',
    publishPrice: true,
  },
  /*
    A$1,007 → A$1,502 on 18 September. Kris: *"One-to-one is the premium format, and the old number
    priced it like a freelancer hour ($250/hr) — too cheap for training delivered at your level."*

    ── And design 15 still says 1,007 ───────────────────────────────────────────────────────────

    `designs/SPEC Pricing.dc.html` was drawn before that decision and carries the old figure. On 19
    September, asked directly, Kris: **"training is 1502"**. The product is right and the design is
    stale on this one number.

    It is written here because it cannot be caught by a rule: BOTH numbers reduce to 8, so the
    digit-root check that stopped the AI seats going out wrong is blind to this one. The only thing
    standing between 1,502 and somebody "fixing" it back to match the drawing is this note and the
    two tests that assert 1502 by name.

    The old figure divided into four sessions at about A$250 each, which is what an hour of
    somebody's time costs. This is not an hour of somebody's time; it is Kris teaching one person to
    run a business the way he runs one. 1+5+0+2 = 8, so the rule holds.
  */
  sessions: {
    label: 'SPEC sessions',
    what: 'Training delivered by SPEC rather than by the software. Four one-to-one sessions a month '
      + 'with whoever you choose to set this up and run it — built around the roles the business '
      + 'actually has and how it is actually using SPEC. Delivered from Australia to anywhere in '
      + 'the world.',
    per: 'business',
    aud: 1502,
    everyCurrency: false,
    availableIn: 'anywhere',
    publishPrice: true,
  },
  full_control: {
    label: 'Full SPEC control',
    what: 'SPEC runs it. One full day a week on site, and the monthly board meeting attended and chaired. '
      + 'Australia only for now — it is a day of somebody\'s week, in a place they have to be.',
    per: 'business',
    aud: 20888,
    everyCurrency: false,
    availableIn: 'australia',
    // The one price SPEC does not publish — see `publishPrice`. It is quoted in a conversation.
    publishPrice: false,
  },
};

export const PACKAGE_KEYS = Object.keys(PACKAGES) as Package[];

/** The package a stored value names, falling back to a plain seat rather than to nothing. */
export const packageOf = (value: string | null | undefined): Package =>
  PACKAGE_KEYS.includes(value as Package) ? (value as Package) : 'seat';

/**
 * What this package costs a month, in this currency, for this many people.
 *
 * A per-business package is the same figure whatever the headcount — that is what makes it a share
 * of somebody's week rather than a licence — so `seats` is ignored for those two on purpose.
 */
export function monthlyCostOf(pkg: Package, currency: Currency, seats: number): number {
  const spec = PACKAGES[pkg];
  if (spec.per === 'business') return spec.aud;
  return seatRate(currency, pkg === 'seat_training') * seats;
}

/**
 * The currency a package is actually sold in.
 *
 * The two per-business packages are Australian dollars wherever the business is, because that is the
 * only price anybody has chosen for them. Saying so is better than converting: a converted price is
 * a number nobody decided, and it moves every time an exchange rate does.
 */
export const currencyFor = (pkg: Package, currency: Currency): Currency =>
  PACKAGES[pkg].everyCurrency ? currency : HOME_CURRENCY;

/** What a package costs, written out. Never a bare number with no currency against it. */
export function packagePrice(pkg: Package, currency: Currency = HOME_CURRENCY): string {
  const spec = PACKAGES[pkg];
  const c = currencyFor(pkg, currency);
  const amount = spec.per === 'business'
    ? spec.aud
    : seatPrice(c, 'leadership', pkg === 'seat_training');
  return `${moneyLabel(c, amount)}${spec.per === 'seat' ? ' a person a month' : ' a month'}`;
}

/**
 * Can this business actually be sold this package?
 *
 * Availability, not affordability. Full control means a person on site every week and in the board
 * meeting every month; there is no version of that for a business in another country, and offering
 * it would be taking an order nobody can fill. `sessions` passes from anywhere because four hours a
 * month go down a video call.
 *
 * An unknown country reads as Australia — the home market — rather than as a refusal. SPEC not
 * knowing where somebody is should never be the reason they cannot buy something.
 */
export function availableTo(pkg: Package, country: string | null | undefined): boolean {
  if (PACKAGES[pkg].availableIn === 'anywhere') return true;
  const c = (country ?? '').trim().toUpperCase();
  return c === '' || c === 'AU';
}

/** Why not, in words a person can act on. Null when there is nothing in the way. */
export function unavailableBecause(pkg: Package, country: string | null | undefined): string | null {
  if (availableTo(pkg, country)) return null;
  return `${PACKAGES[pkg].label} means a day on site every week and the board meeting in person. `
    + 'That is Australia only at the moment.';
}
