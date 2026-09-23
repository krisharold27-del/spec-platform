/**
 * Safety — pure, no I/O.
 *
 * SPEC is the safety system (design 3f, 23 September): a one-line report box, an incident register,
 * hazards and wellbeing, the on-site checks and Clear to Work. Everything that DECIDES something on
 * that screen lives here, so it can be tested without a database and so the screen, the nav badge
 * and anything that later reads the register all decide it the same way.
 *
 * Four rules run through the whole file:
 *
 *   1. **Harm to a person is always the Safety pillar, and it ranks first.** An injury is never
 *      filed under Compliance because it also happens to be notifiable; the paperwork follows the
 *      person, not the other way round.
 *   2. **Pending is never red.** Something not yet due is not something done badly. Red is kept for
 *      a result: a date missed, a check failed, a ticket expired.
 *   3. **Generic by shape, never by client.** The regulator comes from the state the work is in.
 *      No award, vendor or single regulator is hardcoded as though every business were the one the
 *      designs were drawn for (DECISIONS.md, 11 September).
 *   4. **SPEC proposes; the leader decides.** "This looks notifiable" is a prompt to pick up the
 *      phone, not a determination. The person on site makes the call.
 */

import { daysUntil } from './obligations';
import type { Pillar } from './scoring';

export type Tone = 'green' | 'amber' | 'red' | 'pending';

// ── What somebody can report ─────────────────────────────────────────────────────────────────────

export type ReportKind = 'hazard' | 'near_miss' | 'injury' | 'wellbeing';

export const REPORT_KINDS: { key: ReportKind; label: string; placeholder: string }[] = [
  { key: 'hazard', label: 'Hazard', placeholder: 'e.g. Exposed cable at the riser on level 3' },
  { key: 'near_miss', label: 'Near miss', placeholder: 'e.g. Ladder slipped, nobody hurt' },
  { key: 'injury', label: 'Someone got hurt', placeholder: 'e.g. Cut a hand on the cable tray' },
  { key: 'wellbeing', label: 'Not coping / pressure', placeholder: 'Say as much or as little as you like. You can stay anonymous.' },
];

export const isReportKind = (k: unknown): k is ReportKind =>
  typeof k === 'string' && REPORT_KINDS.some(r => r.key === k);

export const kindLabel = (k: string): string => REPORT_KINDS.find(r => r.key === k)?.label ?? 'Report';

/** Every report is about people's safety, so every report is the Safety pillar. Harm first. */
export function pillarOf(kind: ReportKind): Pillar {
  void kind;
  return 'safety';
}

/** Does this report describe harm to a person? Those outrank everything else on the page. */
export const isHarm = (kind: string): boolean => kind === 'injury' || kind === 'wellbeing';

// ── Injury severity ──────────────────────────────────────────────────────────────────────────────

export type Severity = 'first_aid' | 'medical' | 'lost_time' | 'serious';

export const SEVERITIES: { key: Severity; label: string }[] = [
  { key: 'first_aid', label: 'First aid' },
  { key: 'medical', label: 'Medical treatment' },
  { key: 'lost_time', label: 'Lost time' },
  { key: 'serious', label: 'Serious injury' },
];

export const isSeverity = (s: unknown): s is Severity =>
  typeof s === 'string' && SEVERITIES.some(x => x.key === s);

export const severityLabel = (s: string | null): string =>
  SEVERITIES.find(x => x.key === s)?.label ?? 'Not yet assessed';

// ── Is it notifiable? ────────────────────────────────────────────────────────────────────────────

/*
  The shape of the model work health and safety laws: a death, a serious injury or illness, or a
  dangerous incident must be notified to the regulator immediately, and the site preserved.

  This is a PROMPT, not a ruling. It errs towards asking: a false "this looks notifiable" costs a
  phone call; a missed one costs a breach. Words are matched loosely — a person typing on a phone
  at the scene does not write "amputation", they write "lost the tip of his finger".
*/
const SERIOUS_HARM = new RegExp([
  'died', 'dead', 'death', 'fatal', 'killed',
  'hospital', 'admitted', 'ambulance', 'paramedic', 'unconscious', 'passed out', 'knocked out',
  'electric shock', 'electrocut', 'shocked', 'zapped',
  'fracture', 'broken', 'broke (his|her|their|a|an|my)',
  'amputat', 'lost (a|the|his|her|their|my) (finger|toe|hand|foot|tip)', 'severed',
  'fell from', 'fall from', 'fallen from', 'fell off', 'from height',
  'head injury', 'hit (his|her|their|my) head', 'concussion',
  'eye injury', 'in (his|her|their|my) eye', 'burn', 'scald',
  'spinal', 'back broken', 'crush', 'degloving', 'scalp',
  'deep cut', 'stitches', 'heavy bleeding', 'bleeding badly',
  'collapse', 'not breathing', 'cpr',
].join('|'), 'i');

