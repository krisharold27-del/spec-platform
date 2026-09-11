/**
 * The weekly senior meeting — pure functions, no I/O.
 *
 * Twenty minutes, three items, written down. The agenda is not typed up by whoever remembers to do
 * it; it is produced from the month as it actually stands, before the meeting rather than after.
 * That is the whole point of the rhythm: meetings that go nowhere, decisions nobody remembers, and
 * nothing linking the talk to the numbers are three separate failures, and each one is fixed by
 * writing the thing down against the number it belongs to.
 *
 * Three is a deliberate ceiling. A meeting with eleven items has no agenda, it has a list.
 */
import type { Pillar, RoleScore, Score } from './scoring';
import { PILLARS } from './scoring';
import type { ScorecardRow } from './queries';

/** Why an item earned its place. Ordered: this is also the priority. */
export type AgendaReason = 'worst_moving' | 'overdue' | 'unexplained' | 'vacancy' | 'gate';

export interface AgendaItem {
  id: string;
  pillar: Pillar | null;
  title: string;
  /** The standing, in the words a manager would use: "Worst moving number", "Overdue 4 days". */
  state: string;
  reason: AgendaReason;
  /** Whose number it is. A vacant role has nobody, which is itself the point. */
  owner: string | null;
  detail: string;
  /** Where the work is done. */
  href: string;
  tone: 'red' | 'amber' | 'grey';
}

export interface MeetingRole {
  roleId: string;
  title: string;
  holder: string | null;
  score: RoleScore;
  /** The same role's score in the previous closed month, for "it moved down". */
  previous: RoleScore | null;
  rows: ScorecardRow[];
  scored: boolean;
}

export interface AgendaInputs {
  roles: MeetingRole[];
  /** Roles reporting in that nobody holds. */
  vacancies: { roleId: string; title: string }[];
  /** Modules overdue anywhere in the team, already resolved to a person. */
  overdueTraining: { person: string; title: string }[];
  /** A hard gate currently failing. Reported separately from every score, so it leads if present. */
  failingGates: { gate: string; reason: string | null }[];
  limit?: number;
}

const name = (p: Pillar) => p.charAt(0).toUpperCase() + p.slice(1);
const asPct = (v: Score) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** "Safety", "Safety and People", "Safety, People and Earnings" — written the way it is said. */
const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * This week's three.
 *
 * Ordered by what it costs to leave alone rather than by pillar: a failing hard gate first, then
 * the number that moved the wrong way, then work that is simply late, then a miss nobody has
 * explained, then a vacancy. Everything below the cut is still true — it is just not what twenty
 * minutes is for.
 */
