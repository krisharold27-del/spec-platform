/**
 * Is our rate right? — and the sharp question that follows.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"Compares our hourly rate with BOTH what our quotes win at (won/lost history) AND local
 * competitors' published rates. When out of line, SPEC asks the sharp question 'Is the market wrong,
 * or are we?' with two actions (hold the rate / test a new rate for 30 days)."*
 *
 * ── Two comparisons, because either alone gives the wrong answer ─────────────────────────────────
 *
 * Against the market alone, a business winning everything at $95 concludes it is competitive. It is
 * not — it is cheap, and the market rate is what other people charge, not what they get.
 *
 * Against its own win rate alone, a business losing most of its quotes concludes it is too dear. It
 * might be, or its estimates might be wrong, or it might be quoting the wrong work. The win rate
 * says something is off; only the market says which direction.
 *
 * Together they make a claim worth acting on. Apart they are two numbers an owner already half
 * knows and has an argument about.
 *
 * ── Why SPEC asks rather than tells ──────────────────────────────────────────────────────────────
 *
 * *"Is the market wrong, or are we?"* is a genuine question and SPEC does not know the answer. A
 * business winning ninety per cent of its work at a low rate may be deliberately buying a sector;
 * one losing most of its quotes may be holding a price it is right to hold. What SPEC can do is
 * make sure the question is asked with the real numbers in front of it — and give a way to TEST
 * rather than only to decide, because a rate change is reversible and a guess is not.
 *
 * ── The numbers SPEC will not invent ─────────────────────────────────────────────────────────────
 *
 * Competitors' published rates have to come from somewhere real. There is no feed, so they are
 * entered by the business with a source and a date, and a comparison with nothing to compare
 * against says so rather than quietly becoming a comparison against zero.
 */

/** What SPEC needs to answer the question. Any of it may be missing. */
export interface RateFacts {
  /** What the business charges an hour, in cents. Null when no standard rate is set. */
  ourCents: number | null;
  /** What local competitors publish, in cents, each with where it came from. */
  market: readonly { who: string; cents: number; source: string; seenAt: string }[];
  /** Quotes decided in the window: won and lost. */
  won: number;
  lost: number;
}

/** Below this many decided quotes, a win rate is an anecdote. */
export const ENOUGH_QUOTES = 10;

/** Winning this much of the time is a warning, not a triumph. */
export const TOO_MANY = 0.85;
/** Winning less than this is a warning too. */
export const TOO_FEW = 0.25;

/** How far from the market before it is worth saying anything. */
export const OUT_OF_LINE = 0.1;

export type Verdict =
  | 'no_rate'        // nobody has set a rate
  | 'not_enough'     // too few decided quotes to read a win rate
  | 'cheap'          // winning nearly everything
  | 'dear'           // losing nearly everything
  | 'in_line';       // nothing to say