/** A dangerous incident is notifiable even when nobody was hurt. */
const DANGEROUS_INCIDENT = new RegExp([
  'electric shock', 'electrocut', 'shocked', 'zapped', 'arc flash',
  'explosion', 'exploded', '\\bfire\\b', 'gas leak', 'uncontrolled',
  'collapse', 'excavation cave', 'trench cave',
  'fell from height', 'dropped from height', 'fell from the scaffold', 'load fell', 'dropped (a|the) load',
  'asbestos', 'chemical spill',
].join('|'), 'i');

/**
 * Does this one-line report look like something the regulator must be told about straight away?
 *
 * Only an injury or a near miss can be. A hazard is a condition, not an event; a wellbeing report is
 * handled privately by the business and is never routed to a regulator by SPEC.
 */
export function looksNotifiable(kind: string, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (kind === 'injury') return SERIOUS_HARM.test(t) || DANGEROUS_INCIDENT.test(t);
  if (kind === 'near_miss') return DANGEROUS_INCIDENT.test(t);
  return false;
}

// ── Who to call ──────────────────────────────────────────────────────────────────────────────────

export interface Regulator {
  /** The short code a person would say: NSW, VIC, NZ. */
  code: string;
  /** The state or territory, spelled out. */
  place: string;
  name: string;
  phone: string;
}

/*
  One row per jurisdiction, and nothing more.

  A business works in whichever state its jobs are in — often more than one — so the regulator is
  looked up from the state of the SITE, never fixed per business and never hardcoded to one. The
  numbers are the regulators' published notification lines. They change rarely, and when they do
  this table is the only place to change.
*/
export const REGULATORS: Regulator[] = [
  { code: 'NSW', place: 'New South Wales', name: 'SafeWork NSW', phone: '13 10 50' },
  { code: 'VIC', place: 'Victoria', name: 'WorkSafe Victoria', phone: '13 23 60' },
  { code: 'QLD', place: 'Queensland', name: 'Workplace Health and Safety Queensland', phone: '1300 362 128' },
  { code: 'WA', place: 'Western Australia', name: 'WorkSafe WA', phone: '1300 307 877' },
  { code: 'SA', place: 'South Australia', name: 'SafeWork SA', phone: '1800 777 209' },
  { code: 'TAS', place: 'Tasmania', name: 'WorkSafe Tasmania', phone: '1300 366 322' },
  { code: 'ACT', place: 'Australian Capital Territory', name: 'WorkSafe ACT', phone: '02 6207 3000' },
  { code: 'NT', place: 'Northern Territory', name: 'NT WorkSafe', phone: '1800 019 115' },
  { code: 'NZ', place: 'New Zealand', name: 'WorkSafe New Zealand', phone: '0800 030 040' },
];

/** The regulator for a state, from its code in any case. Null when SPEC does not know the place. */
export function regulatorFor(code: string | null | undefined): Regulator | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return REGULATORS.find(r => r.code === c) ?? null;
}

/** A state code SPEC recognises, or null. Anything arriving from a form is checked against the table. */
export const stateCode = (raw: unknown): string | null => regulatorFor(String(raw ?? ''))?.code ?? null;

/**
 * The line a person reads the moment a report looks notifiable.
 *
 * When the state is known it names the regulator and the number. When it is not, it says what to
 * do in words that are true everywhere, rather than guessing a state and sending somebody to the
 * wrong regulator.
 */
export function notifyPrompt(code: string | null | undefined): { title: string; body: string } {
  const r = regulatorFor(code);
  const body = 'Leave the site as it is unless you need to move something to help someone or make it safe. Your supervisor has been told, and the incident is open on the register.';
  return r
    ? { title: `This looks notifiable. Call ${r.name} now: ${r.phone}.`, body }
    : { title: 'This looks notifiable. Call your state’s work health and safety regulator now.', body };
}

