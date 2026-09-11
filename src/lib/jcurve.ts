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
  // Linking is measured from the day the business started, not from the day discovery finished.
  // Connecting a system is something you do from day one — in practice it usually finishes BEFORE
  // the picture exists, which is the whole mechanism. Measuring it from the end of discovery would
  // report that as nought days, turning the product's central claim into what looks like a gap in
  // the data.
  const linkingDays = daysBetween(input.startDate, input.firstFeedAt ?? now);
  const closeDays = daysBetween(pictureAt ?? input.startDate, input.firstLockedAt ?? now);
  /** Whether the systems were feeding before anybody drew the picture by hand. */
  const fedFirst = !!input.firstFeedAt && !!pictureAt && Date.parse(input.firstFeedAt) < Date.parse(pictureAt);
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
      // A phase that has not started reports nothing. Counting the days a business has been waiting
      // to connect something is a number, but it is not this phase's duration.
      days: input.firstFeedAt || pictureAt ? linkingDays : null,
      endedAt: input.firstFeedAt,
      note: input.tier === 'basic'
        ? 'You are on Basic, so nothing feeds automatically. Every number is entered and confirmed by a named person — a complete way to run SPEC, and not a shallow J curve.'
        : !input.firstFeedAt
          ? 'Nothing is feeding yet. Until something does, the picture is still being assembled by hand.'
          : fedFirst
            ? `Numbers started arriving on their own ${linkingDays} ${linkingDays === 1 ? 'day' : 'days'} in — before the picture was finished, which is what collapses discovery.`
            : `Numbers started arriving on their own ${linkingDays} ${linkingDays === 1 ? 'day' : 'days'} in. This is the step that collapses discovery.`,
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

/* ─────────────────────────────────────────────────────────────────────────────
 * What is holding the dip open.
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Discovery is the part of the dip SPEC shortens. It is not the only part that makes one deep.
 *
 * A dip stays deep when people stop believing the numbers, and two things do that reliably: targets
 * that were never set properly, and a chart that does not describe the business. A measure nobody
 * has ever met teaches everyone that the board's numbers are decoration. A measure nobody could
 * ever miss adds a green light to every month while nothing improves. A role with nobody in it is
 * a column of work that silently belongs to whoever is nearest.
 *
 * THE TONE RULE APPLIES HARDEST HERE. The brief this came from calls it change resistance and
 * negativity, and those are the right words for what it feels like from the outside. They are also
 * exactly what must never appear on the screen: naming somebody's psychology back at them is
 * forbidden in the rule book, and a leader told their people are negative will argue with the
 * claim instead of fixing the cause. So SPEC shows the CAUSE and never the diagnosis — these are
 * the four measures nobody has met since May, and these are the two roles with nobody in them. The
 * reader draws their own conclusion about morale, which is the only way that conclusion ever
 * survives contact with the person who has to act on it.
 *
 * Every item carries the one change that would move it, because a report of a miss that carries no
 * proposed fix is commentary.
 */
export type DragKey = 'never_met' | 'never_missed' | 'unproven' | 'vacant' | 'unmeasured_role';

export interface Drag {
  key: DragKey;
  count: number;
  what: string;
  /** Why it deepens the dip. Never a claim about anybody's attitude. */
  why: string;
  /** The one change that would move it. */
  move: string;
  /** The measures or roles behind the count, named rather than totalled. */
  items: string[];
}

export interface DragInput {
  measures: {
    label: string;
    /** Closed months this measure has been marked in. */
    months: number;
    /** Times it was met across those months. */
    met: number;
    /** True where the target sits outside what the record says the business can do. */
    outOfReach?: boolean;
    /** True where no target is agreed, or there is not enough history to judge one. */
    unproven?: boolean;
  }[];
  roles: { title: string; vacant: boolean; measures: number; scored: boolean }[];
  /** Closed months, which is what makes "never" mean anything. */
  closedMonths: number;
}

/**
 * How many closed months it takes before an unbroken run means something.
 *
 * Under three, "never met" is one bad quarter and "never missed" is a quiet start. Published here
 * so it can be argued with rather than buried in a filter.
 */
export const RUN_TO_MEAN_SOMETHING = 3;