export function agendaFor(input: AgendaInputs): AgendaItem[] {
  const items: AgendaItem[] = [];
  const limit = input.limit ?? 3;

  for (const g of input.failingGates) {
    items.push({
      id: `gate:${g.gate}`,
      pillar: g.gate === 'zero_harm' ? 'safety' : 'compliance',
      title: `${g.gate === 'zero_harm' ? 'Zero Harm' : 'Clear to Work'} is failing`,
      state: 'Hard gate',
      reason: 'gate',
      owner: null,
      detail: `${g.reason ?? 'Nothing has been written against it.'} A gate is pass or fail and is reported to the board separately from every score, so it is not offset by a good month anywhere else.`,
      href: '/',
      tone: 'red',
    });
  }

  // The worst pillar that also moved down. A number that is low and falling is a different
  // conversation from one that is low and recovering, and only one of them needs the room.
  const moved: { role: MeetingRole; pillar: Pillar; now: number; before: number }[] = [];
  for (const role of input.roles) {
    if (!role.scored || !role.previous) continue;
    for (const p of PILLARS) {
      const now = role.score.pillars[p];
      const before = role.previous.pillars[p];
      if (now === null || before === null || now >= before || now >= 0.9) continue;
      moved.push({ role, pillar: p, now, before });
    }
  }
  moved.sort((a, b) => (a.now - a.before) - (b.now - b.before));
  for (const m of moved) {
    items.push({
      id: `moved:${m.role.roleId}:${m.pillar}`,
      pillar: m.pillar,
      title: `${m.role.title} ${name(m.pillar)} at ${asPct(m.now)}`,
      state: 'Worst moving number',
      reason: 'worst_moving',
      owner: m.role.holder,
      detail: `Down from ${asPct(m.before)} last month. ${pillarDetail(m.role, m.pillar)}`,
      href: `/scorecard/${m.role.roleId}`,
      tone: m.now < 0.75 ? 'red' : 'amber',
    });
  }

  for (const t of input.overdueTraining) {
    items.push({
      id: `training:${t.person}:${t.title}`,
      pillar: 'compliance',
      title: `${t.title} is overdue`,
      state: 'Overdue',
      reason: 'overdue',
      owner: t.person,
      detail: 'Overdue training reaches the board pack whatever the scores say, so it is named here rather than found at month end.',
      href: '/training',
      tone: 'amber',
    });
  }

  // A miss nobody has written against is the one thing the board pack cannot explain.
  for (const role of input.roles) {
    for (const r of role.rows.filter(r => r.answer === 'N' && !r.note)) {
      items.push({
        id: `unexplained:${r.criterionId}`,
        pillar: r.pillar,
        title: `${r.text} missed, with nothing written against it`,
        state: 'Unexplained',
        reason: 'unexplained',
        owner: role.holder,
        detail: `${role.title} missed this and no note has been added. It reaches the board pack as a miss with no reason, which is worse than the miss.`,
        href: `/scorecard/${role.roleId}`,
        tone: 'amber',
      });
    }
  }

  for (const v of input.vacancies) {
    items.push({
      id: `vacancy:${v.roleId}`,
      pillar: 'people',
      title: `${v.title} is unfilled`,
      state: 'Vacant',
      reason: 'vacancy',
      owner: null,
      detail: 'A role with nobody in it keeps its KPIs and has no score, so it is left out of the roll-up rather than counted as a zero. One vacancy often produces several amber numbers around it.',
      href: '/org',
      tone: 'grey',
    });
  }

  return items.slice(0, limit);
}

function pillarDetail(role: MeetingRole, pillar: Pillar): string {
  const mine = role.rows.filter(r => r.pillar === pillar);
  const missed = mine.filter(r => r.answer === 'N');
  if (!missed.length) return 'Nothing under it is marked as missed, so the fall is in what has not been marked yet.';
  return `Behind it: ${missed.map(r => r.text).join('; ')}.`;
}

/** What is left over: everything the agenda could not fit, counted rather than dropped. */
export function belowTheCut(all: AgendaItem[], shown: AgendaItem[]): number {
  return Math.max(0, all.length - shown.length);
}

export interface Action {
  id: string;
  text: string;
  owner: string;
  due: string | null;
  done: boolean;
  pillar: Pillar | null;
}

export interface Decision {
  text: string;
  who: string;
  at: string;
}

export interface MeetingRow {
  id: string;
  date: string;
  minutes: string | null;
  actions: string | null;
  attendees: string | null;
  decisions: string | null;
}

/** JSON columns are written by this app, but a bad row must never take the page down with it. */
function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export const actionsOf = (m: MeetingRow): Action[] => parse<Action[]>(m.actions, []);
export const decisionsOf = (m: MeetingRow): Decision[] => parse<Decision[]>(m.decisions, []);
export const attendeesOf = (m: MeetingRow): string[] => parse<string[]>(m.attendees, []);

/**
 * Actions still open from previous weeks, newest meeting last.
 *
 * An action that has been carried three weeks is not an action, it is a decision nobody has made —
 * so the number of weeks it has been carried is part of the row rather than hidden in a date.
 */
export function carriedActions(previous: MeetingRow[]): (Action & { from: string; weeks: number })[] {
  const out: (Action & { from: string; weeks: number })[] = [];
  const newest = previous.length ? previous[previous.length - 1].date : null;
  for (const m of previous) {
    for (const a of actionsOf(m)) {
      if (a.done) continue;
      out.push({ ...a, from: m.date, weeks: newest ? weeksBetween(m.date, newest) + 1 : 1 });
    }
  }
  return out.sort((a, b) => b.weeks - a.weeks);
}

