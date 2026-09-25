import { MARGIN_BENCHMARK } from './jobs';
import { dollars, pct, type Fact, type Missing, type Recommendation } from './recommends';

/**
 * Claude recommends — the labour rate.
 *
 * The question every trade business gets wrong the same way: the rate is set from what an hour
 * COSTS, and an hour paid is not an hour billed. Travel, the yard, quoting, the van — a crew billing
 * three hours in four makes every billable hour carry a third more cost than the rate assumed.
 *
 * So the arithmetic, all of it from the business's own rows:
 *
 *   what a billable hour really costs = cost per hour ÷ billable share
 *   the rate that covers it           = that ÷ (1 − the margin every quote is measured against)
 *
 * rounded up to the next five dollars. The margin is `MARGIN_BENCHMARK` from lib/jobs — the same 40%
 * every quote on /jobs is already held to, so the rate and the quote screen cannot disagree.
 *
 * ── What it will not do ─────────────────────────────────────────────────────────────────────────
 *
 * Guess. With no labour rate, or too few hours to know the billable share, it says exactly what is
 * missing. And it names no local market rate: SPEC holds no data on what other trades charge, so the
 * card says so rather than inventing a number that would look like evidence.
 */

export const TOPIC = 'labour_rate';

/** Forty hours in ninety days — one person-week. Fewer, and the billable share is an anecdote. */
export const MIN_MINUTES = 40 * 60;
export const WINDOW_DAYS = 90;

export interface LabourRateInput {
  /** The standard rate — the business's first, the one kits and job labour are costed at. */
  rate: { id: string; name: string; costCents: number; chargeCents: number } | null;
  /** Timesheet minutes in the last WINDOW_DAYS: all of them, and those on a customer's job. */
  minutes: { total: number; billable: number };
  /** Jobs with costs recorded this quarter: quoted value against labour plus materials. */
  jobs: readonly { valueCents: number; costCents: number }[];
  benchmark?: number;
}

/** Up to the next five dollars. A rate of $122.20 is a typo; $125 is a rate. */
export const roundUpToFive = (cents: number): number => Math.ceil(cents / 500) * 500;

const hours = (minutes: number): string => `${Math.round(minutes / 60).toLocaleString('en-AU')}`;

/** The rate the numbers call for, or null when they cannot call for one. */
export function coveringRate(costCents: number, billableShare: number, benchmark = MARGIN_BENCHMARK): number | null {
  if (!(costCents > 0) || !(billableShare > 0) || !(benchmark < 1)) return null;
  return roundUpToFive(costCents / billableShare / (1 - benchmark));
}

/** Value-weighted margin across costed jobs: Σ(value − cost) ÷ Σ value. Null with nothing costed. */
export function quarterMargin(jobs: LabourRateInput['jobs']): number | null {
  const costed = jobs.filter(j => j.valueCents > 0 && j.costCents > 0);
  const value = costed.reduce((n, j) => n + j.valueCents, 0);
  if (!value) return null;
  return (value - costed.reduce((n, j) => n + j.costCents, 0)) / value;
}

export function labourRateAdvice(input: LabourRateInput): Recommendation {
  const benchmark = input.benchmark ?? MARGIN_BENCHMARK;
  const { rate, minutes } = input;

  const missing: Missing[] = [];
  if (!rate) {
    missing.push({ what: 'A labour rate — what an hour costs you and what you charge for it', href: '/jobs?tab=catalogue' });
  } else if (!(rate.costCents > 0)) {
    missing.push({ what: `What an hour costs you on your ${rate.name} rate — it is set to $0`, href: '/jobs?tab=catalogue' });
  }
  if (minutes.total < MIN_MINUTES) {
    missing.push({
      what: `At least ${hours(MIN_MINUTES)} hours of timesheets in the last ${WINDOW_DAYS} days, to know how much of the day is billable (you have ${hours(minutes.total)})`,
      href: '/jobs?tab=time',
    });
  } else if (minutes.billable <= 0) {
    missing.push({ what: `Time on a customer’s job — none of the last ${WINDOW_DAYS} days’ ${hours(minutes.total)} hours were billable`, href: '/jobs?tab=time' });
  }

  const margin = quarterMargin(input.jobs);
  const costedJobs = input.jobs.filter(j => j.valueCents > 0 && j.costCents > 0).length;
  const quarterFact: Fact = margin === null
    ? { label: 'Your jobs this quarter', value: 'None costed yet', note: 'a job counts once labour or materials are recorded against it' }
    : { label: 'Your jobs this quarter', value: `${pct(margin)} average margin`, note: `across ${costedJobs} costed ${costedJobs === 1 ? 'job' : 'jobs'}, weighted by value` };
  const localFact: Fact = {
    label: 'What local trades charge',
    value: 'Not known to SPEC',
    note: 'SPEC holds no local rate data, so this uses your own numbers only',
  };

  if (missing.length || !rate) {
    return {
      kind: 'missing', topic: TOPIC,
      headline: 'Not enough yet to recommend a labour rate.',
      missing,
      facts: [quarterFact, localFact],
    };
  }

  const share = minutes.billable / minutes.total;
  const trueCost = Math.round(rate.costCents / share);
  const covering = coveringRate(rate.costCents, share, benchmark)!;
  const facts: Fact[] = [
    { label: 'What an hour costs you', value: `${dollars(rate.costCents)}/hr`, note: `your ${rate.name} labour rate` },
    { label: 'Billable share', value: pct(share), note: `${hours(minutes.billable)} of ${hours(minutes.total)} timesheet hours in the last ${WINDOW_DAYS} days were on a customer’s job` },
    { label: 'What a billable hour really costs', value: `${dollars(trueCost)}/hr`, note: `${dollars(rate.costCents)} ÷ ${pct(share)}` },
    { label: 'Margin every quote is measured against', value: pct(benchmark) },
    { label: 'You charge now', value: `${dollars(rate.chargeCents)}/hr` },
    quarterFact,
    localFact,
  ];

  if (rate.chargeCents >= covering) {
    return {
      kind: 'hold', topic: TOPIC,
      headline: `Your ${dollars(rate.chargeCents)}/hr covers what a billable hour really costs you.`,
      reason: `A billable hour costs you ${dollars(trueCost)} once the unbilled time is counted, and ${dollars(covering)}/hr would hold a ${pct(benchmark)} margin on it. You already charge more.`,
      facts,
    };
  }

  return {
    kind: 'recommend', topic: TOPIC,
    headline: `Set your ${rate.name} labour rate at ${dollars(covering)}/hr.`,
    reason: `An hour costs you ${dollars(rate.costCents)}, but only ${pct(share)} of paid hours are billed, so each billable hour really costs ${dollars(trueCost)}. At the ${pct(benchmark)} margin every quote is measured against, that needs ${dollars(covering)}/hr. You charge ${dollars(rate.chargeCents)}/hr.`,
    action: { type: 'set_labour_rate', rateId: rate.id, chargeCents: covering },
    yes: `Yes, set it at ${dollars(covering)}/hr`,
    facts,
  };
}
