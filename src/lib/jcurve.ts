/**
 * The shallow J curve — pure functions, no I/O.
 *
 * Every transformation dips before it climbs. The dip is normally deep because the early weeks go
 * on discovery: finding out what is actually wrong, chasing numbers, assembling the picture by
 * hand. Nothing improves during that, because nothing is visible yet.
 *
 * SPEC's claim is a SHALLOWER curve, and the mechanism is specific rather than magic: when the
 * business's own systems feed the KPIs, the picture exists the day they connect. Discovery
 * collapses, and the engagement starts at execution instead of at mystery-solving.
 *
 * That is a claim, so this file measures it rather than asserting it. Every number below is the
 * business's own elapsed time, from its own records. The only thing that is NOT its own data is the
 * benchmark, and that is stated as an arguable assumption in one place so it can be argued with —
 * the same way the labour calculator publishes its recovery rates.
 *
 * The honest consequence, stated rather than buried: **on Basic there is no collapse.** No
 * connectors means the picture is still assembled by hand. Basic is a complete way to run SPEC and
 * it is not a shallow J curve, and pretending otherwise would be the kind of overclaim that makes
 * every other number here worth less.
 */

export type PhaseKey = 'discovery' | 'linking' | 'first_close' | 'climbing';
export type PhaseState = 'done' | 'current' | 'waiting';

export interface Phase {
  key: PhaseKey;
  label: string;
  /** What is actually happening to the business during it. */
  what: string;
  state: PhaseState;
  /** Days this phase took, or has taken so far. Null when it has not started. */
  days: number | null;
  /** The date it ended, where that is recorded. */
  endedAt: string | null;
  /** What the page says about this phase, given where the business actually is. */
  note: string;
}

/**
 * The assumption the comparison rests on, in one place.
 *
 * Not measured, not the business's own data, and labelled as such wherever it is shown. A
 * transformation that builds its picture by hand spends most of a quarter doing it: interviews,
 * spreadsheet archaeology, and waiting on month end. Argue with the number — it is here to be
 * argued with — but the shape of the claim does not depend on its precision.
 */
export const HAND_BUILT_DISCOVERY_DAYS = 70;

export interface CurveInput {
  /** When the business started on SPEC. */
  startDate: string;
  /** When the chart first had roles on it. Null when it is not recorded. */
  chartDrawnAt: string | null;
  /** When a scored role first had its KPIs set. */
  kpisSetAt: string | null;
  /** When a system first fed a number on its own. Null on Basic, and null before anything connects. */
  firstFeedAt: string | null;
  /** When the first month closed. */
  firstLockedAt: string | null;
  /** Every closed month, oldest first, with the roll-up it closed on. */
  closedMonths: { period: string; overall: number | null }[];
  tier: 'basic' | 'advanced';
  threshold?: number;
}

const DAY = 86_400_000;

/** Whole days between two dates, or null when either is missing or unreadable. */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / DAY));
}

const iso = (d: Date) => d.toISOString();

/**
 * The four phases, with the business's own elapsed days against each.
 *
 * A phase whose end is not recorded reports null rather than a guess. An undated milestone is a gap
 * in the record, and filling it in with something plausible would quietly turn this page from a
 * measurement into a brochure.
 */
export function phases(input: CurveInput, at: Date = new Date()): Phase[] {
  const now = iso(at);
  const pictureAt = input.kpisSetAt;

  const discoveryDays = daysBetween(input.startDate, pictureAt ?? now);
  const linkingDays = pictureAt ? daysBetween(pictureAt, input.firstFeedAt ?? now) : null;
  const closeDays = daysBetween(pictureAt ?? input.startDate, input.firstLockedAt ?? now);
  const climbDays = input.firstLockedAt ? daysBetween(input.firstLockedAt, now) : null;

  return [
    {
      key: 'discovery',
      label: 'Discovery',
      what: 'Working out what is actually going on: the roles the business needs, and the two numbers per pillar each of them is measured on.',
      state: pictureAt ? 'done' : 'current',
      days: discoveryDays,
      endedAt: pictureAt,
      note: pictureAt
        ? `The picture existed after ${discoveryDays} ${discoveryDays === 1 ? 'day' : 'days'}.`
        : 'Still going. The dip lasts exactly as long as this does.',
    },
    {
      key: 'linking',
      label: 'Linking',
      what: 'The systems the business already runs start feeding the KPIs, so the numbers stop being assembled by hand.',
      state: input.firstFeedAt ? 'done' : pictureAt ? 'current' : 'waiting',
      days: linkingDays,
      endedAt: input.firstFeedAt,
      note: input.tier === 'basic'
        ? 'You are on Basic, so nothing feeds automatically. Every number is entered and confirmed by a named person — a complete way to run SPEC, and not a shallow J curve.'
        : input.firstFeedAt
          ? `Numbers started arriving on their own after ${linkingDays} ${linkingDays === 1 ? 'day' : 'days'}. This is the step that collapses discovery.`
          : 'Nothing is feeding yet. Until something does, the picture is still being assembled by hand.',
    },
    {
      key: 'first_close',
      label: 'First close',
      what: 'The first month marked, signed and locked. This is the bottom of the curve — the last point before anything can be compared to anything.',
      state: input.firstLockedAt ? 'done' : pictureAt ? 'current' : 'waiting',
      days: closeDays,
      endedAt: input.firstLockedAt,
      note: input.firstLockedAt
        ? `Closed ${closeDays} ${closeDays === 1 ? 'day' : 'days'} after the picture existed.`
        : 'No month has closed yet, so there is nothing to compare against. A first month is a baseline, not a result.',
    },
    {
      key: 'climbing',
      label: 'Climbing',
      what: 'Execution. Getting people to do their jobs properly, against numbers everybody can already see.',
      state: input.firstLockedAt ? 'current' : 'waiting',
      days: climbDays,
      endedAt: null,
      note: input.closedMonths.length > 1
        ? `${input.closedMonths.length} months closed. The climb is the only part that was ever about the work.`
        : 'Starts at the first close.',
    },
  ];
}