export function weeksBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / (7 * 24 * 60 * 60 * 1000)));
}

export interface HistoryWeek {
  weekOf: string;
  logged: boolean;
  note: string;
}

/**
 * The last `weeks` weeks, newest first, saying plainly which ones were not logged.
 *
 * A week with no meeting row is shown as not logged rather than left out. Nothing is silently
 * excluded — a gap in the rhythm is exactly the thing worth seeing.
 */
export function history(meetings: MeetingRow[], mondays: string[]): HistoryWeek[] {
  const byWeek = new Map(meetings.map(m => [mondayOf(m.date), m]));
  return mondays.map(weekOf => {
    const m = byWeek.get(weekOf);
    if (!m) return { weekOf, logged: false, note: 'Not logged. If it was held, it did not reach the record.' };
    const a = actionsOf(m);
    const d = decisionsOf(m);
    const parts = [
      `${a.length} ${a.length === 1 ? 'action' : 'actions'}`,
      `${d.length} ${d.length === 1 ? 'decision' : 'decisions'}`,
    ];
    const who = attendeesOf(m);
    if (who.length) parts.push(`${who.length} in the room`);
    return { weekOf, logged: true, note: parts.join(' · ') };
  });
}

/** Monday of the week containing this date, as YYYY-MM-DD. */
export function mondayOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The last `count` Mondays, oldest first, ending with the week containing `at`. */
export function recentMondays(at: Date, count: number): string[] {
  const monday = mondayOf(at.toISOString());
  const base = Date.parse(`${monday}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(base - (count - 1 - i) * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
}

/**
 * The read on the week — written from the data, not from anybody's memory of it.
 *
 * Three paragraphs, in the order a leader needs them: what moved, what it traces to, what has to be
 * decided today. Deterministic: the same month produces the same read, which is the only way it can
 * be trusted as a record.
 */
export function readOnTheWeek(input: AgendaInputs, team: RoleScore | null): { kicker: string; body: string }[] {
  const agenda = agendaFor({ ...input, limit: 99 });
  const behind = team
    ? PILLARS.filter(p => { const v = team.pillars[p]; return v !== null && v < 0.9; })
    : [];

  const moved = agenda.filter(a => a.reason === 'worst_moving');
  const whatMoved = moved.length
    ? `${list([...new Set(moved.map(m => m.pillar).filter(Boolean).map(p => name(p as Pillar)))])} fell against last month. ${
        behind.length ? `The roll-up has ${list(behind.map(name))} under 90%.` : 'The roll-up is still at the standard.'}`
    : behind.length
      ? `Nothing fell against last month, but ${list(behind.map(name))} ${behind.length === 1 ? 'is' : 'are'} still under 90%.`
      : 'Nothing fell against last month, and every pillar with a score is at the standard.';

  const vacancies = agenda.filter(a => a.reason === 'vacancy');
  const tracesTo = vacancies.length
    ? `${vacancies.length === 1 ? 'One unfilled role' : `${vacancies.length} unfilled roles`} — ${vacancies.map(v => v.title.replace(' is unfilled', '')).join(', ')}. A vacancy usually produces several amber numbers around it before it produces one of its own.`
    : agenda.length
      ? 'Every item above has a name against it, so none of it is waiting on a structural decision.'
      : 'Nothing is outstanding across the roles reporting in.';

  const decide = agenda.length
    ? `${agenda[0].title}. ${agenda[0].owner ? `${agenda[0].owner} owns it.` : 'Nobody owns it yet, which is the first thing to settle.'}`
    : 'Nothing needs a decision this week. Log the meeting and keep the rhythm.';

  return [
    { kicker: 'What moved', body: whatMoved },
    { kicker: 'What it traces to', body: tracesTo },
    { kicker: 'What to decide today', body: decide },
  ];
}