export interface RateReading {
  verdict: Verdict;
  /** 0–1, or null when there is not enough to say. */
  winRate: number | null;
  /** The middle of the published market rates, in cents. Null when nothing has been entered. */
  marketCents: number | null;
  /** How far above or below the market, as a fraction. Null when either end is missing. */
  against: number | null;
  says: string;
  /** THE question. Null when there is nothing worth asking. */
  ask: string | null;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(0)}`;

/** The middle rate, not the average: one outlier in a list of four should not move the answer. */
function middleOf(list: readonly { cents: number }[]): number | null {
  if (list.length === 0) return null;
  const sorted = [...list].map(m => m.cents).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export function readRate(facts: RateFacts): RateReading {
  const marketCents = middleOf(facts.market);
  const decided = facts.won + facts.lost;
  const winRate = decided >= ENOUGH_QUOTES ? facts.won / decided : null;
  const against = facts.ourCents !== null && marketCents !== null
    ? (facts.ourCents - marketCents) / marketCents
    : null;

  if (facts.ourCents === null) {
    return {
      verdict: 'no_rate', winRate, marketCents, against, ask: null,
      says: 'No standard hourly rate is set, so there is nothing to compare. Set one and SPEC will tell you how it is doing.',
    };
  }
  if (winRate === null) {
    return {
      verdict: 'not_enough', winRate, marketCents, against, ask: null,
      says: `${decided} ${decided === 1 ? 'quote has' : 'quotes have'} been decided. Under ${ENOUGH_QUOTES} a win rate is an anecdote, so SPEC will not read anything into it yet.`,
    };
  }

  const pct = Math.round(winRate * 100);
  const marketBit = marketCents === null
    ? 'Nobody has told SPEC what anybody else charges, so there is only half the picture here.'
    : against !== null && Math.abs(against) < OUT_OF_LINE
      ? `Your ${money(facts.ourCents)} is in line with the ${money(marketCents)} others publish.`
      : against !== null && against < 0
        ? `Your ${money(facts.ourCents)} is ${Math.round(Math.abs(against) * 100)}% under the ${money(marketCents)} others publish.`
        : `Your ${money(facts.ourCents)} is ${Math.round((against ?? 0) * 100)}% over the ${money(marketCents)} others publish.`;

  if (winRate >= TOO_MANY) {
    return {
      verdict: 'cheap', winRate, marketCents, against, ask: ASK,
      says: `You are winning ${pct}% of what you quote. ${marketBit} Winning nearly everything is not a sign you are good at quoting — it is a sign you are the cheap option.`,
    };
  }
  if (winRate <= TOO_FEW) {
    return {
      verdict: 'dear', winRate, marketCents, against, ask: ASK,
      says: `You are winning ${pct}% of what you quote. ${marketBit} That is either a price problem or a costing problem, and they need different answers.`,
    };
  }
  return {
    verdict: 'in_line', winRate, marketCents, against, ask: null,
    says: `You are winning ${pct}% of what you quote. ${marketBit}`,
  };
}

/** The question, word for word. */
export const ASK = 'Is the market wrong, or are we?';

export type RateAction = 'hold' | 'test';

export const ACTIONS: { key: RateAction; label: string; is: string }[] = [
  {
    key: 'hold', label: 'Hold the rate',
    is: 'A deliberate decision, recorded, so the question is not asked again next month as though nobody had thought about it.',
  },
  {
    key: 'test', label: 'Test a new rate for 30 days',
    is: 'Quote at the new rate for a month and see what happens to the win rate. A rate change is reversible; a guess about one is not.',
  },
];

/** How long a test runs before it means anything. */
export const TEST_DAYS = 30;

export interface RateTest {
  fromCents: number;
  toCents: number;
  startedAt: string;
  /** Quotes decided since it started. */
  won: number;
  lost: number;
}

export function testReading(test: RateTest, now: Date = new Date()): string {
  const started = Date.parse(test.startedAt);
  const days = Number.isFinite(started) ? Math.floor((now.getTime() - started) / 86_400_000) : 0;
  const decided = test.won + test.lost;

  if (days < TEST_DAYS) {
    return decided === 0
      ? `Testing ${money(test.toCents)}, day ${days} of ${TEST_DAYS}. Nothing decided yet.`
      : `Testing ${money(test.toCents)}, day ${days} of ${TEST_DAYS}. ${test.won} won, ${test.lost} lost so far — too early to read.`;
  }
  if (decided < ENOUGH_QUOTES) {
    /*
      Thirty days that decided four quotes proves nothing, and saying otherwise is how a business
      changes its rate on noise. The honest answer is to keep going.
    */
    return `${TEST_DAYS} days at ${money(test.toCents)} and only ${decided} ${decided === 1 ? 'quote' : 'quotes'} decided. Not enough to tell you anything — worth running it longer.`;
  }
  const pct = Math.round((test.won / decided) * 100);
  return `${TEST_DAYS} days at ${money(test.toCents)}: ${pct}% of ${decided} quotes won. That is the number to decide on.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Winning the wrong work
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ByType {
  jobType: string;
  won: number;
  lost: number;
  /** Average margin on the ones won, as a percentage. Null when none are costed. */
  marginPct: number | null;
}

export type TypeFlag = 'too_cheap' | 'too_dear' | 'low_margin_only' | 'losing_this_one' | null;

export interface TypeReading {
  row: ByType;
  flag: TypeFlag;
  says: string | null;
}

/** Margin below this, on work you win nearly all of, is work not worth winning. */
export const THIN_MARGIN = 15;

/**
 * What the win rate says about one kind of job.
 *
 * Per type, because a business's overall win rate hides the thing that matters: winning every
 * switchboard at a good margin and losing every solar job is a completely different business from
 * one that wins half of each, and the two have the same headline number.
 */
