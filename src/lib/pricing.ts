/**
 * Seat prices — decided per region, never converted (BUILD_SPEC §8.1). Pure, no I/O.
 *
 * A price never moves because an exchange rate did. The business is billed in its own currency,
 * set by where it is.
 *
 * ── These numbers are Stripe's, not this file's ─────────────────────────────────────────────────
 *
 * Kris, 19 September, **"SPEC Pricing — Stripe Handoff for Code"**, confirmed against the live
 * account `acct_1UCYbyGjbPN3KVS7`: *"This is the single source of truth for pricing. Anything in
 * the codebase or design files that disagrees with this document is out of date and should be
 * changed to match."*
 *
 * That reverses the direction this file used to run in. It used to CHOOSE the prices, and the setup
 * document told somebody what to type into Stripe afterwards. The products now exist, live, with
 * real price IDs, and it is Stripe that charges the card — so when the two disagree it is this file
 * telling a customer a price they will not be charged. Stripe wins. Hence `STRIPE_PRICES` below:
 * the amounts and the price IDs are transcribed from one document, together, so they cannot drift
 * apart one at a time.
 */
import { resolveSeatKind } from './chart-seats';

export type Currency = 'aud' | 'nzd' | 'gbp' | 'eur' | 'usd' | 'cad';

/** Every currency a seat can be charged in. AUD is the default currency on each Stripe price. */
export const SUPPORTED_CURRENCIES = ['aud', 'nzd', 'gbp', 'eur', 'usd', 'cad'] as const;

export interface SeatPrice {
  /** Somebody who leads people. */
  leadership: number;
  /** A leadership seat upgraded to carry SPEC's own training material — see `TRAINING_SEAT_ON_SALE`. */
  leadershipWithTraining: number;
  /** Somebody who is led — priced in a pool, not one at a time. */
  team: number;
  symbol: string;
}

/**
 * ── One price per seat kind, not two ────────────────────────────────────────────────────────────
 *
 * Design 15, 19 September, split one flat seat into two: **"if you lead people, you're a leadership
 * seat. If you're led, you're a team seat in a pool."** That stands. What does not survive is the
 * SECOND split it arrived with — Basic and Advanced, the same seat at two different prices — which
 * lasted one session. Kris, 22 September, looking at the built result: *"i also feel like i don't
 * want to have 2 different prices. either use the system or not - make it simple - I think take all
 * prices for seat to $134 and for team members $26 - feels too confusing to me."* Asked to confirm,
 * he restated it rather than reversing it: *"make it either on or off - then the prices are clear -
 * the system seats are $134 and the member seats are $26."*
 *
 * "On or off" is not a third tier. It is `aiActive` (lib/plan) — subscribed, or not — which already
 * decided whether the assistant works, from before this session started, independently of whatever
 * seat tier a business was on. The Advanced price never bought a different product; `aiActive` was
 * never read from `seatTier`. Two prices for one thing was the whole complaint, so there is one price
 * again: `tenants.seatTier` is retired the same way `tenants.tier` was on 18 September — kept in the
 * schema, no longer read, additive migrations meaning it is never worth a rollback to drop it.
 *
 * Nothing about the actual numbers changes. Kris first asked for the team seat to move from $17 to
 * $26 — the rule-of-8 number this table's own history already names as one he wanted (see
 * `RULE_OF_EIGHT` below) — then, once the tier itself was gone, said to leave it: *"oh yeah stay at
 * 17 that sfine."* So AUD keeps the $17 it already had, matching the live Stripe price exactly, and
 * every other currency keeps the amounts it already had too. What changed is only the SHAPE: one
 * price per seat kind rather than two.
 *
 * ── A third number returns, meaning something different ─────────────────────────────────────────
 *
 * `leadershipWithTraining` reuses the exact figures the retired Advanced/AI leadership price had —
 * the same live Stripe price object, `RETIRED_STRIPE_PRICES.leader_advanced` until this change, now
 * un-retired below as `leaderTraining`. Kris, 22 September, once the tier itself was gone: *"i think
 * the 227 price can stay but change to full training system price — so all training materials
 * become available for the role — we as SPEC are constantly building our training materials so they
 * can turn the seat to a leadership and training seat and that then makes it 227."*
 *
 * A leadership seat, upgraded, per person, by an administrator — not a business-wide switch, and
 * not a different Stripe product from the one that already existed. Only its meaning changed: it no
 * longer buys the AI-powered leadership seat, which nothing distinguished from the plain one either
 * (see the note above on `aiActive`). It now buys the one thing the price was never used for before
 * — SPEC's own training material, unlocked for the person holding the seat.
 */
