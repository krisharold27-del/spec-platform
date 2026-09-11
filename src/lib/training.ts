/**
 * SPEC's own training — pure functions, no I/O.
 *
 * Trained on the job, not on the software. Every module is tied to a pillar and through it to the
 * KPIs a role is already scored on, so finishing a path is meant to move a number somebody is
 * accountable for.
 *
 * Three things live in three different places, and keeping them apart is what makes the model work:
 *
 *  - the **path** belongs to the ROLE. A role may require training with nobody in it, and
 *    reassigning a person never edits it.
 *  - **progress** belongs to the PERSON. Somebody learns a module once.
 *  - **sign-off** belongs to the PLACEMENT — trained and confirmed capable in this role — so it
 *    does not travel with somebody who moves to a different job.
 *
 * Nothing here is a ranking and nothing compares two people. Overdue is a fact about a date, not a
 * verdict about a person, and a module nobody has started yet is simply not started.
 */

export type ModulePillar = 'safety' | 'people' | 'earnings' | 'compliance' | 'all';

export interface TrainingModule {
  id: string;
  title: string;
  summary: string;
  pillar: ModulePillar;
  minutes: number;
  core: boolean;
}

/** One module as the role requires it. `dueDays` is counted from taking the role. */
export interface CurriculumEntry {
  moduleId: string;
  dueDays: number | null;
  sortOrder: number;
}

export interface TrainingRecord {
  moduleId: string;
  /** 0–100. */
  progress: number;
  resultPct: number | null;
  completedAt: string | null;
}

export type ModuleState = 'complete' | 'in_progress' | 'not_started';
export type DueState = 'none' | 'upcoming' | 'due_soon' | 'overdue';