/**
 * The state to assume for the next notifiable report: the one this business last used.
 *
 * Asked once, at the moment it is relevant (a report that looks notifiable), and remembered by the
 * register itself — nothing new for anybody to fill in on day one.
 */
export function likelyState(recent: { state: string | null; createdAt: string }[]): string | null {
  const known = recent
    .filter(r => stateCode(r.state))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return known.length ? stateCode(known[0].state) : null;
}

// ── Clear to Work ────────────────────────────────────────────────────────────────────────────────

/** How far ahead a licence or ticket is flagged. Sixty days is time enough to book a renewal. */
export const CLEAR_WARNING_DAYS = 60;

export type ClearState = 'clear' | 'expiring' | 'not_clear';

export interface Clearance {
  state: ClearState;
  tone: Tone;
  /** Short, for the chip. */
  label: string;
  /** Whole days left; negative once expired; null when it does not expire. */
  days: number | null;
}

/**
 * Where one licence or ticket stands today.
 *
 * Expiring does NOT stop anybody working: a licence good until Friday is good until Friday. It is
 * flagged sixty days out so it never gets that close. Expired does — and an unreadable date is not
 * evidence of anything, so it counts as not clear rather than being waved through.
 */
export function clearance(expiresAt: string | null | undefined, at: Date = new Date()): Clearance {
  if (!expiresAt) return { state: 'clear', tone: 'green', label: 'Clear', days: null };
  const days = daysUntil(expiresAt, at);
  if (Number.isNaN(days)) return { state: 'not_clear', tone: 'red', label: 'Not clear to work', days: null };
  if (days < 0) return { state: 'not_clear', tone: 'red', label: 'Not clear to work', days };
  if (days <= CLEAR_WARNING_DAYS) {
    return { state: 'expiring', tone: 'amber', label: days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`, days };
  }
  return { state: 'clear', tone: 'green', label: 'Clear', days };
}

/** What a person reads under the chip. */
export function clearanceNote(expiresAt: string | null | undefined, at: Date = new Date()): string {
  if (!expiresAt) return 'Does not expire';
  const c = clearance(expiresAt, at);
  if (c.days === null) return 'The expiry date cannot be read';
  const date = expiresAt.slice(0, 10);
  return c.days < 0 ? `Expired ${date}` : `Expires ${date}`;
}

/**
 * May this person be booked on a job?
 *
 * One expired ticket is enough to say no. This is the rule the schedule reads — whether the schedule
 * is SPEC's own or a connected job system — so it lives here once rather than in each.
 */
export function clearToSchedule(tickets: { expiresAt: string | null }[], at: Date = new Date()): boolean {
  return tickets.every(t => clearance(t.expiresAt, at).state !== 'not_clear');
}

// ── Reports, actions and checks: where each one stands ───────────────────────────────────────────

export interface Standing { tone: Tone; label: string }

/**
 * A hazard, near miss, injury or wellbeing report on the register.
 *
 * Closed is green. Past its fix-by date is red — that is a result. Open and in date is amber. Open
 * with nobody on it yet is amber too, and never red: not having been picked up in the last ten
 * minutes is not a failure.
 */
export function reportStanding(
  r: { status: string; owner: string | null; dueAt: string | null; severity?: string | null; kind: string },
  at: Date = new Date(),
): Standing {
  if (r.status === 'closed') {
    return { tone: 'green', label: r.kind === 'injury' ? `${severityLabel(r.severity ?? null)} · closed` : 'Fixed' };
  }
  if (r.dueAt) {
    const days = daysUntil(r.dueAt, at);
    if (!Number.isNaN(days) && days < 0) return { tone: 'red', label: `Overdue ${-days} day${days === -1 ? '' : 's'}` };
  }
  if (r.kind === 'injury') return { tone: 'amber', label: `${severityLabel(r.severity ?? null)} · open` };
  if (r.kind === 'wellbeing') return { tone: 'amber', label: r.owner ? `With ${r.owner}` : 'Waiting to be picked up' };
  const owner = r.owner ? `With ${r.owner}` : 'Needs an owner';
  return { tone: 'amber', label: r.dueAt ? `${owner} · due ${r.dueAt.slice(0, 10)}` : owner };
}

/** A corrective action: done, on track, or overdue. */
export function actionStanding(a: { doneAt: string | null; dueAt: string | null }, at: Date = new Date()): Standing {
  if (a.doneAt) return { tone: 'green', label: 'Done' };
  if (!a.dueAt) return { tone: 'amber', label: 'No date yet' };
  const days = daysUntil(a.dueAt, at);
  if (Number.isNaN(days)) return { tone: 'amber', label: 'No date yet' };
  if (days < 0) return { tone: 'red', label: 'Overdue' };
  return { tone: 'green', label: 'On track' };
}

export type CheckKind = 'toolbox' | 'swms' | 'inspection' | 'vehicle';

export const CHECK_KINDS: { key: CheckKind; title: string; action: string }[] = [
  { key: 'toolbox', title: 'Toolbox talks & sign-on', action: 'Start a talk' },
  { key: 'swms', title: 'SWMS & JSA sign-off', action: 'Add a SWMS' },
  { key: 'inspection', title: 'Site inspections & audits', action: 'Book an inspection' },
  { key: 'vehicle', title: 'Vehicle & plant checks', action: 'Log a check' },
];

export const isCheckKind = (k: unknown): k is CheckKind =>
  typeof k === 'string' && CHECK_KINDS.some(c => c.key === k);

/** Vehicles and plant are checked weekly; a check older than this is overdue. */
export const VEHICLE_CHECK_DAYS = 7;

/**
 * An on-site check.
 *
 *   toolbox / swms — everybody who should sign has signed (green), or somebody has not (amber).
 *   inspection     — passed or failed once done; before that, due (amber) or past its date (red).
 *   vehicle        — failed is red and the vehicle is off the schedule; a pass goes stale after a
 *                    week and becomes overdue.
 */
export function checkStanding(
  c: { kind: string; result: string; onDate: string | null; signed: number | null; expected: number | null },
  at: Date = new Date(),
): Standing {
  if (c.kind === 'toolbox' || c.kind === 'swms') {
    const expected = c.expected ?? 0;
    const signed = c.signed ?? 0;
    if (expected > 0 && signed < expected) {
      const missing = expected - signed;
      return { tone: 'amber', label: c.kind === 'swms' ? `Waiting on ${missing}` : `${missing} not signed` };
    }
    return { tone: 'green', label: c.kind === 'swms' ? 'Current' : 'Done' };
  }
  if (c.result === 'failed') {
    return { tone: 'red', label: c.kind === 'vehicle' ? 'Failed · off the schedule' : 'Failed' };
  }
  if (c.result === 'passed') {
    if (c.kind === 'vehicle' && c.onDate) {
      const age = -daysUntil(c.onDate, at);
      if (!Number.isNaN(age) && age > VEHICLE_CHECK_DAYS) {
        return { tone: 'red', label: `Overdue ${age - VEHICLE_CHECK_DAYS} day${age - VEHICLE_CHECK_DAYS === 1 ? '' : 's'}` };
      }
    }
    return { tone: 'green', label: 'Passed' };
  }
  // Not done yet.
  if (c.onDate) {
    const days = daysUntil(c.onDate, at);
    if (!Number.isNaN(days) && days < 0) return { tone: 'red', label: 'Overdue' };
  }
  return { tone: 'amber', label: 'Due' };
}

/** Workers' compensation and return to work, in one line. */
export function claimStanding(c: { status: string; dutiesWeek: number | null; dutiesWeeks: number | null }): Standing {
  if (c.status === 'closed') return { tone: 'green', label: 'Back at full duties' };
  if (c.dutiesWeeks && c.dutiesWeeks > 0) {
    const week = Math.min(Math.max(c.dutiesWeek ?? 1, 1), c.dutiesWeeks);
    return { tone: 'amber', label: `Suitable duties · week ${week} of ${c.dutiesWeeks}` };
  }
  return { tone: 'amber', label: 'Claim open' };
}

// ── What needs doing, in order ───────────────────────────────────────────────────────────────────

export interface Need {
  /** Is this harm to a person? */
  harm: boolean;
  notifiable?: boolean;
  tone: Tone;
  /** ISO date the thing was raised, or fell due — older sorts first within a rank. */
  since: string;
}

/**
 * Rank a need: lower comes first.
 *
 *   0  harm to a person that looks notifiable
 *   1  any other harm to a person — whatever colour it is
 *   2  red: a date missed, a check failed, a ticket expired
 *   3  amber
 *   4  pending
 *
 * Harm outranks a missed date because a person outranks paperwork, and a green-but-open injury
 * still outranks an overdue ute check.
 */
export function priority(n: Need): number {
  if (n.harm && n.notifiable) return 0;
  if (n.harm) return 1;
  if (n.tone === 'red') return 2;
  if (n.tone === 'amber') return 3;
  if (n.tone === 'pending') return 4;
  return 5;
}

/** Sort needs by priority, oldest first within a rank. Returns a new array. */
export function byPriority<T extends Need>(needs: readonly T[]): T[] {
  return [...needs].sort((a, b) => priority(a) - priority(b) || a.since.localeCompare(b.since));
}

// ── The four numbers on Today ────────────────────────────────────────────────────────────────────

/**
 * Whole days since the last injury, or null when none has ever been recorded.
 *
 * Null is not zero and not a streak: a business that has recorded nothing has no number yet, and the
 * page says so in the pending colour rather than printing a count it cannot stand behind.
 */
export function daysWithoutHarm(injuries: { createdAt: string }[], at: Date = new Date()): number | null {
  if (!injuries.length) return null;
  const last = injuries.map(i => i.createdAt.slice(0, 10)).sort().at(-1)!;
  return Math.max(0, -daysUntil(last, at));
}

// ── Who can see a report ─────────────────────────────────────────────────────────────────────────

export interface Viewer {
  userId: string;
  /** Is this role the viewer's own or beneath it? See lib/scope. */
  seesRole: (roleId: string) => boolean;
  /** The top of the chart, or an unplaced administrator — the person a GM-only report goes to. */
  isTop: boolean;
}

/**
 * The visibility rule for the register.
 *
 *   Hazards and near misses are everybody's business: everybody on site needs to know about the
 *   exposed cable. Anybody in the business sees them.
 *
 *   An injury is about a person, so it follows the chart: the person who raised it, and everybody
 *   above them (never sideways, never below).
 *
 *   A wellbeing report goes to the top of the chart and nowhere else — named, the GM and the person
 *   who sent it; anonymous, the GM only, because it carries no name and no role at all (see the
 *   table) and there is nobody else it could be routed to without knowing who sent it.
 */
export function canSeeReport(
  r: { kind: string; reportedBy: string | null; roleId: string | null },
  v: Viewer,
): boolean {
  if (r.kind === 'hazard' || r.kind === 'near_miss') return true;
  if (v.isTop) return true;
  if (r.reportedBy && r.reportedBy === v.userId) return true;
  // Wellbeing goes to the top only, named or not: "my supervisor is the pressure" is too common a
  // sentence to route up a chain that starts with the supervisor.
  if (r.kind === 'wellbeing') return false;
  if (r.roleId && v.seesRole(r.roleId)) return true;
  return false;
}

/**
 * What an anonymous wellbeing report may keep.
 *
 * Anonymous means nothing that could lead back to the person — not their id, not their role, not
 * the job they were on, and not the minute they pressed send. Only the date survives, because a
 * timestamp to the second is a name to anybody who can see who was on shift.
 */
export function anonymise<T extends { reportedBy: string | null; roleId: string | null; jobRef: string | null; createdAt: string }>(r: T): T {
  return { ...r, reportedBy: null, roleId: null, jobRef: null, createdAt: r.createdAt.slice(0, 10) };
}

// ── What each part of the screen feeds ───────────────────────────────────────────────────────────

/** The measure each register feeds, by pillar. Named by the measure, never by a system. */
export const FEEDS = {
  incidents: { pillar: 'safety', measure: 'Incidents, LTI, TRIFR' },
  notifiable: { pillar: 'compliance', measure: 'Regulatory breaches' },
  claims: { pillar: 'safety', measure: 'Workers’ comp claims' },
  hazards: { pillar: 'safety', measure: 'Near-miss reporting rate' },
  wellbeing: { pillar: 'safety', measure: 'Incidents (psychosocial)' },
  actions: { pillar: 'safety', measure: 'Actions closed on time' },
  toolbox: { pillar: 'safety', measure: 'Toolbox talks held' },
  swms: { pillar: 'compliance', measure: 'Audit pass rate' },
  inspection: { pillar: 'compliance', measure: 'Audit pass rate' },
  vehicle: { pillar: 'compliance', measure: 'Vehicle checks weekly' },
  clear: { pillar: 'compliance', measure: 'Licences current' },
} as const satisfies Record<string, { pillar: Pillar; measure: string }>;