export const SEAT_PRICES: Record<Currency, SeatPrice> = {
  aud: { leadership: 134, leadershipWithTraining: 227, team: 17, symbol: 'A$' },
  nzd: { leadership: 180, leadershipWithTraining: 305, team: 23, symbol: 'NZ$' },
  gbp: { leadership: 88, leadershipWithTraining: 149, team: 11, symbol: '£' },
  eur: { leadership: 134, leadershipWithTraining: 227, team: 17, symbol: '€' },
  usd: { leadership: 134, leadershipWithTraining: 227, team: 17, symbol: 'US$' },
  cad: { leadership: 180, leadershipWithTraining: 305, team: 23, symbol: 'CA$' },
};

/** Every number this table publishes. */
export const everyPublishedSeatPrice = (p: SeatPrice): number[] =>
  [p.leadership, p.leadershipWithTraining, p.team];

/**
 * ── The rule of 8, and what happened to it ──────────────────────────────────────────────────────
 *
 * Every published price in SPEC reduced to 8 by repeated digit sum. It was a real rule of Kris's,
 * enforced in three separate tests, and on 19 September it is what stopped design 15's Advanced
 * prices — $227 and $29 — going out: he was given the nearest numbers that obeyed it and said
 * *"224 and 26"*, and those were built and published, then overridden by what Stripe actually
 * charged (227 and 29) once the account confirmed it. That whole tier is gone as of 22 September —
 * see the note on `SEAT_PRICES` — and with it the one price this table could never make obey the
 * rule.
 *
 * Eighteen prices published now (three seat kinds, six currencies) since `leadershipWithTraining`
 * returned. Eight of them reduce to 8 — AUD, EUR and USD's leadership (134) and team (17) seats, and
 * NZD and CAD's training seat (305) — and the other ten do not: NZD/CAD's leadership and team, GBP's
 * every seat, and AUD/EUR/USD's training seat (227). `tests/pricing.test.ts` asserts the set below is
 * exactly this: no more and no fewer, so a future price change that breaks the rule fails a test
 * until somebody decides it on purpose.
 */
export const RULE_OF_EIGHT: readonly number[] = [17, 134, 305];

/** Repeated digit sum: 26 → 8, 35 → 8, 1,700 → 8. */
export function digitRoot(n: number): number {
  let x = Math.abs(Math.round(n));
  while (x >= 10) x = String(x).split('').reduce((s, d) => s + Number(d), 0);
  return x;
}

/** Which of the twelve published seat prices reduce to 8, as a sorted set of amounts. */
export const pricesObeyingTheRule = (): number[] => [
  ...new Set(Object.values(SEAT_PRICES)
    .flatMap(everyPublishedSeatPrice)
    .filter(amount => digitRoot(amount) === 8)),
].sort((a, b) => a - b);

/* ─────────────────────────────────────────────────────────────────────────────
 * What these prices ARE, in Stripe
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The live price objects. From the handoff of 19 September, account `acct_1UCYbyGjbPN3KVS7`.
 *
 * ── Why these are in the code and not only in the environment ───────────────────────────────────
 *
 * They were environment variables — `STRIPE_PRICE_SEAT_MONTHLY` and one more — and that was right
 * while the prices were a thing somebody would type into Stripe on the day. It is wrong now. A
 * price id is not a secret and not a setting: it names a specific product at a specific amount, and
 * the amount is written twelve lines above. Splitting the two across a deployment settings box is
 * exactly how a business gets charged 224 on a page that says 227.
 *
 * The environment variables are still READ, and still win when set, so a deployment can be pointed
 * at test-mode prices without a release. These are the fallback, and the fallback is the truth.
 */