export function drag(input: DragInput): Drag[] {
  const out: Drag[] = [];
  const enough = input.closedMonths >= RUN_TO_MEAN_SOMETHING;

  const neverMet = enough
    ? input.measures.filter(m => m.months >= RUN_TO_MEAN_SOMETHING && m.met === 0)
    : [];
  if (neverMet.length) {
    out.push({
      key: 'never_met', count: neverMet.length,
      what: `${neverMet.length} ${neverMet.length === 1 ? 'measure has' : 'measures have'} not been met once in ${input.closedMonths} closed months.`,
      why: 'A measure that is red every month stops being read. Once that happens the rest of the card is read the same way, and the score goes on working while nobody is using it.',
      move: 'Take each one back to the record. Either the target was set beyond what this business has ever done — in which case it is the target that is wrong — or nothing has been put behind it, and that is a different conversation with a different person.',
      items: neverMet.map(m => m.label),
    });
  }

  const neverMissed = enough
    ? input.measures.filter(m => m.months >= RUN_TO_MEAN_SOMETHING && m.met === m.months)
    : [];
  if (neverMissed.length) {
    out.push({
      key: 'never_missed', count: neverMissed.length,
      what: `${neverMissed.length} ${neverMissed.length === 1 ? 'measure has' : 'measures have'} been met every month without exception.`,
      why: 'A measure that cannot be missed adds a green light to every month while telling nobody anything. A card can read at the standard for a year on measures like these and the business will not have moved.',
      move: 'Check each against what the business actually runs at. A target at or below the rolling actual is met by carrying on exactly as before, and raising it is not a punishment — it is the difference between a scorecard and a report.',
      items: neverMissed.map(m => m.label),
    });
  }

  const outOfReach = input.measures.filter(m => m.outOfReach);
  if (outOfReach.length) {
    out.push({
      key: 'never_met', count: outOfReach.length,
      what: `${outOfReach.length} ${outOfReach.length === 1 ? 'target sits' : 'targets sit'} further above the record than this business has ever reached.`,
      why: 'A target nobody expects to meet is not a stretch, it is an announcement. People stop trying at announcements, and the measure keeps producing a red light that means nothing.',
      move: 'Reset each from the rolling actual. A target inside a fifth of what the business already does is one it can be held to.',
      items: outOfReach.map(m => m.label),
    });
  }

  const unproven = input.measures.filter(m => m.unproven);
  if (unproven.length) {
    out.push({
      key: 'unproven', count: unproven.length,
      what: `${unproven.length} ${unproven.length === 1 ? 'target has' : 'targets have'} nothing behind them yet.`,
      why: 'A target agreed in a room and never checked against the record is an opinion with a number on it. It is not wrong — it is unproven, and it will stay that way until the months accumulate.',
      move: 'Leave them and keep closing months. Six is enough to set them from the business’s own record instead of from a conversation.',
      items: unproven.map(m => m.label),
    });
  }

  const vacant = input.roles.filter(r => r.vacant);
  if (vacant.length) {
    out.push({
      key: 'vacant', count: vacant.length,
      what: `${vacant.length} ${vacant.length === 1 ? 'role has' : 'roles have'} nobody in them.`,
      why: 'The work does not stop when the seat is empty — it moves to whoever is nearest, usually without being discussed. That is the most common reason a person who was coping stops coping.',
      move: 'Either fill it, or move each measure onto a named role and accept that the work moved. Both are decisions; leaving it is the one that is not.',
      items: vacant.map(r => r.title),
    });
  }

  const unmeasured = input.roles.filter(r => r.scored && r.measures === 0);
  if (unmeasured.length) {
    out.push({
      key: 'unmeasured_role', count: unmeasured.length,
      what: `${unmeasured.length} scored ${unmeasured.length === 1 ? 'role has' : 'roles have'} no measures against them.`,
      why: 'A role on the chart with nothing underneath it is a job nobody can succeed or fail at. It reads as a working structure from above and as an unanswerable question from inside it.',
      move: 'Two measures per pillar is the starting point. A role that genuinely cannot be measured is a role that should not be scored, and saying so is a legitimate answer.',
      items: unmeasured.map(r => r.title),
    });
  }

  /**
   * Ordered by consequence, not by size.
   *
   * A measure nobody can meet and a seat nobody is in are where people have already stopped
   * believing the numbers; a target nobody has got round to setting is a young business. Sorting by
   * count would put the largest pile first and bury the sharpest finding underneath it, which is
   * the failure this whole section exists to prevent.
   */
  const ORDER: DragKey[] = ['never_met', 'vacant', 'never_missed', 'unmeasured_role', 'unproven'];
  return out.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

/** Named, not just counted — but a list of forty is a wall, so the tail is counted instead. */
export const NAMED_ITEMS = 6;

export function namedItems(items: string[]): { shown: string[]; more: number } {
  return { shown: items.slice(0, NAMED_ITEMS), more: Math.max(0, items.length - NAMED_ITEMS) };
}

/**
 * The one line about depth.
 *
 * Leads with the sharpest finding rather than a total. A total is technically true and useless —
 * "34 things" reads as an indictment of the business and tells nobody where to start, which is the
 * opposite of the point. No adjective about the business, no guess at why, and above all no verdict
 * on the people in it.
 */
export function dragLine(drags: Drag[], closedMonths: number): string {
  if (closedMonths < RUN_TO_MEAN_SOMETHING) {
    return `Under ${RUN_TO_MEAN_SOMETHING} closed months there is no run to read yet. Nothing here is a judgement on the business — there is simply not enough of its record to look at.`;
  }
  if (!drags.length) {
    return 'Nothing in the record is holding the dip open: every measure has been both met and missed, every scored role has somebody in it, and every role has something underneath it.';
  }
  const rest = drags.length - 1;
  return `${drags[0].what}${rest ? ` ${rest} other ${rest === 1 ? 'thing is' : 'things are'} listed below.` : ''} Each one is a decision somebody can make this week, and none of them is a judgement about anybody.`;
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
