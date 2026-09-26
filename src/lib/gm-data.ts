/**
 * What the GM home reads: the meter's movement, the four questions, and the nine tiles.
 *
 * ── The movement, and why it is written down ─────────────────────────────────────────────────────
 *
 * The Power Meter is computed fresh from this month's marks, which means it can say where a
 * business is and never which way it is going. So the first read of each week writes the reading
 * down, and the week-on-week comparison is against what was written — not against a figure
 * recomputed for a past Monday, which would be SPEC attributing a number to a week nothing was
 * measured in.
 *
 * A business that nobody opened last week therefore has no last week, and the screen says so rather
 * than filling the gap. That is the right answer: "nothing to compare it to yet" is true, and a
 * fabricated baseline would make the first week's change meaningless in whichever direction it fell.
 *
 * ── The four questions ───────────────────────────────────────────────────────────────────────────
 *
 * Each is answered with the READ behind it — what SPEC actually saw — rather than with a metric. An
 * owner does not need to be told their TRIFR; they need to be told whether anybody got hurt. And an
 * area the business runs somewhere else answers `unknown`, which is honest: siteVIP cannot see
 * inside Simpro, and green would be a guess dressed as an assurance.
 */
import { and, desc, eq, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope } from './scope';
import { registerFor } from './register-data';
import { viewerPowerMeter } from './power-meter-data';
import {
  weekOnWeek, GM_QUESTIONS, leversToPull, awayWatch, totalSaved,
  type AnsweredQuestion, type Answer, type Lever, type WeekOnWeek, type AwayWatch, type Saved,
} from './gm-home';
import { AREAS, tiles, adoptionLine, runningHere, type AreaKey, type AreaSetting, type Needs, type Tile } from './adoption';
import { pointsFor, type PowerReading } from './power-meter';
import { levers as gmLevers } from './virtual-gm-overview';
import { seatsFor } from './ioc-data';
import { readLink, nextMove, type LinkReading } from './ioc';

/** The Monday of the week a date falls in, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  /* getUTCDay: 0 is Sunday, so Sunday belongs to the week that started six days earlier. */
  const back = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - back);
  return utc.toISOString().slice(0, 10);
}

/**
 * Write this week's reading if it is not already written, and hand back last week's.
 *
 * First-writer-wins within a week rather than last: the reading is "where the business stood when
 * somebody first looked", and letting every later visit overwrite it would mean a Friday afternoon
 * silently replacing Monday morning's number, which is the one the week is meant to be judged from.
 * The unique index on (tenant, week) is what makes that safe under two tabs at once.
 */
async function recordAndCompare(tenantId: string, reading: PowerReading, now: Date): Promise<WeekOnWeek> {
  const thisWeek = weekStartOf(now);

  await db.insert(schema.powerSnapshots).values({
    id: randomUUID(),
    tenantId,
    weekStart: thisWeek,
    score: reading.score,
    band: reading.band,
    takenAt: now.toISOString(),
  }).onConflictDoNothing();

  const [previous] = await db.select({ score: schema.powerSnapshots.score })
    .from(schema.powerSnapshots)
    .where(and(
      eq(schema.powerSnapshots.tenantId, tenantId),
      lt(schema.powerSnapshots.weekStart, thisWeek),
    ))
    .orderBy(desc(schema.powerSnapshots.weekStart))
    .limit(1);

  return weekOnWeek(reading.score, previous?.score ?? null);
}

/** What the business has said about each of the nine areas. */
async function settingsFor(tenantId: string): Promise<AreaSetting[]> {
  const rows = await db.select()
    .from(schema.adoptionAreas)
    .where(eq(schema.adoptionAreas.tenantId, tenantId));

  return rows
    .filter(r => AREAS.some(a => a.key === r.areaKey))
    .map(r => ({
      key: r.areaKey as AreaKey,
      runningHere: r.runningHere,
      elsewhere: r.elsewhere,
      connected: r.connected,
    }));
}

export interface GmView {
  reading: PowerReading;
  movement: WeekOnWeek;
  questions: AnsweredQuestion[];
  levers: Lever[];
  tiles: Tile[];
  adoption: { line: string; running: number; of: number };
  away: AwayWatch;
  saved: Saved;
}

export async function gmHomeFor(user: CurrentUser, now = new Date()): Promise<GmView> {
  const tenantId = user.tenantId;
  const scope = await getScope(user);
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);

  const teamNames: string[] = [];
  const register = await registerFor(tenantId, user.name, teamNames);
  const { reading } = await viewerPowerMeter({ tenantId, visible: scope.visible, register });

  const [movement, settings] = await Promise.all([
    recordAndCompare(tenantId, reading, now),
    settingsFor(tenantId),
  ]);

  const link = readLink(await seatsFor(user, scope));
  const needs = await whatNeedsYou(tenantId, link);
  const list = tiles(settings, needs);

  return {
    reading,
    movement,
    questions: answerFour(reading, list),
    levers: leversToPull(leversFrom(reading)),
    tiles: list,
    adoption: { line: adoptionLine(list), running: runningHere(list), of: AREAS.length },
    away: awayWatch({
      away: Boolean(tenant?.awayUntil),
      from: null,
      until: tenant?.awayUntil ?? null,
      deputyKey: tenant?.deputyKey ?? null,
      deputyName: tenant?.deputyName ?? null,
    }),
    /*
      Nothing is counted yet. An empty list is the honest starting point — `totalSaved` says "this
      fills in over your first month" rather than printing a zero, and a zero would read as SPEC
      having saved the business nothing rather than as SPEC not having counted.
    */
    saved: totalSaved([]),
  };
}