export const STRIPE_PRICES = {
  leader: 'price_1UHK06GjbPN3KVS7Erx7Aeum',
  team: 'price_1UHK5hGjbPN3KVS7hzoKltlI',
  /**
   * The leadership seat, upgraded with SPEC's training material. Un-retired 22 September — this is
   * the same `leader_advanced` id that used to buy the AI-powered leadership seat, repurposed rather
   * than replaced: see the note on `SEAT_PRICES`.
   */
  leaderTraining: 'price_1UHK3PGjbPN3KVS7vot0UtCu',
  /** Flat monthly, quantity 1, Australian dollars only — the $1,502 SPEC Training package, not a seat. */
  training: 'price_1UHK94GjbPN3KVS7FE5GGzAC',
} as const;

export type StripePriceKey = keyof typeof STRIPE_PRICES;

/**
 * The Stripe price id for one of the two seat products — the environment variable wins when set
 * (a deployment can be pointed at test-mode prices without a release), `STRIPE_PRICES` is the
 * fallback and the truth.
 */
export const stripePriceId = (key: StripePriceKey, envName: string): string =>
  process.env[envName] || STRIPE_PRICES[key];

/**
 * The Advanced/AI-priced TEAM seat, retired 22 September along with the tier it billed and never
 * un-retired — there is no team-seat training upgrade, only a leadership one (see `STRIPE_PRICES`).
 * Still live in Stripe — nobody archived it — but no code path references it any more.
 */
export const RETIRED_STRIPE_PRICES = {
  team_advanced: 'price_1UHK7lGjbPN3KVS7EXlND5Xg',
} as const;

/**
 * The subscription line items for a bill — one place, used by both a NEW checkout and an UPDATE to
 * an existing subscription, so the two can never compute this differently.
 *
 * ── Why this used to be only in one place ───────────────────────────────────────────────────────
 *
 * `api/stripe/checkout/route.ts` used to build this inline, because a business could only ever
 * reach this shape once — at its first checkout. That stopped being true once a business could be
 * on a subscription already and change its seat counts, which has to update the SAME subscription
 * rather than start a second one, and needs the identical two lines to reconcile against. Two
 * versions of "what a bill is made of" is exactly the fault `seatBill`'s own history warns about —
 * see the note there on a business being billed four times over because the bill asked an old
 * question.
 */
export function lineItemsFor(
  bill: { leadership: number; team: number; training?: number },
): { price: string; quantity: number }[] {
  const lines: { price: string; quantity: number }[] = [];
  /*
    ── `bill.leadership` is the TOTAL leadership count, trained seats included ─────────────────────
    See the note on `seatBill` in lib/plan: it returns `leadership: billablePlain + billableTraining`
    on purpose, so `bill.leadership + bill.team` is always every billed seat — the number
    `countLeadershipSeats`-style callers actually want. But that means the PLAIN leadership price
    must only ever be charged for the seats not already counted at the dearer training price, or a
    trained leader is billed twice: once here, once on the training line below.

    Found writing the test for this function rather than in it — nothing had ever exercised a
    non-zero `training` here, because no test constructed one. A business of forty with six leaders,
    two of them trained, would have been charged for eight leadership-rate seats instead of six —
    4 plain + 2 trained at A$134 each on top of the 2 at A$227, rather than 4 at A$134 and 2 at A$227.
  */
  const training = Math.max(0, bill.training ?? 0);
  const plainLeadership = Math.max(0, bill.leadership - training);
  if (plainLeadership > 0) {
    lines.push({
      price: stripePriceId('leader', 'STRIPE_PRICE_SEAT_MONTHLY'),
      quantity: plainLeadership,
    });
  }
  if (bill.team > 0) {
    lines.push({
      price: stripePriceId('team', 'STRIPE_PRICE_TEAM_SEAT_MONTHLY'),
      quantity: bill.team,
    });
  }
  // A third line, only when somebody is actually on the training upgrade — at its own price,
  // never on top of the plain leadership line above.
  if (training > 0) {
    lines.push({
      price: stripePriceId('leaderTraining', 'STRIPE_PRICE_SEAT_TRAINING_MONTHLY'),
      quantity: training,
    });
  }
  return lines;
}

