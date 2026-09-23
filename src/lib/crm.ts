/**
 * The CRM — the arithmetic and the rules, and nothing else.
 *
 * Sales work before a job exists: a lead comes in, somebody calls, a site visit is booked, a quote
 * goes out, the price is argued about, and the deal is won or lost. A won deal becomes a job in the
 * Jobs pipeline, which is where the work itself is run. Every number the CRM screen shows is worked
 * out here from what the business recorded — the forecast is computed on every read and never
 * stored, so it cannot drift from the deals it summarises.
 *
 * Pure functions over plain values. Proven in tests/crm.test.ts.
 *
 * ── The lights ──────────────────────────────────────────────────────────────────────────────────
 *
 * Pending is never red. A deal nobody has touched for a while is "going quiet" — amber, a nudge, not
 * a failure. An activity past its due date is red, because it is a commitment somebody made and
 * missed. A deal with nothing scheduled is grey: nothing has been promised, so nothing has been
 * broken.
 */
import type { Light } from './jobs';

export { money, toCents } from './jobs';

/* ── Stages ────────────────────────────────────────────────────────────────────────────────────── */

export interface StageDef {
  id: string;
  name: string;
  /** Percent, 0–100 — how likely a deal at this stage is to be won. The business sets it. */
  probability: number;
  /** A deal untouched for this many days in this stage is flagged as going quiet. */
  rotDays: number;
  position: number;
}

/** Days without anything happening before a deal is flagged. Per stage; this is where it starts. */
export const DEFAULT_ROT_DAYS = 7;

/**
 * Where a trade business's pipeline starts. SPEC proposes; the business renames, re-weights and adds
 * to it. Probabilities are a starting point for the weighted forecast, not a claim about anybody's
 * close rate.
 */
export const DEFAULT_STAGES: readonly Omit<StageDef, 'id'>[] = [
  { name: 'Lead in', probability: 10, rotDays: DEFAULT_ROT_DAYS, position: 0 },
  { name: 'Contacted', probability: 20, rotDays: DEFAULT_ROT_DAYS, position: 1 },
  { name: 'Site visit booked', probability: 40, rotDays: DEFAULT_ROT_DAYS, position: 2 },
  { name: 'Quote sent', probability: 60, rotDays: DEFAULT_ROT_DAYS, position: 3 },
  { name: 'Negotiating', probability: 80, rotDays: DEFAULT_ROT_DAYS, position: 4 },
];

export const orderStages = <T extends { position: number }>(stages: readonly T[]): T[] =>
  [...stages].sort((a, b) => a.position - b.position);

