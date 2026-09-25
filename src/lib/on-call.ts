/**
 * On call, key roles with a named backup, and the wellbeing check that must never name anybody.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"On call: weekly roster in People → Pay; after-hours calls route to the rostered person's phone
 * and book a job; award on-call allowance added to pay automatically; empty weeks flagged. Key
 * roles: every role's how-to lives in SPEC; every key role has a named backup (none = red); a
 * handover checklist starts on the day someone resigns."*
 *
 * And: *"Wellbeing check-in: monthly, anonymous, whole-business results only (score, response
 * count, themes). Never per person, never per team small enough to identify someone."*
 *
 * ── The empty week is the feature ────────────────────────────────────────────────────────────────
 *
 * A roster with somebody on it every week is a roster nobody needs software for. What costs a
 * business is the week nobody was rostered — which nobody notices until eleven o'clock on a Friday
 * night, because an empty week looks exactly like a week that has not been filled in yet.
 *
 * ── Why a key role with no backup is red ─────────────────────────────────────────────────────────
 *
 * A business where one person is the only one who can do something is a business that cannot let
 * that person have a holiday, get sick, or leave. It is the single most common way a good small
 * business stops being sellable, and it is invisible while that person is turning up.
 *
 * ── The wellbeing rule is a floor, not a preference ──────────────────────────────────────────────
 *
 * Anonymous means anonymous. Results are whole-business only, and a team small enough to identify
 * somebody is not shown at all — because "the field crew scored 2 on feeling safe to speak up" in a
 * crew of three is a named accusation with a number on it. `tests/on-call.test.ts` fails the build
 * if any per-person shape appears in this file.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * On call
 * ───────────────────────────────────────────────────────────────────────────── */

export interface OnCallWeek {
  /** The Monday. */
  weekStart: string;
  personKey: string | null;
  personName: string | null;
  /** Their number, which is where after-hours calls go. */
  phone: string | null;
}

export type WeekState = 'covered' | 'no_number' | 'empty';

export interface WeekWatch {
  week: OnCallWeek;
  state: WeekState;
  says: string;
}

export function weekWatch(week: OnCallWeek): WeekWatch {
  if (!week.personName?.trim()) {
    return {
      week, state: 'empty',
      says: `Nobody on call the week of ${week.weekStart}. An after-hours call that week rings out.`,
    };
  }
  if (!week.phone?.trim()) {
    /*
      Rostered with no number is the worst of the three and the easiest to miss: the roster looks
      full, everybody assumes it is covered, and the call goes nowhere.
    */
    return {
      week, state: 'no_number',
      says: `${week.personName} is on call the week of ${week.weekStart} and SPEC has no number for them. The roster looks covered and the call would go nowhere.`,
    };
  }
  return { week, state: 'covered', says: `${week.personName}, week of ${week.weekStart}.` };
}

/** Every week that is not really covered. What a leader opens the roster to find. */
export const notCovered = (weeks: readonly OnCallWeek[]): WeekWatch[] =>
  weeks.map(weekWatch).filter(w => w.state !== 'covered');

export function rosterLine(weeks: readonly OnCallWeek[]): string {
  if (weeks.length === 0) return 'No on-call roster set up.';
  const bad = notCovered(weeks);
  if (bad.length === 0) return `${weeks.length} weeks rostered, every one of them covered.`;
  const empty = bad.filter(w => w.state === 'empty').length;
  const noNumber = bad.filter(w => w.state === 'no_number').length;
  const bits: string[] = [];
  if (empty > 0) bits.push(`${empty} with nobody on`);
  if (noNumber > 0) bits.push(`${noNumber} with no number`);
  return `${weeks.length} weeks rostered · ${bits.join(' · ')}.`;
}

/**
 * Whether the on-call allowance goes on this week's pay.
 *
 * The rate is not here. It is an award rate that changes, and it belongs in `legal_rates` with a
 * source — the same rule as everything else payroll depends on. What this answers is whether the
 * allowance is OWED, which is a fact about the roster.
 */