/** The products those prices hang off, for anybody checking the account against this file. */
export const STRIPE_PRODUCTS = {
  leader: 'prod_VHtnsfpPRSp6no',
  team: 'prod_VHtt211YPktGXS',
  leaderTraining: 'prod_VHtrdn6wF9T8JM',
  training: 'prod_VHtwe8HgAnBYdW',
} as const;

/** The product `RETIRED_STRIPE_PRICES.team_advanced` hangs off — see the note there. */
export const RETIRED_STRIPE_PRODUCTS = {
  team_advanced: 'prod_VHtv5osYcg3Snq',
} as const;

/**
 * Stripe's tax code on every SPEC product: SaaS, business use.
 *
 * AUD, NZD, GBP and EUR prices are tax-INCLUSIVE (GST 10% inclusive for Australia); USD and CAD are
 * tax-exclusive, per Stripe's defaults for those currencies. That is a fact about the account
 * rather than about this code, and it is written here because the A$134 on the pricing page
 * includes GST and the US$134 does not — which is the sort of thing a page gets wrong once and
 * argues about for a year.
 */
export const STRIPE_TAX_CODE = 'txcd_10103101';
export const TAX_INCLUSIVE: readonly Currency[] = ['aud', 'nzd', 'gbp', 'eur'];
export const taxInclusive = (currency: Currency): boolean => TAX_INCLUSIVE.includes(currency);

/**
 * The products archived on 19 September, by id, so nothing here can quietly start using one again.
 *
 * *"These are hidden from new purchases. Remove any references in code."* Hidden is not deleted: an
 * archived price still works if a subscription already carries it, and still works if a line of
 * code names it. The ids are written down rather than removed so a test can assert that no shipping
 * file mentions one — a list of forbidden strings is checkable, and an absence is not.
 */