/** A probability typed into a form: a whole percent from 0 to 100, or null. */
export function parseProbability(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').replace(/%/g, '').trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}

/** Days before a deal goes quiet: a whole number from 1 to 365, or null. */
export function parseRotDays(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 365 ? n : null;
}

/* ── Deals ─────────────────────────────────────────────────────────────────────────────────────── */

export type DealStatus = 'open' | 'won' | 'lost';

export interface DealLike {
  id: string;
  stageId: string;
  status: DealStatus | string;
  valueCents: number;
  /** When it was won or lost. */
  closedAt: string | null;
  createdAt: string;
}

/** The reasons a deal is lost, short enough to pick on a phone. "Other" asks for the words. */
export const LOST_REASONS = [
  'Price',
  'Went with someone else',
  'Not going ahead',
  'No reply',
  'Not work we do',
  'Other',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

/**
 * A reason for losing a deal, checked. The reason must be one of the list; "Other" needs a sentence,
 * because "other" on its own teaches the business nothing about why it lost.
 */
export function lostRefusal(reason: string, note: string): string | null {
  if (!(LOST_REASONS as readonly string[]).includes(reason)) return 'Pick why it was lost.';
  if (reason === 'Other' && !note.trim()) return 'Say in a few words why it was lost.';
  return null;
}

/** The chance a deal is won: its stage's while open, certain once won, nothing once lost. */
export function probabilityOf(deal: Pick<DealLike, 'status' | 'stageId'>, stages: readonly StageDef[]): number {
  if (deal.status === 'won') return 100;
  if (deal.status === 'lost') return 0;
  return stages.find(s => s.id === deal.stageId)?.probability ?? 0;
}

/** Value × probability, in whole cents, rounded once. */
export const weightedCents = (valueCents: number, probability: number): number =>
  Math.round((valueCents * Math.max(0, Math.min(100, probability))) / 100);

export interface StageTotal {
  stageId: string;
  count: number;
  valueCents: number;
  weightedCents: number;
}

/** Each column's count and value — open deals only; a won or lost deal has left the board. */
export function stageTotals(stages: readonly StageDef[], deals: readonly DealLike[]): StageTotal[] {
  return orderStages(stages).map(s => {
    const here = deals.filter(d => d.status === 'open' && d.stageId === s.id);
    const value = here.reduce((a, d) => a + d.valueCents, 0);
    return {
      stageId: s.id,
      count: here.length,
      valueCents: value,
      weightedCents: here.reduce((a, d) => a + weightedCents(d.valueCents, s.probability), 0),
    };
  });
}

/** Can a deal be moved to this stage? Null when it can. */
export function moveRefusal(deal: Pick<DealLike, 'status' | 'stageId'>, toStageId: string, stages: readonly StageDef[]): string | null {
  if (deal.status !== 'open') return 'That deal is closed. Reopen it first.';
  if (!stages.some(s => s.id === toStageId)) return 'That stage is not in your pipeline.';
  return null;
}

/* ── The forecast strip — computed, never stored ───────────────────────────────────────────────── */

/** How far back the win rate looks. Long enough to mean something, short enough to be current. */
export const WIN_RATE_DAYS = 90;

export interface Forecast {
  openCount: number;
  openCents: number;
  weightedCents: number;
  wonThisMonthCount: number;
  wonThisMonthCents: number;
  /** Won ÷ (won + lost) over the window, or null when nothing closed — not measured, not zero. */
  winRate: number | null;
  closedInWindow: number;
}

const DAY_MS = 86_400_000;

/** Whole days from one ISO date (or timestamp) to another; never negative. */
export function daysBetween(fromIso: string, toDay: string): number {
  const a = Date.parse(fromIso.slice(0, 10));
  const b = Date.parse(toDay.slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

export function winRate(deals: readonly DealLike[], today: string, windowDays = WIN_RATE_DAYS): { rate: number | null; closed: number } {
  const closed = deals.filter(d =>
    (d.status === 'won' || d.status === 'lost') && d.closedAt && daysBetween(d.closedAt, today) <= windowDays
    && d.closedAt.slice(0, 10) <= today);
  const won = closed.filter(d => d.status === 'won').length;
  return { rate: closed.length ? won / closed.length : null, closed: closed.length };
}

export function forecast(deals: readonly DealLike[], stages: readonly StageDef[], today: string): Forecast {
  const open = deals.filter(d => d.status === 'open');
  const month = today.slice(0, 7);
  const wonMonth = deals.filter(d => d.status === 'won' && d.closedAt?.slice(0, 7) === month);
  const wr = winRate(deals, today);
  return {
    openCount: open.length,
    openCents: open.reduce((a, d) => a + d.valueCents, 0),
    weightedCents: open.reduce((a, d) => a + weightedCents(d.valueCents, probabilityOf(d, stages)), 0),
    wonThisMonthCount: wonMonth.length,
    wonThisMonthCents: wonMonth.reduce((a, d) => a + d.valueCents, 0),
    winRate: wr.rate,
    closedInWindow: wr.closed,
  };
}

/* ── Going quiet ("rotting") ───────────────────────────────────────────────────────────────────── */

/**
 * The last time anything happened on a deal: it was created, it moved, a note or an activity was
 * logged, or an activity was ticked off. Scheduling something for next week is not something
 * happening — a deal whose only sign of life is a promise is still quiet.
 */
export function lastTouch(createdAt: string, eventTimes: readonly string[], doneTimes: readonly (string | null)[]): string {
  let latest = createdAt;
  for (const t of [...eventTimes, ...doneTimes]) if (t && t > latest) latest = t;
  return latest;
}

/** Days quiet, and whether that is past the stage's limit. Only an open deal can go quiet. */
export function rotting(
  deal: Pick<DealLike, 'status' | 'stageId'>, stages: readonly StageDef[], lastTouchIso: string, today: string,
): { quiet: boolean; days: number } {
  const days = daysBetween(lastTouchIso, today);
  if (deal.status !== 'open') return { quiet: false, days };
  const limit = stages.find(s => s.id === deal.stageId)?.rotDays ?? DEFAULT_ROT_DAYS;
  return { quiet: days >= limit, days };
}

/* ── Activities ────────────────────────────────────────────────────────────────────────────────── */

export const ACTIVITY_KINDS = [
  { key: 'call', label: 'Call' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'site_visit', label: 'Site visit' },
  // SPEC sends nothing. This is a reminder to send it yourself, from your own email.
  { key: 'email', label: 'Email to send' },
  { key: 'task', label: 'Task' },
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]['key'];
export const isActivityKind = (k: string): k is ActivityKind => ACTIVITY_KINDS.some(a => a.key === k);
export const activityLabel = (k: string): string => ACTIVITY_KINDS.find(a => a.key === k)?.label ?? 'Task';

export interface ActivityLike {
  id: string;
  dueDate: string;
  doneAt: string | null;
  createdAt: string;
}

export type Bucket = 'overdue' | 'today' | 'upcoming';

export function bucketOf(dueDate: string, today: string): Bucket {
  const d = dueDate.slice(0, 10);
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

const BUCKET_ORDER: Record<Bucket, number> = { overdue: 0, today: 1, upcoming: 2 };

/**
 * What is waiting to be done: overdue first (the longest overdue at the top), then today, then
 * what is coming, soonest first. Done activities have left the list.
 */
export function orderActivities<T extends ActivityLike>(list: readonly T[], today: string): (T & { bucket: Bucket })[] {
  return list
    .filter(a => !a.doneAt)
    .map(a => ({ ...a, bucket: bucketOf(a.dueDate, today) }))
    .sort((a, b) =>
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
      || a.dueDate.localeCompare(b.dueDate)
      || a.createdAt.localeCompare(b.createdAt));
}

/** The next thing to do on a deal: the earliest activity not yet done. */
export function nextActivity<T extends ActivityLike>(list: readonly T[]): T | null {
  return [...list].filter(a => !a.doneAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

/** A date an activity is due, typed in: ISO yyyy-mm-dd and a real day, or null. */
export function parseDueDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** "Today", "Tomorrow", "3 days overdue", "Fri 26 Sep". */
export function dueLabel(dueDate: string, today: string): string {
  const b = bucketOf(dueDate, today);
  if (b === 'today') return 'Today';
  if (b === 'overdue') {
    const n = daysBetween(dueDate, today);
    return `${n} ${n === 1 ? 'day' : 'days'} overdue`;
  }
  if (daysBetween(today, dueDate) === 1) return 'Tomorrow';
  const d = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ── The one flag on a card ────────────────────────────────────────────────────────────────────── */

/**
 * What the card says, if anything. A missed activity outranks going quiet, because it is a promise
 * already broken; going quiet is amber and never red; nothing scheduled is grey.
 */
export function dealFlag(
  deal: Pick<DealLike, 'status' | 'stageId'>,
  stages: readonly StageDef[],
  next: Pick<ActivityLike, 'dueDate'> | null,
  lastTouchIso: string,
  today: string,
): { text: string; light: Light } | null {
  if (deal.status !== 'open') return null;
  if (next && bucketOf(next.dueDate, today) === 'overdue') return { text: 'Activity overdue', light: 'red' };
  const r = rotting(deal, stages, lastTouchIso, today);
  if (r.quiet) return { text: `Quiet ${r.days} days`, light: 'amber' };
  if (!next) return { text: 'Nothing scheduled', light: 'pending' };
  return null;
}

/* ── Who sees what ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Only me and above. A deal belongs to its owner's role on the chart: the owner sees it, and so does
 * everybody above them in their own line — never sideways. A deal with no owner on the chart is an
 * administrator's to place, and nobody else's to read.
 */
export function canSeeDeal(ownerRoleId: string | null, visible: ReadonlySet<string>, access: string): boolean {
  if (ownerRoleId) return visible.has(ownerRoleId);
  return access === 'administrator';
}

export interface OwnerRole {
  id: string;
  title: string;
  stream: string;
  holder: { name: string } | null;
  pencilled: string | null;
  members: { name: string }[];
}

/**
 * Who a deal can be given to: the people on the part of the chart this person can see, by role.
 * A role with nobody in it cannot own a deal — a deal nobody holds is a deal nobody works. Board
 * roles are not sales.
 */
export function ownerOptions(roles: readonly OwnerRole[], visible: ReadonlySet<string>): { roleId: string; name: string; title: string }[] {
  const out: { roleId: string; name: string; title: string }[] = [];
  for (const r of roles) {
    if (!visible.has(r.id) || r.stream === 'board') continue;
    const name = r.holder?.name ?? r.pencilled ?? r.members[0]?.name ?? null;
    if (name) out.push({ roleId: r.id, name, title: r.title });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Won becomes a job ─────────────────────────────────────────────────────────────────────────── */

/**
 * What a won deal carries into Jobs. The client is the organisation if there is one, else the
 * person — the same "who it is for" an enquiry typed in Jobs starts with. The site is carried if it
 * was known; otherwise it is left for later rather than invented.
 */
export function jobFromDeal(
  deal: { title: string; site: string; valueCents: number },
  organisation: string | null,
  person: string | null,
): { title: string; client: string; site: string; valueCents: number } {
  return {
    title: deal.title.trim().slice(0, 160) || 'Won deal',
    client: (organisation?.trim() || person?.trim() || 'New client').slice(0, 120),
    site: deal.site.trim().slice(0, 160),
    valueCents: Math.max(0, Math.round(deal.valueCents)),
  };
}

/* ── Contacts ──────────────────────────────────────────────────────────────────────────────────── */

/** Case-insensitive search across the fields given. An empty search keeps everything. */
export function search<T>(list: readonly T[], q: string, fields: (row: T) => (string | null | undefined)[]): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter(row => {
    const hay = fields(row).filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/* ── The timeline ──────────────────────────────────────────────────────────────────────────────── */

export interface DealEvent {
  kind: string;
  fromStageId: string | null;
  toStageId: string | null;
  text: string;
  byName: string;
  at: string;
}

/** One line of a deal's history, in words. */
export function eventLine(e: DealEvent, stages: readonly Pick<StageDef, 'id' | 'name'>[]): string {
  const name = (id: string | null) => stages.find(s => s.id === id)?.name ?? 'a stage since removed';
  switch (e.kind) {
    case 'created': return `Deal added by ${e.byName}, in ${name(e.toStageId)}`;
    case 'stage': return `${e.byName} moved it from ${name(e.fromStageId)} to ${name(e.toStageId)}`;
    case 'won': return `Won, marked by ${e.byName}${e.text ? ` — ${e.text}` : ''}`;
    case 'lost': return `Lost, marked by ${e.byName}${e.text ? ` — ${e.text}` : ''}`;
    case 'reopened': return `Reopened by ${e.byName}, back in ${name(e.toStageId)}`;
    case 'note': return `${e.byName}: ${e.text}`;
    case 'done': return `${e.byName} ticked off: ${e.text}`;
    case 'owner': return `${e.byName} handed it to ${e.text}`;
    default: return e.text || e.kind;
  }
}

export const pctLabel = (share: number | null): string => (share === null ? '—' : `${Math.round(share * 100)}%`);