export const allowanceOwed = (week: OnCallWeek): boolean =>
  Boolean(week.personKey?.trim());

export const ALLOWANCE_FROM_THE_AWARD =
  'The on-call allowance is an award rate. SPEC adds it to the pay run automatically for whoever was rostered — at the rate you have set, from your award, with a source against it.';

export const AFTER_HOURS_ROUTES =
  'An after-hours call goes to whoever is on that week and books a job as it comes in, so the morning starts with it already on the schedule rather than in somebody’s head.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Key roles, and who could do it instead
 * ───────────────────────────────────────────────────────────────────────────── */

export interface KeyRole {
  roleId: string;
  title: string;
  holder: string | null;
  /** Somebody who could hold it. Null is the state this whole section exists for. */
  backupName: string | null;
  /** Whether the how-to for this role is written down in SPEC. */
  hasHowTo: boolean;
  /** Set on the day somebody resigns from it. */
  resignedAt: string | null;
}

export type KeyState = 'covered' | 'no_backup' | 'no_how_to' | 'leaving' | 'vacant';

export interface KeyWatch {
  role: KeyRole;
  state: KeyState;
  says: string;
}

export function keyWatch(role: KeyRole): KeyWatch {
  if (role.resignedAt) {
    return {
      role, state: 'leaving',
      says: role.backupName
        ? `${role.holder} has resigned from ${role.title}. ${role.backupName} can hold it — the handover checklist started on ${role.resignedAt.slice(0, 10)}.`
        : `${role.holder} has resigned from ${role.title} and there is no named backup. This is the one to deal with this week.`,
    };
  }
  if (!role.holder?.trim()) {
    return { role, state: 'vacant', says: `${role.title} is empty.` };
  }
  if (!role.backupName?.trim()) {
    return {
      role, state: 'no_backup',
      says: `${role.holder} is the only person who can do ${role.title}. That is fine until they are sick, on holiday, or gone.`,
    };
  }
  if (!role.hasHowTo) {
    return {
      role, state: 'no_how_to',
      says: `${role.backupName} is named as backup for ${role.title} and there is nothing written down for them to follow. A backup with no how-to is a name on a list.`,
    };
  }
  return { role, state: 'covered', says: `${role.holder}, with ${role.backupName} as backup.` };
}

export const atRisk = (roles: readonly KeyRole[]): KeyWatch[] => {
  const rank: Record<KeyState, number> = { leaving: 0, vacant: 1, no_backup: 2, no_how_to: 3, covered: 4 };
  return roles
    .map(keyWatch)
    .filter(w => w.state !== 'covered')
    .sort((a, b) => rank[a.state] - rank[b.state]);
};

export function keyRolesLine(roles: readonly KeyRole[]): string {
  if (roles.length === 0) return 'No key roles named yet.';
  const risky = atRisk(roles);
  if (risky.length === 0) return `${roles.length} key roles, every one with a named backup and a how-to.`;
  const noBackup = risky.filter(w => w.state === 'no_backup').length;
  return noBackup > 0
    ? `${risky.length} of ${roles.length} key roles need attention — ${noBackup} where one person is the only one who can do it.`
    : `${risky.length} of ${roles.length} key roles need attention.`;
}

/** What starts the day somebody resigns. Not a form — a list with dates on it. */
export const HANDOVER = [
  'What they do that nobody else does, written down',
  'Who takes each part, by name',
  'Customers and suppliers who deal with them directly, told',
  'Logins, keys, cards and vehicles back',
  'Their last day agreed, and what has to be finished before it',
  'A week where the backup does the job and they are still here to ask',
] as const;

export const WHY_A_BACKUP =
  'A business where one person is the only one who can do something cannot let that person have a holiday, get sick, or leave. It is the most common way a good small business stops being sellable, and it is invisible while that person keeps turning up.';