export function readType(row: ByType, overall: number | null): TypeReading {
  const decided = row.won + row.lost;
  if (decided < ENOUGH_QUOTES) return { row, flag: null, says: null };
  const rate = row.won / decided;

  if (rate >= TOO_MANY && row.marginPct !== null && row.marginPct < THIN_MARGIN) {
    return {
      row, flag: 'low_margin_only',
      says: `You win ${Math.round(rate * 100)}% of ${row.jobType} and make ${row.marginPct.toFixed(0)}% on it. That is a lot of work for very little, and it is crowding out the jobs that pay.`,
    };
  }
  if (rate >= TOO_MANY) {
    return { row, flag: 'too_cheap', says: `You win ${Math.round(rate * 100)}% of ${row.jobType}. Worth testing a higher price on this one specifically.` };
  }
  if (rate <= TOO_FEW) {
    /* Against the business's own average, because "low" only means anything relative to the rest. */
    const worse = overall !== null && rate < overall - 0.2;
    return {
      row, flag: worse ? 'losing_this_one' : 'too_dear',
      says: worse
        ? `You win ${Math.round(rate * 100)}% of ${row.jobType} against ${Math.round(overall! * 100)}% everywhere else. Something about how this one is priced or costed is different.`
        : `You win ${Math.round(rate * 100)}% of ${row.jobType}. Either the price or the costing needs a look.`,
    };
  }
  return { row, flag: null, says: null };
}

export const flagged = (rows: readonly ByType[], overall: number | null): TypeReading[] =>
  rows.map(r => readType(r, overall)).filter(r => r.flag !== null);

/* ─────────────────────────────────────────────────────────────────────────────
 * Every lead priced before anybody asks
 * ───────────────────────────────────────────────────────────────────────────── */

/** How many past jobs of a type make a price worth trusting. */
export const PRICE_FROM = 50;

export interface DraftPrice {
  /** What SPEC would quote, in cents. Null when it has nothing to price from. */
  cents: number | null;
  /** How the number was arrived at — never a black box. */
  from: string;
  /** How many past jobs it is built on. */
  jobs: number;
  /** Whether an estimator should look harder than usual. */
  thin: boolean;
}

/**
 * Price a lead in the background, from pre-builds and the last jobs of its type.
 *
 * The estimator checks and sends rather than starts from nothing. What matters is that the working
 * is shown: a price with "from 38 similar jobs, median hours 6.5" beside it is one an estimator can
 * disagree with usefully, and a bare number is one they either trust blindly or redo entirely.
 */
export function draftPrice(input: {
  jobType: string;
  /** Hours from past jobs of this type, most recent first. */
  pastHours: readonly number[];
  hourlyCents: number | null;
  materialsCents: number;
  /** A pre-build that covers this work, if there is one. */
  prebuild: { name: string; cents: number } | null;
}): DraftPrice {
  if (input.prebuild) {
    return {
      cents: input.prebuild.cents,
      from: `the “${input.prebuild.name}” pre-build`,
      jobs: 0,
      thin: false,
    };
  }
  if (input.hourlyCents === null || input.pastHours.length === 0) {
    return {
      cents: null,
      from: input.hourlyCents === null
        ? 'nothing — no hourly rate is set'
        : `nothing — no past ${input.jobType} jobs to price from`,
      jobs: input.pastHours.length,
      thin: true,
    };
  }

  const recent = input.pastHours.slice(0, PRICE_FROM);
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  /* Median, not mean: one shutdown that ran three days would drag every future quote with it. */
  const hours = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    cents: Math.round(hours * input.hourlyCents) + input.materialsCents,
    from: `${recent.length} past ${input.jobType} ${recent.length === 1 ? 'job' : 'jobs'}, median ${hours} hours`,
    jobs: recent.length,
    thin: recent.length < ENOUGH_QUOTES,
  };
}

export function draftLine(d: DraftPrice): string {
  if (d.cents === null) return `SPEC could not price this one: ${d.from}.`;
  const price = `$${Math.round(d.cents / 100).toLocaleString('en-AU')}`;
  return d.thin
    ? `${price}, from ${d.from}. Thin history — worth pricing this one properly.`
    : `${price}, from ${d.from}. Check it and send it.`;
}

export const ESTIMATOR_CHECKS_AND_SENDS =
  'Every new lead is priced in the background before anybody asks. The estimator checks it and sends it — which is a different job from pricing it from scratch, and it is the difference between quoting today and quoting on Thursday.';