export interface PathLine {
  moduleId: string;
  title: string;
  summary: string;
  pillar: ModulePillar;
  minutes: number;
  core: boolean;
  progress: number;
  state: ModuleState;
  resultPct: number | null;
  /** ISO date this module is due for the person holding the role, where the path sets one. */
  dueDate: string | null;
  due: DueState;
  /** The line under the module: what it is waiting on, in the words a manager would use. */
  note: string;
  /** What the button says. Never "Retake" — a passed module is reviewed, not re-sat. */
  action: 'Start' | 'Continue' | 'Review';
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Days between two ISO dates, positive when `to` is in the future. */
export function daysUntil(to: string, at: Date): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${iso(at)}T00:00:00Z`)) / DAY);
}

/**
 * When a module is due for somebody who took the role on `fromDate`. A path with no deadline
 * produces none — a due date nobody set is not a deadline, and inventing one would make the page
 * nag about something the business never asked for.
 */
export function dueDateFor(fromDate: string | null, dueDays: number | null): string | null {
  if (!fromDate || dueDays === null) return null;
  const start = Date.parse(`${fromDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  return iso(new Date(start + dueDays * DAY));
}

/** Overdue only once the day has passed. "Due soon" is the last fortnight before it. */
export function dueState(dueDate: string | null, complete: boolean, at: Date): DueState {
  if (!dueDate || complete) return 'none';
  const days = daysUntil(dueDate, at);
  if (days < 0) return 'overdue';
  if (days <= 14) return 'due_soon';
  return 'upcoming';
}

export const stateOf = (progress: number): ModuleState =>
  progress >= 100 ? 'complete' : progress > 0 ? 'in_progress' : 'not_started';

/**
 * The role's path, as the person holding it sees it.
 *
 * A module on the path with no module row behind it is dropped rather than rendered as a blank:
 * that is a catalogue that has moved on, not something the learner did wrong.
 */
export function pathFor(
  curriculum: CurriculumEntry[],
  modules: TrainingModule[],
  records: TrainingRecord[],
  fromDate: string | null,
  at: Date = new Date(),
): PathLine[] {
  const byId = new Map(modules.map(m => [m.id, m]));
  const recordFor = new Map(records.map(r => [r.moduleId, r]));

  return [...curriculum]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(entry => {
      const m = byId.get(entry.moduleId);
      if (!m) return [];
      const record = recordFor.get(entry.moduleId);
      const progress = Math.max(0, Math.min(100, record?.progress ?? 0));
      const state = stateOf(progress);
      const dueDate = dueDateFor(fromDate, entry.dueDays);
      const due = dueState(dueDate, state === 'complete', at);
      return [{
        moduleId: m.id,
        title: m.title,
        summary: m.summary,
        pillar: m.pillar,
        minutes: m.minutes,
        core: m.core,
        progress,
        state,
        resultPct: record?.resultPct ?? null,
        dueDate,
        due,
        note: noteFor(m, state, progress, record ?? null, dueDate, due),
        action: state === 'complete' ? 'Review' : state === 'in_progress' ? 'Continue' : 'Start',
      }];
    });
}

function noteFor(
  m: TrainingModule,
  state: ModuleState,
  progress: number,
  record: TrainingRecord | null,
  dueDate: string | null,
  due: DueState,
): string {
  if (state === 'complete') {
    const when = record?.completedAt ? ` ${record.completedAt.slice(0, 10)}` : '';
    return record?.resultPct !== null && record?.resultPct !== undefined
      ? `Passed${when} · ${record.resultPct}%`
      : `Complete${when}.`;
  }
  // Time left is honest about being an estimate of the module, not of the person.
  const left = Math.max(1, Math.round(m.minutes * (1 - progress / 100)));
  const effort = state === 'in_progress' ? `About ${left} min left.` : `${m.minutes} min.`;
  if (due === 'overdue') return `${effort} Overdue since ${dueDate}.`;
  if (due === 'due_soon') return `${effort} Due ${dueDate}.`;
  if (due === 'upcoming') return `${effort} Due ${dueDate}.`;
  return effort;
}

export interface PathProgress {
  total: number;
  complete: number;
  /** 0–1 across the whole path, or null when the role has no path set. */
  pct: number | null;
  pathComplete: boolean;
  overdue: number;
}

export function pathProgress(lines: PathLine[]): PathProgress {
  const total = lines.length;
  const complete = lines.filter(l => l.state === 'complete').length;
  return {
    total,
    complete,
    // A role with no path has no progress — not 0%, which would read as a failure to start
    // something nobody has assigned yet.
    pct: total === 0 ? null : lines.reduce((s, l) => s + l.progress, 0) / (total * 100),
    pathComplete: total > 0 && complete === total,
    overdue: lines.filter(l => l.due === 'overdue').length,
  };
}

export type SignoffState = 'no_path' | 'in_progress' | 'ready' | 'signed';

export interface Signoff {
  state: SignoffState;
  label: string;
  note: string;
  trainedAt: string | null;
  trainedBy: string | null;
}

/**
 * Where the path stands with the manager. Sign-off is a person's decision about somebody they
 * work with, never something the software awards on a progress bar reaching the end.
 */
export function signoffFor(
  progress: PathProgress,
  assignment: { trainedAt: string | null; trainedBy: string | null },
  managerTitle: string | null,
): Signoff {
  const base = { trainedAt: assignment.trainedAt, trainedBy: assignment.trainedBy };
  if (assignment.trainedAt) {
    return {
      ...base,
      state: 'signed',
      label: 'Signed off',
      note: `Signed off${assignment.trainedBy ? ` by ${assignment.trainedBy}` : ''} on ${assignment.trainedAt.slice(0, 10)}.`,
    };
  }
  if (progress.total === 0) {
    return { ...base, state: 'no_path', label: 'No path set', note: 'Nothing is assigned to this role yet.' };
  }
  if (progress.pathComplete) {
    return {
      ...base,
      state: 'ready',
      label: 'Ready for sign-off',
      note: managerTitle ? `Goes to the ${managerTitle}.` : 'Goes to whoever this role reports to.',
    };
  }
  return {
    ...base,
    state: 'in_progress',
    label: 'Not yet signed off',
    note: `${progress.complete} of ${progress.total} modules done. Sign-off comes after the path, not during it.`,
  };
}

export interface AceStep {
  label: string;
  done: boolean;
  note: string;
}

/**
 * The run: how many closed months in a row, most recent last, held every pillar at the standard.
 *
 * A month that did not hold breaks the run rather than pausing it, and a month with no score is not
 * a qualifying month — it is an absence, which cannot be counted either way. Only closed months
 * count, because an open month is not a result yet.
 */
export function monthsAtStandard(closed: { allPillarsAtStandard: boolean }[]): number {
  let run = 0;
  for (const m of closed) run = m.allPillarsAtStandard ? run + 1 : 0;
  return run;
}

/**
 * Ace — Sales Ace on the growth side, Ops Ace on operations. Trained on the job, signed off, and
 * holding at least 90% on the KPI board three months running.
 *
 * Reported as three steps rather than one verdict, because a person who has done two of them is
 * owed the truth about which one is outstanding. This says where somebody stands; the money is
 * `lib/incentive`'s business, and BUILD_SPEC §6.4 governs it.
 */
export function aceSteps(
  progress: PathProgress,
  signoff: Signoff,
  monthsAtStandard: number,
  required = 3,
  /**
   * Ace is for roles carrying an individual KPI scorecard. A checklist role is not behind — there
   * is simply nothing to hold at 90%, and saying so is kinder and truer than showing three
   * unticked boxes somebody can never tick.
   */
  scored = true,
): AceStep[] {
  if (!scored) {
    return [{
      label: 'Not a scored role',
      done: false,
      note: 'Ace is for roles with an individual KPI scorecard. This one is a checklist role — if you move into a scored role, the run can start then.',
    }];
  }
  return [
    {
      label: 'Path complete',
      done: progress.pathComplete,
      note: progress.total === 0
        ? 'No path is assigned to this role yet.'
        : `${progress.complete} of ${progress.total} modules.`,
    },
    {
      label: 'Signed off by your manager',
      done: signoff.state === 'signed',
      note: signoff.note,
    },
    {
      label: `${required} closed months at 90%`,
      done: monthsAtStandard >= required,
      note: monthsAtStandard === 0
        ? 'No closed month has held 90% yet.'
        : `${monthsAtStandard} of ${required} so far. A month under 90% starts the run again.`,
    },
  ];
}

export const holdsAce = (steps: AceStep[]): boolean => steps.length > 1 && steps.every(s => s.done);