export const ARCHIVED_STRIPE_PRODUCTS: Readonly<Record<string, string>> = {
  prod_VGms7JaCYAmkV3: 'SPEC seat — replaced by the four seat products',
  prod_VGp2hZXTj5ukFc: 'SPEC seat plus training — bundle no longer offered',
  prod_VGp27IVSeLFMCJ: 'SPEC sessions at A$1,007 — replaced by SPEC Training at A$1,502',
  prod_VGp3236DAXd8dA: 'SPEC full control at A$20,888 — not part of the current offer',
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

export type SeatKind = 'leadership' | 'team';

/**
 * ── Which seat somebody is on lives in lib/chart-seats, not here ────────────────────────────────
 *
 * There were two functions called `seatKindFor` with different signatures and different answers.
 * This one took a bare `hasDirectReports` and decided by the chart alone; the one in
 * `lib/chart-seats` takes the title as well and decides by either.
 *
 * They disagree about a Site Supervisor whose crew has not been drawn yet — this one called that a
 * team seat and billed A$17 for somebody who leads people. Two rules for the same question, one of
 * them wrong, both exported, and money riding on which one a caller happened to import. So there is
 * one now, and it is the richer one: `seatKindFor` in lib/chart-seats.
 *
 * `SeatKind` stays here because the PRICES are keyed by it.
 */

/** What one seat of a kind costs. */
export function seatPrice(currency: Currency, kind: SeatKind): number {
  const p = SEAT_PRICES[currency];
  return kind === 'leadership' ? p.leadership : p.team;
}

export const seatLabel = (currency: Currency, kind: SeatKind = 'leadership') =>
  `${SEAT_PRICES[currency].symbol}${seatPrice(currency, kind)}`;
export const moneyLabel = (currency: Currency, amount: number) => `${SEAT_PRICES[currency].symbol}${amount}`;

/** What a leadership seat costs once it carries SPEC's training material. */
export const trainingSeatPrice = (currency: Currency): number => SEAT_PRICES[currency].leadershipWithTraining;
export const trainingSeatLabel = (currency: Currency) =>
  `${SEAT_PRICES[currency].symbol}${trainingSeatPrice(currency)}`;

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
 * Is the training seat sellable yet?
 *
 * Kris, 16 September, holding the price back: *"happy to remove the 44 from the plan for the short
 * term and start cleanly... leave it as a price for the future - i havent finished the supervisor
 * training pack anyway"*. That pack is `lib/training-library`'s twelve modules, and it exists now —
 * Kris, 22 September, asked whether the seat should be turned on business-wide or per person once an
 * administrator puts somebody on it: *"per-person... on now"*. So this is `true`: every eligible
 * leader can be put on it today, one at a time, by their own administrator.
 *
 * It stays a single switch rather than being deleted, because the alternative — pulling the whole
 * mechanism out and rebuilding it the next time a price needs holding back — is exactly the mistake
 * this file was built to stop repeating.
 */
export const TRAINING_SEAT_ON_SALE = true;

/**
 * May somebody in this role be put on the training seat?
 *
 * ── Broadened from "frontline leader" to "leadership seat" ──────────────────────────────────────
 *
 * It used to be role LEVEL — `supervisor` only, nobody above or below. Kris's 22 September answer
 * ("one shared library, role decides eligibility") reuses the same library for everybody who leads
 * people, not only the frontline: the price is now the leadership seat's own training upgrade, so
 * the question is the same one that decides which seat somebody is on in the first place —
 * `seatKindFor` in lib/chart-seats, read off the chart rather than off a level string that could
 * disagree with it.
 *
 * `override` is the same administrator's-choice signal `resolveSeatKind` reads for billing — a
 * person moved onto the leadership seat by hand is eligible the same way one the chart already
 * calls a leader is, and one moved onto the team seat by hand is not, however the chart reads.
 * Eligibility can never disagree with what the person is actually billed as.
 */
export const eligibleForTrainingSeat = (
  role: { title: string; hasDirectReports: boolean },
  override?: SeatKind | null,
): boolean =>
  TRAINING_SEAT_ON_SALE && resolveSeatKind(role, override) === 'leadership';

export interface PackageSpec {
  label: string;
  /** What the business actually gets, in the words it was sold in. */
  what: string;
  /** Multiplied by the number of people, or one flat monthly fee for the business. */
  per: 'seat' | 'business';
  /**
   * The Australian price, or null for the one thing SPEC does not price at all.
   *
   * Null is not "free" and not "we have not decided". Consulting is quote-only — Kris's handoff of
   * 19 September: *"Consulting is quote-only — 'Speak to us'. No Stripe product."* — and the
   * A$20,888 that used to sit here is an ARCHIVED Stripe product, not a current offer. A number
   * kept "for reference" on something that cannot be bought is a number that ends up on a page.
   */
  aud: number | null;
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
    // Stripe: "SPEC Leadership seat - Basic". Named the same on the page as on the invoice, because
    // the one place a customer compares the two is when they are already unhappy.
    label: 'Leadership seat — Basic',
    what: 'One person who leads people. Their scorecard, their page, their part of the chart.',
    per: 'seat',
    aud: 134,
    everyCurrency: true,
    availableIn: 'anywhere',
    publishPrice: true,
  },
  seat_training: {
    /*
      Retired 22 September, the same day as the Advanced tier it priced: Kris, looking at the built
      result, *"i also feel like i don't want to have 2 different prices... take all prices for
      seat to $134."* There is no second leadership price any more, so this package now costs
      exactly what `seat` does and is not offered on the pricing page — kept, not deleted, because
      the key is stored on businesses (see the note above) and a business already on it must keep
      reading a real price rather than `undefined`.
    */
    label: 'Leadership seat',
    what: 'One person who leads people. Their scorecard, their page, their part of the chart.',
    per: 'seat',
    aud: 134,
    everyCurrency: true,
    availableIn: 'anywhere',
    publishPrice: false,
  },
  /*
    A$1,007 → A$1,502 on 18 September. Kris: *"One-to-one is the premium format, and the old number
    priced it like a freelancer hour ($250/hr) — too cheap for training delivered at your level."*
    Confirmed against the live account on 19 September, where it is `prod_VHtwe8HgAnBYdW` at 1502
    and the A$1,007 product is archived.

    ── And design 15 still says 1,007 ───────────────────────────────────────────────────────────

    `designs/SPEC Pricing.dc.html` was drawn before that decision and carried the old figure until
    the handoff, which lists it under *"Design files to update"*. Asked directly on 19 September,
    Kris: **"training is 1502"**.

    It is written down here because it cannot be caught by a rule: BOTH numbers reduce to 8, so the
    digit-root check that used to guard prices was blind to this one either way. The only thing
    standing between 1,502 and somebody "fixing" it back to match an old drawing is this note and
    the tests that assert 1502 by name.
  */
  sessions: {
    // Stripe: "SPEC Training". The key stays `sessions` because it is stored on businesses.
    label: 'SPEC Training',
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
  /*
    ── The A$20,888 is gone, and that is a decision rather than an omission ─────────────────────

    The handoff of 19 September archives `prod_VGp3236DAXd8dA` — *"SPEC full control ($20,888) —
    Not part of the current offer"* — and replaces it with: *"Consulting is quote-only — 'Speak to
    us'. No Stripe product."* It also names an internal reference rate for quoting, which is never
    shown to customers and is therefore not written down anywhere in this repository.

    So there is nothing to charge and nothing to publish. `aud` is null rather than 20888-kept-
    quietly, because `publishPrice: false` only governs the marketing page: /admin printed the
    number too, and an archived price shown to whoever is setting a business up is a price somebody
    will quote. The offer itself stays — a day a week and the board meeting is still the thing at
    the top of the ladder — it is simply priced in the conversation now.

    The handoff also gives an internal hourly reference for quoting consulting, and it is
    deliberately NOT written down here. Kris: *"never shown to customers"*.
    `tests/published-prices.test.ts` scans the whole of src for it — raw, comments included,
    because a number that must never be shown has no business living one careless
    `toLocaleString` away from a page.
  */
  full_control: {
    label: 'Full SPEC control',
    what: 'SPEC runs it. One full day a week on site, and the monthly board meeting attended and chaired. '
      + 'Australia only for now — it is a day of somebody\'s week, in a place they have to be.',
    per: 'business',
    aud: null,
    everyCurrency: false,
    availableIn: 'australia',
    // The one thing SPEC does not price on a page — see `publishPrice`. It is quoted in a conversation.
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
export function monthlyCostOf(pkg: Package, currency: Currency, seats: number): number | null {
  const spec = PACKAGES[pkg];
  // Null means there is no price, not that it is free — consulting is quoted, never charged from
  // a table. Every caller has to say what it does about that rather than multiply a zero.
  if (spec.aud === null) return null;
  if (spec.per === 'business') return spec.aud;
  return seatPrice(currency, 'leadership') * seats;
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

/**
 * What a package costs, written out. Never a bare number with no currency against it.
 *
 * ── Two ways this comes back as words instead of money ──────────────────────────────────────────
 *
 * Consulting has no price at all, so it is **Speak to us** wherever you are.
 *
 * SPEC Training has a price and it exists in Australian dollars only — one Stripe price, AUD, no
 * `currency_options`. Kris's handoff: *"if the customer's currency is not AUD, show Training as
 * 'Speak to us' rather than a price."* That is a change from what this function used to do, which
 * was print the Australian figure at a British customer and let them work out what they would
 * actually be charged. Stripe cannot charge them A$1,502 on a GBP subscription, so the old
 * behaviour was quoting a price that could not be taken.
 */
export const SPEAK_TO_US = 'Speak to us';

export function packagePrice(pkg: Package, currency: Currency = HOME_CURRENCY): string {
  const spec = PACKAGES[pkg];
  if (spec.aud === null) return SPEAK_TO_US;
  const c = currencyFor(pkg, currency);
  if (spec.per === 'business') {
    if (currency !== HOME_CURRENCY) return SPEAK_TO_US;
    return `${moneyLabel(c, spec.aud)} a month`;
  }
  return `${moneyLabel(c, seatPrice(c, 'leadership'))} a person a month`;
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