/* ─────────────────────────────────────────────────────────────────────────────
 * How is everyone going?
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The smallest group whose result may ever be shown.
 *
 * Under this, results are not shown at all — not averaged, not rounded, not shown with a warning.
 * "The field crew scored 2 on feeling safe to speak up", in a crew of three, is a named accusation
 * with a number on it.
 */
export const NEVER_BELOW = 5;

export interface Wellbeing {
  /** The month it covers. */
  month: string;
  /** How many people answered. Never who. */
  responses: number;
  /** How many were asked, so a response rate means something. */
  asked: number;
  /** 0–10, whole business. Null when too few answered to show anything. */
  score: number | null;
  /** What came up, in themes rather than quotes — a quote can identify somebody. */
  themes: readonly string[];
}

export type WellbeingState = 'too_few' | 'shown';

export interface WellbeingReading {
  state: WellbeingState;
  score: number | null;
  says: string;
  themes: readonly string[];
}

export function readWellbeing(w: Wellbeing): WellbeingReading {
  if (w.responses < NEVER_BELOW) {
    /*
      Not a percentage, not "insufficient data", and definitely not the score with a caveat. The
      promise made when people answered was anonymity, and a number from four people in a business
      where everybody knows who is on leave is not anonymous.
    */
    return {
      state: 'too_few', score: null, themes: [],
      says: `${w.responses} ${w.responses === 1 ? 'person' : 'people'} answered. SPEC will not show a result from fewer than ${NEVER_BELOW} — it was promised anonymous, and a number from a handful of people in one business is not.`,
    };
  }
  const rate = Math.round((w.responses / Math.max(1, w.asked)) * 100);
  return {
    state: 'shown',
    score: w.score,
    themes: w.themes,
    says: w.score === null
      ? `${w.responses} of ${w.asked} answered (${rate}%).`
      : `${w.score.toFixed(1)} out of 10, from ${w.responses} of ${w.asked} people (${rate}%).`,
  };
}

export const ANONYMOUS_MEANS_ANONYMOUS =
  'Monthly, anonymous, and the whole business only. Never per person, and never a team small enough that anybody could work out who said what — a score against a crew of three is a name with a number on it.';

/* ─────────────────────────────────────────────────────────────────────────────
 * TAFE
 * ───────────────────────────────────────────────────────────────────────────── */

export interface TafeProgress {
  apprentice: string;
  stage: string;
  /** Units completed against units due at this point. */
  done: number;
  due: number;
  /** Where it came from — the training provider, not the business's guess. */
  source: string | null;
  updatedAt: string | null;
}

export type TafeState = 'on_track' | 'behind' | 'not_told';

export function tafeWatch(p: TafeProgress): { state: TafeState; says: string } {
  if (p.source === null || p.updatedAt === null) {
    return {
      state: 'not_told',
      says: `Nothing has come through from ${p.apprentice}’s training provider. SPEC will not guess at how they are going.`,
    };
  }
  if (p.done >= p.due) {
    return { state: 'on_track', says: `${p.done} of ${p.due} units — on track.` };
  }
  return {
    state: 'behind',
    says: `${p.done} of ${p.due} units. Behind, and it is their supervisor who can do something about it.`,
  };
}

/**
 * Where TAFE progress is shown, and where it must not be.
 *
 * The training record only. Not the KPI board, because an apprentice falling behind at TAFE is a
 * thing to help with, and putting it on a scored board turns it into a thing to hide.
 */
export const TAFE_IS_NOT_A_KPI =
  'TAFE progress sits on the training record and never on the KPI board. An apprentice behind at TAFE needs help with it; on a scored board it becomes something to hide.';

export const TAFE_GOES_TO_THE_SUPERVISOR =
  'Their supervisor is told, because they are the person who can move a day around so somebody gets to class.';