export interface Depth {
  /** Closed months spent below the standard before the first month at it. */
  monthsBelow: number;
  /** The lowest roll-up the business closed on, or null with nothing to read. */
  lowest: number | null;
  /** The month it reached the standard on every pillar, where it has. */
  recoveredAt: string | null;
  /** Whether the business is still in the dip. */
  inDip: boolean;
}

/**
 * How deep the dip actually went, in the only terms SPEC can honestly measure: closed months.
 *
 * Morale and productivity are what a J curve is really about, and SPEC does not measure either.
 * What it can say is how many months a business closed before it closed one at the standard — which
 * is the part a leader is actually waiting through.
 */
export function depth(closedMonths: CurveInput['closedMonths'], threshold = 0.9): Depth {
  const scored = closedMonths.filter(m => m.overall !== null);
  if (!scored.length) {
    return { monthsBelow: 0, lowest: null, recoveredAt: null, inDip: true };
  }
  const firstAt = scored.find(m => (m.overall as number) >= threshold) ?? null;
  const before = firstAt ? scored.slice(0, scored.indexOf(firstAt)) : scored;
  return {
    monthsBelow: before.length,
    lowest: Math.min(...scored.map(m => m.overall as number)),
    recoveredAt: firstAt ? firstAt.period : null,
    inDip: !firstAt,
  };
}

export interface Comparison {
  /** Days this business spent in discovery, or spent so far. */
  ours: number | null;
  /** The hand-built assumption, for contrast. Never presented as measurement. */
  handBuilt: number;
  /** Days saved, where discovery has finished. Null while it is still running. */
  saved: number | null;
  /** Whether the collapse actually happened here, which needs connectors. */
  collapsed: boolean;
  line: string;
}

/**
 * The claim, checked against this business.
 *
 * Deliberately capable of saying no. A business whose discovery ran longer than the hand-built
 * assumption is told so — a page that can only ever congratulate the product is not a measurement,
 * and nobody would be right to trust the rest of the numbers on it.
 */
export function comparison(input: CurveInput, at: Date = new Date()): Comparison {
  const all = phases(input, at);
  const discovery = all[0];
  const ours = discovery.days;
  const finished = discovery.state === 'done';
  const collapsed = input.tier === 'advanced' && !!input.firstFeedAt;

  if (!finished || ours === null) {
    return {
      ours,
      handBuilt: HAND_BUILT_DISCOVERY_DAYS,
      saved: null,
      collapsed,
      line: 'Discovery is still running here, so there is nothing to compare yet. The dip lasts exactly as long as it does.',
    };
  }

  const saved = HAND_BUILT_DISCOVERY_DAYS - ours;

  if (!collapsed) {
    return {
      ours, handBuilt: HAND_BUILT_DISCOVERY_DAYS, saved, collapsed,
      line: input.tier === 'basic'
        ? `Discovery took ${ours} days, assembled by hand. That is a real number and a real result, but it is not the collapse — nothing here is fed by a system.`
        : `Discovery took ${ours} days without anything feeding it yet. The collapse comes when a system does.`,
    };
  }

  if (saved <= 0) {
    return {
      ours, handBuilt: HAND_BUILT_DISCOVERY_DAYS, saved, collapsed,
      line: `Discovery took ${ours} days, longer than the ${HAND_BUILT_DISCOVERY_DAYS} a hand-built picture is assumed to take. The connectors were there; something else held this up, and it is worth knowing what.`,
    };
  }

  return {
    ours, handBuilt: HAND_BUILT_DISCOVERY_DAYS, saved, collapsed,
    line: `Discovery took ${ours} days rather than the ${HAND_BUILT_DISCOVERY_DAYS} a hand-built picture is assumed to take — ${saved} days that went into execution instead of into finding out.`,
  };
}

export interface CurvePoint {
  label: string;
  /** The roll-up that month closed on, or null before anything closed. */
  value: number | null;
  /** True for the months before the first close, which have no score by definition. */
  beforeMeasurement: boolean;
}

/**
 * The curve as it is drawn: the months before measurement, then the closed ones.
 *
 * The pre-measurement stretch is drawn as having NO value rather than a low one. That is the
 * honest shape — during discovery the business was not performing badly, it was invisible — and
 * drawing an invented dip would be making the product's case with a number nobody measured.
 */
export function points(input: CurveInput): CurvePoint[] {
  const before: CurvePoint[] = input.firstLockedAt
    ? [{ label: 'Before SPEC', value: null, beforeMeasurement: true }]
    : [{ label: 'Now', value: null, beforeMeasurement: true }];
  return [
    ...before,
    ...input.closedMonths.map(m => ({ label: m.period, value: m.overall, beforeMeasurement: false })),
  ];
}
