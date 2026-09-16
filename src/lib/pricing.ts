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
    what: 'The same, and the training built into SPEC — done online, through this system, at their own pace.',
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
  const each = pkg === 'seat_training' ? SEAT_PRICES[currency].withTraining : SEAT_PRICES[currency].seat;
  return each * seats;
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
