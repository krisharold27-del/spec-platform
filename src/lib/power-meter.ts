import type { Pillar, Answer } from './scoring';

/**
 * The Virtual GM Power Meter — one reading of how the business is actually tracking.
 *
 * Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page - this is
 * the power meter gathering information through the spec system to give an instant percentage to
 * the business leaders and the board on how well the business is tracking"*.
 *
 * ── The framework ───────────────────────────────────────────────────────────────────────────────
 *
 * Twenty-five measures, and they are not equally important. Five are heavy hitters carrying 15
 * points each — the ones that end a business rather than dent it: somebody hurt, a workers' comp
 * claim, gross profit below the line, a contract breached, people leaving faster than they arrive.
 * The other twenty share the remaining 25 between them.
 *
 * Twenty-four of them are the business's own KPIs. The twenty-fifth is the **Snap Score** — how
 * much of what this business finds, it actually closes out — which SPEC computes from the
 * improvement register rather than reading off anybody's scorecard. Kris, 19 September: *"snap
 * score can be added to the Virtual GM power meter and be the 25th data point"*.
 *
 * That weighting IS the opinion the meter exists to express. A business with immaculate debtor days
 * and an injured apprentice is not doing well, and an average that says otherwise is worse than no
 * average at all.
 *
 * ── Nothing here is a second copy of a number ───────────────────────────────────────────────────
 *
 * The design ships this with mock data in a `GM_METERS` table. It is built instead out of what SPEC
 * already records: the business's own criteria, and how each was marked in the month being looked
 * at. Change a mark and the meter changes. There is nothing to refresh, nothing to keep in step,
 * and no version of this number that can disagree with the scorecard it came from — the same rule
 * `lib/mirror-kpis` is built to, and for the same reason.
 *
 * ── What it will NOT do, which is most of the work ──────────────────────────────────────────────
 *
 * A business's KPIs are its own words. "Gross profit margin at or above target", "GP%", "Margin
 * holding on solar" — the framework slot is the same one. So SPEC matches its own criteria to the
 * framework, and the match is SHOWN rather than hidden, because a mapping somebody can see is a
 * mapping somebody can correct.
 *
 * What it must never do is **count a slot it has no measure for**. A business with no TRIFR
 * criterion is not failing TRIFR — SPEC simply cannot see it. So an unmatched or unmarked slot is
 * excluded from both sides, exactly as `NA` is excluded from a pillar, and the reading says how
 * much of itself it could compute. Below a floor it refuses to put a number up at all.
 *
 * That refusal is the whole difference between this and a dashboard. Kris's brief: *"if it spins,
 * errors, or shows an unrecognised number, the anticipation inverts into broken trust — worse than
 * never promising it."* A confident 94% built from two KPIs out of twenty-four is an unrecognised
 * number waiting to be argued with.
 */

export type Weight = 'heavy' | 'shared';

export interface Slot {
  id: string;
  /** The framework's name for it, which is not any business's name for it. */
  name: string;
  pillar: Pillar;
  weight: Weight;
  /** How SPEC recognises one of a business's own criteria as this measure. */
  matches: RegExp;
}

/** Each of the five. Five times fifteen is seventy-five. */
export const HEAVY_POINTS = 15;
/** Shared equally by the twenty. */
export const SHARED_POINTS = 25;

/**
 * The five that end a business.
 *
 * Straight from the brief, and deliberately not negotiable per customer: the moment a business can
 * choose its own heavy hitters, every business chooses the ones it is already good at.
 */