/**
 * The one line each tile carries.
 *
 * Read from the parts of the system that already know. Each is a count of things genuinely waiting
 * on a person — not a summary of the area, because the rule the design is built on is that an owner
 * only opens a tile when it says something needs them, and a tile that always says something is a
 * tile that stops being read.
 */
async function whatNeedsYou(tenantId: string, link: LinkReading | null): Promise<Needs[]> {
  const out: Needs[] = [];

  /* Safety: anything open and not closed out. */
  const openReports = await db.select({ id: schema.safetyReports.id })
    .from(schema.safetyReports)
    .where(and(eq(schema.safetyReports.tenantId, tenantId), eq(schema.safetyReports.state, 'open')))
    .limit(50);
  if (openReports.length > 0) {
    out.push({
      key: 'safety',
      line: `${openReports.length} safety ${openReports.length === 1 ? 'report is' : 'reports are'} still open.`,
      dot: 'red',
    });
  }

  /*
    People: read from the IOC rather than counted again here.

    LINK is the foundation — who does what, are they capable, is it working — and `readLink` already
    answers it for every seat. Asking the same question a second way here would give the owner two
    opinions about their own chart, and the day they disagreed the chart would be the one nobody
    trusted.
  */
  if (link && link.next !== null) {
    const short = link.seats - link.linked;
    out.push({
      key: 'people',
      line: `${short} of ${link.seats} ${short === 1 ? 'seat is' : 'seats are'} not linked. ${nextMove(link) ?? ''}`.trim(),
      dot: link.answered.who < link.seats ? 'red' : 'amber',
    });
  }

  /* Pay: a run whose checks have not all passed. Always on, so this tile always has an answer. */
  const runs = await db.select({ id: schema.payRuns.id, approvedAt: schema.payRuns.approvedAt })
    .from(schema.payRuns)
    .where(eq(schema.payRuns.tenantId, tenantId))
    .orderBy(desc(schema.payRuns.fromDate))
    .limit(1);
  if (runs[0] && !runs[0].approvedAt) {
    out.push({ key: 'pay', line: 'A pay run is waiting on its checks.', dot: 'amber' });
  }

  return out;
}

/**
 * The four questions, answered from what SPEC can see.
 *
 * An area running in another system answers `unknown` rather than `clear`, and that is the whole
 * honesty of this screen: siteVIP cannot see inside HubSpot, and a green tick it has not earned is
 * worse than an admission.
 */
function answerFour(reading: PowerReading, list: readonly Tile[]): AnsweredQuestion[] {
  const tileFor = (key: AreaKey) => list.find(t => t.area.key === key);

  const fromTile = (key: AreaKey, q: typeof GM_QUESTIONS[number], clear: string, to: string): AnsweredQuestion => {
    const tile = tileFor(key);
    if (!tile || !tile.runningHere) {
      return { q, answer: 'unknown' as Answer, read: tile?.line ?? 'Not running in siteVIP yet.', to: null };
    }
    if (tile.line === 'Nothing needs you') {
      return { q, answer: 'clear', read: clear, to: null };
    }
    return { q, answer: tile.dot === 'red' ? 'problem' : 'watch', read: tile.line, to };
  };

  const q = (key: string) => GM_QUESTIONS.find(x => x.key === key)!;

  return [
    fromTile('safety', q('safety'), 'Nothing open, and everybody went home.', '/safety'),
    fromTile('people', q('people'), 'Nobody is blocked and nobody is overdue.', '/people'),
    fromTile('money', q('earnings'), 'The shields are holding.', '/money'),
    /*
      "Do we do what we say?" is the one question that is not an area — it is whether the business
      keeps its promises, which is what the Power Meter's own reading is for.

      Answered from how much is MEASURED rather than from the score, because the score is never null:
      a slot with nothing behind it costs its points exactly as a slot that was marked and missed.
      That is right for the meter and wrong for this question — a business that has marked nothing
      would read as a business breaking every promise it made, when the truth is that nobody has
      said what the promises are.
    */
    reading.measured === 0
      ? { q: q('promises'), answer: 'unknown', read: 'Nothing has been marked yet, so there is nothing SPEC can hold the business to.', to: '/scoring' }
      : reading.band === 'green'
        ? { q: q('promises'), answer: 'clear', read: `The meter is at ${reading.score} — what the business said it would do, it is doing.`, to: null }
        : { q: q('promises'), answer: reading.band === 'red' ? 'problem' : 'watch', read: `The meter is at ${reading.score}. ${reading.verdict}`, to: '/virtual-gm#breakdown' },
  ];
}

/**
 * Levers, priced.
 *
 * The levers themselves come from `lib/virtual-gm-overview`, which already works out which measures
 * are marked not met and which workflow fixes each one. This adds the only thing Design 19 asks for
 * that it did not carry: what each is WORTH on the meter.
 *
 * The worth is the meter's own arithmetic rather than an estimate — `pointsFor` lives in
 * lib/power-meter beside the scoring it comes from, so a lever can never claim a number the meter
 * would not actually move by.
 */
function leversFrom(reading: PowerReading): Lever[] {
  return gmLevers(reading).map(l => ({
    key: l.slotId,
    what: l.fixes[0]?.name ?? `Fix ${l.name.toLowerCase()}`,
    because: l.cause,
    worth: pointsFor(l.weight),
    to: l.fixes[0]?.href ?? '/scoring',
  }));
}
