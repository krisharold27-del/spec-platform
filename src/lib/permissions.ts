/**
 * What each level of the chart may do — pure, and the single readable statement of it.
 *
 * This is a description of the rules the server already enforces in `lib/scope`, `lib/auth` and
 * every server action, laid out so an administrator can read the whole thing at once. It is NOT the
 * enforcement: hiding a button is not access control, and nothing here is consulted before a write.
 *
 * Three states, and the difference matters:
 *   always — built into the level. Cannot be taken away, because the level would stop meaning
 *            anything without it.
 *   never  — not available at this level and not grantable. No administrator can hand it over,
 *            including to themselves.
 *   grant  — off by default, and the business may switch it on for a named person.
 *
 * Two are never delegable at all: approving a sensitive connector, and signing off a period. Those
 * are the two places where somebody's name has to be on the decision.
 */

export type Level = 'director' | 'gm' | 'manager' | 'scored' | 'checklist';

export const LEVELS: { key: Level; label: string; note: string }[] = [
  { key: 'director', label: 'Director / board', note: 'Reviews the business. Every business reports to a board, whether or not it has one.' },
  { key: 'gm', label: 'Managing Director', note: 'Runs the business day to day, and is its first administrator.' },
  { key: 'manager', label: 'Manager', note: 'Manages within their own scope: their role and everything beneath it.' },
  { key: 'scored', label: 'Scored role', note: 'Carries an individual KPI scorecard.' },
  { key: 'checklist', label: 'Checklist role', note: 'Measured through the role above. No individual scorecard.' },
];

export type PermissionState = 'always' | 'never' | 'grant';

export interface Permission {
  id: string;
  label: string;
  note: string;
  /** Levels where this is built in. */
  always: Level[];
  /** Levels where it is not available and cannot be granted. */
  never: Level[];
  /** True when nobody may delegate it, at any level. */
  undelegable?: boolean;
}

export const PERMISSIONS: Permission[] = [
  {
    id: 'own_scorecard',
    label: 'See their own scorecard',
    note: 'Their role, their numbers, every month, including the working — and they may comment on it.',
    // Every level, checklist included. A person always sees their own card in full: withholding it
    // would mean being measured by something you are not allowed to read.
    always: ['director', 'gm', 'manager', 'scored', 'checklist'],
    never: [],
  },
  {
    id: 'team_below',
    label: 'See the team below them',
    note: 'Direct reports and everything under those roles. Never sideways, never above.',
    always: ['director', 'gm', 'manager'],
    never: ['checklist'],
  },
  {
    id: 'score_role',
    label: 'Score a role',
    note: 'Enter and confirm results for the roles they manage.',
    always: ['gm', 'manager'],
    never: ['checklist', 'scored'],
  },
  {
    id: 'change_chart',
    label: 'Change the org chart',
    note: 'Add, link, unlink and move roles.',
    always: ['gm'],
    never: ['checklist', 'scored'],
  },
  {
    id: 'agree_targets',
    label: 'Agree KPI targets',
    note: 'Negotiate and settle a target with the person who holds the role. SPEC proposes; it never sets.',
    always: ['gm', 'manager'],
    never: ['checklist'],
  },
  {
    id: 'connect_system',
    label: 'Connect a system',
    note: 'Anything not sensitive. Financial and people systems still go to the board.',
    always: ['gm'],
    never: ['manager', 'scored', 'checklist'],
  },
  {
    id: 'approve_sensitive',
    label: 'Approve a sensitive connector',
    note: 'Financials and people systems — anything carrying pay, personal records or the ledger.',
    always: ['director'],
    never: ['gm', 'manager', 'scored', 'checklist'],
    undelegable: true,
  },
  {
    id: 'sign_period',
    label: 'Sign off and lock a period',
    note: 'Ends the month. Nothing recalculates afterwards, and corrections are dated amendments.',
    always: ['director'],
    never: ['manager', 'scored', 'checklist'],
    undelegable: true,
  },
  {
    id: 'personal_records',
    label: 'See pay and personal records',
    note: 'Held against a person rather than a role, so it sits outside the scorecard entirely.',
    always: ['director', 'gm'],
    never: ['scored', 'checklist'],
  },
  {
    id: 'add_seat',
    label: 'Add a seat or a grant',
    note: 'Administration rather than management: it never widens what somebody can see.',
    always: ['gm'],
    never: ['scored', 'checklist'],
  },
];

export function stateOf(permission: Permission, level: Level): PermissionState {
  if (permission.always.includes(level)) return 'always';
  if (permission.never.includes(level)) return 'never';
  return 'grant';
}

export const STATE_LABEL: Record<PermissionState, string> = {
  always: 'Built in',
  never: 'Not available',
  grant: 'Can be granted',
};

/** Whether a level may be given this permission by an administrator. */
export const grantable = (permission: Permission, level: Level): boolean =>
  !permission.undelegable && stateOf(permission, level) === 'grant';

/** The map a role's level falls under. `staff` is the schema's word for a checklist role. */
export function levelOf(roleLevel: string, isDirector = false): Level {
  if (isDirector) return 'director';
  if (roleLevel === 'gm') return 'gm';
  if (roleLevel === 'manager' || roleLevel === 'supervisor') return 'manager';
  if (roleLevel === 'staff') return 'checklist';
  return 'scored';
}

/**
 * Company settings an administrator may change, and what each one actually affects. Every one of
 * them changes how a month is read, so none of them is a preference.
 */
export interface Setting {
  id: string;
  label: string;
  note: string;
  options: string[];
}

export const SETTINGS: Setting[] = [
  {
    id: 'board_cadence',
    label: 'How often the board sits',
    note: 'Monthly is what the rhythm is built around. Quarterly is the outer limit — a board that meets quarterly and reports honestly beats one that agrees to monthly and then does not sit.',
    options: ['monthly', 'quarterly'],
  },
  {
    id: 'tier',
    label: 'Connectors and the assistant',
    note: 'Basic is a complete way to run SPEC: every number typed in and confirmed by a name. Advanced adds systems feeding the KPIs and Claude on every page.',
    options: ['basic', 'advanced'],
  },
];