const HEAVY: Slot[] = [
  {
    id: 'safety_incident', name: 'Safety incidents', pillar: 'safety', weight: 'heavy',
    matches: /\b(safety incident|incident|injur|lti|recordable|near miss.*incident)/i,
  },
  {
    id: 'workers_comp', name: "Workers' comp claims", pillar: 'safety', weight: 'heavy',
    matches: /\b(workers'? ?comp|workcover|compensation claim)/i,
  },
  {
    id: 'gross_profit', name: 'Gross profit margin', pillar: 'earnings', weight: 'heavy',
    matches: /\b(gross profit|gross margin|\bgp ?%|\bgp margin)/i,
  },
  {
    id: 'contract_breach', name: 'Contractual breach', pillar: 'compliance', weight: 'heavy',
    matches: /\b(contract(ual)? breach|breach of contract|contract compliance|contractual (work )?obligation)/i,
  },
  {
    id: 'turnover', name: 'Negative staff turnover', pillar: 'people', weight: 'heavy',
    matches: /\b(staff turnover|turnover rate|negative turnover|attrition|retention|regretted departure|nobody wants to leave)/i,
  },
];

/**
 * A pattern that cannot match anything, for the one slot that is computed rather than matched.
 *
 * `(?!)` is a negative lookahead on the empty string, which always fails. Written as a named
 * constant so it reads as a decision rather than as a typo somebody will helpfully "fix".
 */
const NEVER_MATCHES = /(?!)/;

/**
 * The twenty, in the framework's own order and grouped by pillar.
 *
 * "Negative turnover" among the five above and "absenteeism" here are different questions — one is
 * people leaving, the other is people not turning up — and a business that conflates them loses the
 * early warning.
 */
const SHARED: Slot[] = [
  { id: 'trifr', name: 'TRIFR', pillar: 'safety', weight: 'shared', matches: /\btrifr\b|total recordable/i },
  { id: 'lti', name: 'Lost time injuries', pillar: 'safety', weight: 'shared', matches: /\blost time\b|\blti\b/i },
  { id: 'near_miss', name: 'Near-miss reporting rate', pillar: 'safety', weight: 'shared', matches: /near[- ]?miss/i },
  { id: 'safety_actions', name: 'Safety actions closed on time', pillar: 'safety', weight: 'shared', matches: /safety action|hazard.*clos|toolbox|inspection/i },

  { id: 'absenteeism', name: 'Absenteeism', pillar: 'people', weight: 'shared', matches: /absentee|sick leave|unplanned leave/i },
  { id: 'training_done', name: 'Training completion', pillar: 'people', weight: 'shared', matches: /training (completion|complete|done)|\btrained\b|inducti|competenc/i },
  { id: 'engagement', name: 'Engagement / satisfaction', pillar: 'people', weight: 'shared', matches: /engagement|satisfaction|one[- ]to[- ]one|1:1/i },
  { id: 'dev_plans', name: 'Managers with a dev plan', pillar: 'people', weight: 'shared', matches: /development (plan|pathway)|dev plan|succession/i },

  { id: 'budget_miss', name: 'Budget misses', pillar: 'earnings', weight: 'shared', matches: /budget miss|over budget|budget variance/i },
  { id: 'revenue_budget', name: 'Revenue vs budget', pillar: 'earnings', weight: 'shared', matches: /revenue (vs|against) budget|sales (vs|against) budget|revenue (at or )?(above|at) target/i },
  { id: 'net_margin', name: 'Net profit margin', pillar: 'earnings', weight: 'shared', matches: /net (profit|margin)|\bnpat\b|bottom line/i },
  { id: 'cash_flow', name: 'Cash flow', pillar: 'earnings', weight: 'shared', matches: /cash ?flow|cash at bank|liquidity/i },
  { id: 'revenue_growth', name: 'Revenue growth rate', pillar: 'earnings', weight: 'shared', matches: /revenue growth|sales growth|growth rate/i },
  { id: 'debtor_days', name: 'Debtor days', pillar: 'earnings', weight: 'shared', matches: /debtor|receivab|days sales outstanding|\bdso\b|overdue invoice|\b90 days\b/i },
  { id: 'productivity', name: 'Productivity (revenue per work hour)', pillar: 'earnings', weight: 'shared', matches: /productivity|revenue per|per (work )?hour|utilisation|utilization|billable/i },

  { id: 'regulatory', name: 'Regulatory breaches', pillar: 'compliance', weight: 'shared', matches: /regulator|notifiable|infringement|prosecut|\bbreaches\b/i },
  { id: 'audit', name: 'Audit pass rate', pillar: 'compliance', weight: 'shared', matches: /audit/i },
  { id: 'corrective', name: 'Corrective actions closed on time', pillar: 'compliance', weight: 'shared', matches: /corrective action|non[- ]?conformance|\bncr\b/i },
  { id: 'licensing', name: 'Licensing currency', pillar: 'compliance', weight: 'shared', matches: /licen[cs]|ticket|accredit|certificat|registration current/i },

  /*
    ── The twenty-fifth, and the only one no business writes down ──────────────────────────────

    Kris, 19 September: *"snap score can be added to the Virtual GM power meter and be the 25th
    data point"*.

    Every other slot is matched against a KPI somebody wrote. This one is COMPUTED — from the
    improvement register, by `snapScore` in lib/register: how much of what the business finds it
    actually closes out, less a hard penalty for reopens and recurrences. "Not a count of problems
    — a read of the engine."

    It never matches text, and `NEVER_MATCHES` is how that is enforced rather than promised: a
    business with a KPI reading "snap score" must not be able to feed this slot by naming it.

    Filed under compliance because that is where "did the fix hold" already lives, next to
    corrective actions. It is the one slot that genuinely spans all four pillars, and compliance is
    the least wrong home rather than the right one.
  */
  { id: 'snap_score', name: 'Problems closed out (Snap Score)', pillar: 'compliance', weight: 'shared', matches: NEVER_MATCHES },
];

export const FRAMEWORK: Slot[] = [...HEAVY, ...SHARED];
export const HEAVY_SLOTS = HEAVY.length;   // 5
export const SHARED_SLOTS = SHARED.length; // 19

/** One of the business's own measures, as this month left it. */
export interface Measure {
  criterionId: string;
  /** The business's own words for it. */
  text: string;
  roleId: string;
  roleTitle: string;
  /** Y, N, or NA — the same three the pillar maths uses. `''` is a criterion never marked. */
  answer: Answer;
  result: string | null;
  target: string | null;
}

export type SlotState = 'met' | 'not_met' | 'not_measured';

export interface SlotReading {
  slot: Slot;
  /** The business's own KPIs that fed this slot. Shown, so a wrong match can be seen and argued. */
  from: Measure[];
  state: SlotState;
  /** Why it was missed, in the business's own figures. Null unless it was. */
  cause: string | null;
  /**
   * Where a COMPUTED slot came from, in place of `from`.
   *
   * Only the Snap Score has one: it is not matched to anybody's KPI, so there is nothing to list —
   * but a row with no provenance at all is the thing this file refuses to draw. See `readSnapSlot`.
   */
  note?: string;
}

/**
 * A KPI about producing the PAPERWORK, which is never a measure of the thing itself.
 *
 * Found on JBI's own seeded data the first time this was drawn: *"Weekly gross profit report
 * delivered on time with a proposed improvement"* was matched as the gross profit margin — a heavy
 * hitter worth fifteen points — because it contains the words "gross profit". It is a real and
 * useful KPI about a reporting habit, and it says nothing whatever about the margin.
 *
 * That is the exact failure this whole file is built to avoid, and it survived until a browser was
 * pointed at real data. Held apart here, once, rather than negated into twenty-four regexes.
 */
const ABOUT_THE_PAPERWORK = /\b(report|reporting|pack|minutes|agenda|dashboard|paperwork)\b[^.]*\b(deliver|submit|issue|circulat|on time|published|presented)/i;

/**
 * Which of the business's measures answer a framework slot.
 *
 * A criterion may answer more than one — "no lost time injuries" is both a safety incident measure
 * and the lost-time one — and that is correct rather than a bug: the framework asks two questions
 * and one KPI happens to answer both.
 */
export const measuresFor = (slot: Slot, measures: readonly Measure[]): Measure[] =>
  measures.filter(m => slot.matches.test(m.text) && !ABOUT_THE_PAPERWORK.test(m.text));

/**
 * The measures behind a slot, said once each.
 *
 * The same KPI usually sits on several roles — four supervisors all measured on "Zero incidents
 * (LTI / MTI)" — and listing it four times makes a row unreadable while saying nothing extra. The
 * count is the part worth keeping: it is how much of the business stands behind that slot.
 */
export const sourcesOf = (reading: SlotReading): { text: string; roles: number }[] => {
  const seen = new Map<string, number>();
  for (const m of reading.from) seen.set(m.text, (seen.get(m.text) ?? 0) + 1);
  return [...seen].map(([text, roles]) => ({ text, roles }));
};

/**
 * How a slot stands, given everything feeding it.
 *
 * **One miss is a miss.** If any measure behind a slot was marked Not met, the slot is not met,
 * even when three others were. Averaging them would let a business with four tidy safety measures
 * and one injury report a met safety slot, which is precisely the arithmetic that makes an
 * aggregate worth arguing with.
 *
 * NA — watch, pending, not tracked — is neither. It is the absence of an answer, and it leaves the
 * slot unmeasured rather than quietly counting as a pass.
 */
export function readSlot(slot: Slot, measures: readonly Measure[]): SlotReading {
  const from = measuresFor(slot, measures);
  const missed = from.find(m => m.answer === 'N');
  if (missed) return { slot, from, state: 'not_met', cause: gapOf(slot, missed) };
  const held = from.some(m => m.answer === 'Y');
  return { slot, from, state: held ? 'met' : 'not_measured', cause: null };
}

/**
 * What went wrong, in the business's own figures rather than in the framework's words.
 *
 * The middle case used to read *"missed against an agreed 0"*, which is not a sentence anybody
 * says. Plenty of real targets ARE zero — zero incidents, zero claims, zero negative turnover — so
 * that phrasing was going to be the common one rather than the edge case.
 */
function gapOf(slot: Slot, measure: Measure): string {
  if (measure.result && measure.target) return `${slot.name} — ${measure.result} against a target of ${measure.target}`;
  if (measure.target) return `${slot.name} — not met this month, against a target of ${measure.target}`;
  return `${slot.name} — marked not met this month`;
}

/**
 * The line at which "closing things out" counts as met.
 *
 * Seventy-five, which is the product's OWN green line for the Snap Score — the same number the
 * register's pill has always used. Taking a different one here would give a business two official
 * opinions about the same score, on two screens, and the argument would be about SPEC rather than
 * about the business.
 */
export const SNAP_MET_AT = 75;

/** The Snap Score, as `lib/register` computes it: null and `early` until there is enough to read. */
export interface SnapReading {
  pct: number | null;
  early: boolean;
}

/**
 * The twenty-fifth slot, which no business writes down.
 *
 * Three states like every other. `early` — fewer than three problems logged — is **not measured**
 * rather than a fail: three problems is not a pattern, and a business that has only just started
 * logging them has not failed at closing things out, it simply has nothing to close yet.
 */
export function readSnapSlot(snap: SnapReading | null | undefined): SlotReading {
  const slot = FRAMEWORK.find(s => s.id === 'snap_score')!;
  if (!snap || snap.early || snap.pct === null) {
    return {
      slot,
      from: [],
      state: 'not_measured',
      cause: null,
      note: 'from the improvement register — too few problems logged yet to read',
    };
  }
  const met = snap.pct >= SNAP_MET_AT;
  return {
    slot,
    from: [],
    state: met ? 'met' : 'not_met',
    cause: met ? null : `${slot.name} — Snap Score ${snap.pct}, against ${SNAP_MET_AT} for a business that closes things out`,
    note: `from the improvement register — Snap Score ${snap.pct}`,
  };
}

/**
 * How much of itself the meter has to see before it will put a number up.
 *
 * Six of twenty-four, and at least one of the five heavy hitters. Stated here rather than buried,
 * because it is a judgement and somebody should be able to argue with it.
 *
 * Without a floor, a business with one matched KPI that went well reads **100%** — a number that is
 * arithmetically true, completely wrong, and on the screen a board looks at. The heavy-hitter
 * requirement is the second half: seventy-five points of this reading live in those five, so a
 * meter built only from the other nineteen is measuring a quarter of itself and calling it the
 * business.
 */
export const ENOUGH_SLOTS = 6;

export type Band = 'green' | 'amber' | 'red' | 'unknown';

export interface PowerReading {
  /** 0–100 of what SPEC can actually see. Null when it can see too little to say anything. */
  score: number | null;
  band: Band;
  verdict: string;
  heavy: SlotReading[];
  shared: SlotReading[];
  /** Of the twenty-four, how many SPEC has a marked measure for. */
  measured: number;
  total: number;
  heavyMeasured: number;
  sharedMet: number;
  /** The heavy hitter that cost the most, said in the business's own figures. */
  cause: string | null;
}

/** Green from 85, amber from 60. The design's bands, and the words that go with them. */
export function bandOf(score: number | null): Band {
  if (score === null) return 'unknown';
  if (score >= 85) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

const VERDICT: Record<Band, string> = {
  green: 'Business is performing well',
  amber: 'Holding, with real gaps to close',
  red: 'Serious ground to make up',
  unknown: 'Not enough is being measured yet to put a number on it',
};

/**
 * The reading.
 *
 * Scored **out of what is measured**, never out of twenty-four. A slot SPEC has no measure for
 * leaves both sides of the fraction, so a business that measures six things well reads well and is
 * told plainly that it is a reading of six things.
 */
export function powerReading(measures: readonly Measure[], snap?: SnapReading | null): PowerReading {
  const heavy = HEAVY.map(s => readSlot(s, measures));
  /*
    Every shared slot is matched against the business's own KPIs except one. The Snap Score is
    computed from the improvement register, so it is read from that instead — and it is placed in
    the same list, in the same order, because on the screen it is simply the twentieth measure.
  */
  const shared = SHARED.map(s => (s.id === 'snap_score' ? readSnapSlot(snap) : readSlot(s, measures)));

  const heavyMeasured = heavy.filter(r => r.state !== 'not_measured').length;
  const heavyMet = heavy.filter(r => r.state === 'met').length;
  const sharedMeasured = shared.filter(r => r.state !== 'not_measured').length;
  const sharedMet = shared.filter(r => r.state === 'met').length;
  const measured = heavyMeasured + sharedMeasured;

  const available = heavyMeasured * HEAVY_POINTS + (SHARED_POINTS * sharedMeasured) / SHARED_SLOTS;
  const earned = heavyMet * HEAVY_POINTS + (SHARED_POINTS * sharedMet) / SHARED_SLOTS;

  const enough = measured >= ENOUGH_SLOTS && heavyMeasured > 0 && available > 0;
  const score = enough ? Math.round((earned / available) * 100) : null;
  const band = bandOf(score);

  /*
    The loudest thing that went wrong, and only ever a heavy hitter.

    Fifteen points is the largest single move this reading can make, so it is the sentence worth
    putting under the number. The other nineteen are a point and a third each — naming one of those
    as the cause would be true and useless.
  */
  const cause = heavy.find(r => r.state === 'not_met')?.cause ?? null;

  return {
    score, band, verdict: VERDICT[band],
    heavy, shared,
    measured, total: FRAMEWORK.length,
    heavyMeasured, sharedMet,
    cause,
  };
}

/**
 * What the ring draws — the design's dasharray, kept out of the page.
 *
 * An unknown reading draws no arc at all rather than an empty one. A ring stuck at zero and a ring
 * that has nothing to say look identical on a screen and mean opposite things.
 */
export const ringOffset = (score: number | null, circumference = 264): number =>
  (score === null ? circumference : Math.max(0, circumference - (circumference * score) / 100));

/**
 * The sentence beside the number saying how much of the framework SPEC can see.
 *
 * Always shown, never only when it is low. A coverage note that appears when things are bad is a
 * disclaimer; one that is always there is a fact about the reading.
 */
export function coverageLine(reading: PowerReading): string {
  if (reading.measured === 0) {
    return `SPEC has no measure yet for any of the ${reading.total}. Set KPIs against the roles and this fills in.`;
  }
  if (reading.score === null) {
    const short = reading.heavyMeasured === 0
      ? ' — and none of the five heavy hitters, which carry three quarters of the reading'
      : '';
    return `Reading ${reading.measured} of the ${reading.total}${short}. Not enough to put a number on it yet.`;
  }
  return `Read from ${reading.measured} of the ${reading.total} measures marked this month.`;
}

/**
 * Whose numbers this reading is of.
 *
 * The rule the whole product follows: you see your own and everything below you, never above and
 * never sideways. So a manager's meter is their branch and says so, and the top of the chart gets
 * the business. Nobody gets a reading of a part of the chart they cannot already see.
 */
export const scopeLabel = (topOfChart: boolean): string =>
  (topOfChart ? 'the whole business' : 'your reporting line');
