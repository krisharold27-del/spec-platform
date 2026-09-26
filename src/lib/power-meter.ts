import type { Pillar, Answer } from './scoring';
import { sourceFor, type Choices } from './coverage';

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
 * ── Unmeasured counts against the score — changed 22 September ─────────────────────────────────
 *
 * Kris, 22 September: *"for gm power meter if something hasn't been done or measured it is a 0 -
 * then brings down the score - until a score is entered or met"*.
 *
 * This reverses what the file said until today: a slot with no measure used to be left out of both
 * sides of the fraction, the same way `NA` is excluded from a pillar, with a floor below which the
 * meter refused to show a number at all. That reasoning was sound for the CORE scoring SPEC runs on
 * — pillar%, role%, team%, the numbers behind somebody's incentive — and stays exactly as it was
 * there (`lib/scoring`, and rule 9 in CLAUDE.md: pending is never red). Kris scoped this change to
 * the power meter alone, and confirmed it explicitly when asked: not a change to how anybody's
 * incentive is calculated.
 *
 * The meter is a different kind of number — a glance at the whole business for a GM and a board,
 * not a pay calculation for one person — and here the business case runs the other way: a business
 * that has only set up two of the twenty-five measures should NOT read as strong on the eighteen it
 * has not gotten to yet. Scored out of the full hundred, always, every slot with nothing behind it
 * costs exactly what it would cost if it had been marked and missed.
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
  /**
   * Where in SPEC this measure is recorded — named on every row of the breakdown.
   *
   * `SPEC My Page.dc.html`, 23 September: the breakdown names the source of every KPI, and all five
   * heavy hitters come from SPEC's own records (Safety, Jobs, People). A connected system is named
   * by its category, never by a vendor — CLAUDE.md's never list.
   */
  source: string;
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
    id: 'safety_incident', name: 'Safety incidents', pillar: 'safety', weight: 'heavy', source: 'SPEC Safety · incident register',
    matches: /\b(safety incident|incident|injur|lti|recordable|near miss.*incident)/i,
  },
  {
    id: 'workers_comp', name: "Workers' comp claims", pillar: 'safety', weight: 'heavy', source: 'SPEC Safety · workers’ comp',
    matches: /\b(workers'? ?comp|workcover|compensation claim)/i,
  },
  {
    id: 'gross_profit', name: 'Gross profit margin', pillar: 'earnings', weight: 'heavy', source: 'SPEC Jobs · job costing',
    matches: /\b(gross profit|gross margin|\bgp ?%|\bgp margin)/i,
  },
  {
    id: 'contract_breach', name: 'Contractual breach', pillar: 'compliance', weight: 'heavy', source: 'SPEC Jobs · variations, claims and service contracts',
    matches: /\b(contract(ual)? breach|breach of contract|contract compliance|contractual (work )?obligation)/i,
  },
  {
    id: 'turnover', name: 'Negative staff turnover', pillar: 'people', weight: 'heavy', source: 'SPEC People · exits and exit reasons',
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
  { id: 'trifr', name: 'TRIFR', pillar: 'safety', weight: 'shared', source: 'SPEC Safety + Jobs timesheets', matches: /\btrifr\b|total recordable/i },
  { id: 'lti', name: 'Lost time injuries', pillar: 'safety', weight: 'shared', source: 'SPEC Safety', matches: /\blost time\b|\blti\b/i },
  { id: 'near_miss', name: 'Near-miss reporting rate', pillar: 'safety', weight: 'shared', source: 'SPEC Safety', matches: /near[- ]?miss/i },
  { id: 'safety_actions', name: 'Safety actions closed on time', pillar: 'safety', weight: 'shared', source: 'SPEC Safety', matches: /safety action|hazard.*clos|toolbox|inspection/i },

  { id: 'absenteeism', name: 'Absenteeism', pillar: 'people', weight: 'shared', source: 'SPEC People · leave', matches: /absentee|sick leave|unplanned leave/i },
  { id: 'training_done', name: 'Training completion', pillar: 'people', weight: 'shared', source: 'SPEC Training', matches: /training (completion|complete|done)|\btrained\b|inducti|competenc/i },
  { id: 'engagement', name: 'Engagement / satisfaction', pillar: 'people', weight: 'shared', source: 'SPEC pulse', matches: /engagement|satisfaction|one[- ]to[- ]one|1:1/i },
  { id: 'dev_plans', name: 'Managers with a dev plan', pillar: 'people', weight: 'shared', source: 'SPEC Org chart', matches: /development (plan|pathway)|dev plan|succession/i },

  { id: 'budget_miss', name: 'Budget misses', pillar: 'earnings', weight: 'shared', source: 'your accounting system', matches: /budget miss|over budget|budget variance/i },
  { id: 'revenue_budget', name: 'Revenue vs budget', pillar: 'earnings', weight: 'shared', source: 'your accounting system + SPEC Jobs', matches: /revenue (vs|against) budget|sales (vs|against) budget|revenue (at or )?(above|at) target/i },
  { id: 'net_margin', name: 'Net profit margin', pillar: 'earnings', weight: 'shared', source: 'your accounting system', matches: /net (profit|margin)|\bnpat\b|bottom line/i },
  { id: 'cash_flow', name: 'Cash flow', pillar: 'earnings', weight: 'shared', source: 'your accounting system', matches: /cash ?flow|cash at bank|liquidity/i },
  { id: 'revenue_growth', name: 'Revenue growth rate', pillar: 'earnings', weight: 'shared', source: 'your accounting system', matches: /revenue growth|sales growth|growth rate/i },
  { id: 'debtor_days', name: 'Debtor days', pillar: 'earnings', weight: 'shared', source: 'SPEC Jobs · invoices', matches: /debtor|receivab|days sales outstanding|\bdso\b|overdue invoice|\b90 days\b/i },
  { id: 'productivity', name: 'Productivity (revenue per work hour)', pillar: 'earnings', weight: 'shared', source: 'SPEC Jobs · revenue ÷ timesheet hours', matches: /productivity|revenue per|per (work )?hour|utilisation|utilization|billable/i },

  { id: 'regulatory', name: 'Regulatory breaches', pillar: 'compliance', weight: 'shared', source: 'SPEC Safety + People', matches: /regulator|notifiable|infringement|prosecut|\bbreaches\b/i },
  { id: 'audit', name: 'Audit pass rate', pillar: 'compliance', weight: 'shared', source: 'SPEC Safety · inspections', matches: /audit/i },
  { id: 'corrective', name: 'Corrective actions closed on time', pillar: 'compliance', weight: 'shared', source: 'SPEC Safety · actions', matches: /corrective action|non[- ]?conformance|\bncr\b/i },
  { id: 'licensing', name: 'Licensing currency', pillar: 'compliance', weight: 'shared', source: 'SPEC Safety · licences', matches: /licen[cs]|ticket|accredit|certificat|registration current/i },

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
  { id: 'snap_score', name: 'Problems closed out (Snap Score)', pillar: 'compliance', weight: 'shared', source: 'SPEC improvement register', matches: NEVER_MATCHES },
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
 * Where a slot's number is recorded, said the way the breakdown says it: "from SPEC Safety ·
 * incident register". Every heavy hitter names one of SPEC's own records.
 */
export const sourceLine = (slot: Slot): string => `from ${slot.source}`;

/**
 * The reading with each slot's source said the way THIS business runs it — "from your safety
 * system" once it has chosen its own on Coverage. The framework itself is never edited; each slot
 * is copied with its label changed. See `sourceFor` in lib/coverage.
 */
export function withSources(reading: PowerReading, choices: Choices): PowerReading {
  const relabel = (r: SlotReading): SlotReading => {
    const source = sourceFor(r.slot.id, r.slot.source, choices);
    return source === r.slot.source ? r : { ...r, slot: { ...r.slot, source } };
  };
  return { ...reading, heavy: reading.heavy.map(relabel), shared: reading.shared.map(relabel) };
}

/** True when a slot is read from SPEC's own records rather than a connected system. */
export const fromSpec = (slot: Slot): boolean => slot.source.startsWith('SPEC ');

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

/** The full framework, in points. Fixed at 100 — five heavy hitters at 15, twenty sharing 25. */
export const TOTAL_POINTS = HEAVY_SLOTS * HEAVY_POINTS + SHARED_POINTS;

export type Band = 'green' | 'amber' | 'red' | 'unknown';

export interface PowerReading {
  /**
   * 0–100, out of the full framework. Never null: a slot with nothing behind it costs its points
   * the same as a slot that was marked and missed — see the note on this file, 22 September.
   */
  score: number;
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
  // Kept for a defensive null (bandOf still accepts one) even though powerReading never produces
  // it any more — a type this file's own past self already got right once is worth leaving alone.
  unknown: 'Not enough is being measured yet to put a number on it',
};

/**
 * The reading.
 *
 * Scored **out of the full hundred, always** — see the note at the top of this file, 22 September.
 * A slot with nothing behind it costs its points exactly as a slot that was marked and missed
 * would; there is no floor and no refusal, because "0 until it is entered or met" is the point.
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

  // Not measured and not met earn nothing, out of the fixed total — never out of what happens to
  // be measured. That fixed denominator is the whole change: it is how "not done yet" costs.
  const earned = heavyMet * HEAVY_POINTS + (SHARED_POINTS * sharedMet) / SHARED_SLOTS;
  const score = Math.round((earned / TOTAL_POINTS) * 100);
  const band = bandOf(score);

  /*
    The loudest thing that went wrong, and only ever a heavy hitter — but only when one was
    actually MARKED not met. An unmeasured heavy hitter costs the same fifteen points, and it gets
    its own row in the breakdown, but "cause" is reserved for a KPI somebody entered and missed; an
    unmeasured one is a gap to fill in, not a figure to argue with.
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
 * What one slot is worth on the meter, in the points the score is out of.
 *
 * Here rather than wherever a lever happens to be priced, because it is the same arithmetic
 * `powerReading` uses just above: a heavy hitter carries its fifteen outright, and a shared slot
 * carries an equal share of the twenty-five. A lever that worked out its own number would sooner or
 * later promise a movement the meter does not make — and the first time the meter fails to move by
 * what the lever said, it is the meter that stops being believed.
 *
 * Rounded, because a lever offering "1.3 points" is arithmetic showing through the floorboards.
 */
export const pointsFor = (weight: Weight): number =>
  Math.round(weight === 'heavy' ? HEAVY_POINTS : SHARED_POINTS / SHARED_SLOTS);

/** What the ring draws — the design's dasharray, kept out of the page. */
export const ringOffset = (score: number | null, circumference = 264): number =>
  (score === null ? circumference : Math.max(0, circumference - (circumference * score) / 100));

/**
 * The sentence beside the number saying how much of the framework SPEC can see, and that the rest
 * counts as zero rather than being left out.
 *
 * Always shown, never only when it is low. A coverage note that appears when things are bad is a
 * disclaimer; one that is always there is a fact about the reading.
 */
export function coverageLine(reading: PowerReading): string {
  if (reading.measured === 0) {
    return `Nothing is measured yet, so every one of the ${reading.total} counts as not yet met. `
      + 'Set KPIs against the roles and this fills in.';
  }
  if (reading.measured < reading.total) {
    return `Read from ${reading.measured} of the ${reading.total} — the other `
      + `${reading.total - reading.measured} count as not yet met until a KPI is set and marked.`;
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
