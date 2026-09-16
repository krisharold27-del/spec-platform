/**
 * Seat prices — decided per region, never converted (BUILD_SPEC §8.1). Pure, no I/O.
 *
 * Every published price reduces to 8. A price never moves because an exchange rate did; a new
 * region gets a round local number chosen to obey the rule and checked before it is published.
 * The business is billed in its own currency, set by where it is.
 */
export type Currency = 'aud' | 'nzd' | 'gbp' | 'eur' | 'usd' | 'cad';

export const SEAT_PRICES: Record<Currency, { seat: number; withTraining: number; symbol: string }> = {
  aud: { seat: 26, withTraining: 44, symbol: 'A$' },
  nzd: { seat: 35, withTraining: 53, symbol: 'NZ$' },
  gbp: { seat: 17, withTraining: 26, symbol: '£' },
  eur: { seat: 26, withTraining: 44, symbol: '€' },
  usd: { seat: 26, withTraining: 44, symbol: 'US$' },
  cad: { seat: 35, withTraining: 53, symbol: 'CA$' },
};

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

export const seatLabel = (currency: Currency) => `${SEAT_PRICES[currency].symbol}${SEAT_PRICES[currency].seat}`;
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

/** What one seat of each kind costs a month, in this currency. */
export const seatRate = (currency: Currency, training: boolean): number =>
  training ? SEAT_PRICES[currency].withTraining : SEAT_PRICES[currency].seat;

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
}

export const PACKAGES: Record<Package, PackageSpec> = {
  seat: {
    label: 'Seat',
    what: 'One person in SPEC. Their scorecard, their page, their part of the chart.',
    per: 'seat',
    aud: 26,
    everyCurrency: true,
    availableIn: 'anywhere',
  },
  seat_training: {
    label: 'Seat plus training',
    what: 'The same, and SPEC\'s own training material for frontline leaders — done online, through '
      + 'this system, at their own pace. A supervisor or team leader seat only; see canBeTrained.',
    per: 'seat',
    aud: 44,
    everyCurrency: true,
    availableIn: 'anywhere',
  },
  sessions: {
    label: 'SPEC sessions',
    what: 'Training delivered by SPEC rather than by the software. Four one-hour sessions a month, '
      + 'built around the roles the business actually has and how it is actually using SPEC. '
      + 'Delivered from Australia to anywhere in the world.',
    per: 'business',
    aud: 1007,
    everyCurrency: false,
    availableIn: 'anywhere',
  },
  full_control: {
    label: 'Full SPEC control',
    what: 'SPEC runs it. One full day a week on site, and the monthly board meeting attended and chaired. '
      + 'Australia only for now — it is a day of somebody\'s week, in a place they have to be.',
    per: 'business',
    aud: 20888,
    everyCurrency: false,
    availableIn: 'australia',
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
    : (pkg === 'seat_training' ? SEAT_PRICES[c].withTraining : SEAT_PRICES[c].seat);
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
