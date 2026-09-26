/**
 * Every job is maintenance or project, and the difference is what has to happen to get paid.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"every job is MAINTENANCE or PROJECT... Maintenance: small and quick; book → do → sign off →
 * invoice the same day; recurring contracts and repeat work. Projects: larger and staged; takeoff
 * or tender → progress claims to the client (Security of Payment) → variations → retentions →
 * defects period. Type set at quote (default: project at $20k+ or when a tender/takeoff is used;
 * editable). The same pipeline and scorecards cover both; project-only steps appear only on
 * projects."*
 *
 * ── Why two types rather than a size field ───────────────────────────────────────────────────────
 *
 * Because it is not really about size. A $40,000 maintenance contract billed monthly and a $40,000
 * switchboard replacement are the same money and completely different jobs: one is invoiced the day
 * the work is done, the other is claimed in stages under legislation, carries variations somebody
 * has to sign, holds retention for a year and has a defects period at the end of it.
 *
 * The dollar threshold below is a DEFAULT, not the definition. It has to be editable because the
 * exceptions are common and obvious — a $60,000 annual service agreement is maintenance, and a
 * $9,000 shop fitout for a builder is a project with a progress claim in it.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────────────────────────────
 *
 * *"project-only steps appear only on projects."* That is the whole simplicity argument against
 * SimPro in one line: a sparkie doing a two-hour service call should never see a retention field.
 * So the steps live here, filtered by type, rather than every screen deciding for itself — eleven
 * screens each making the call is how one of them ends up showing a progress claim on a callback.
 */

export type JobType = 'maintenance' | 'project';

/**
 * Where the type comes from: the job's own work kind, which SPEC already holds.
 *
 * `lib/sectors` has carried `workKind` — maintenance, project, shutdown — since 24 September, and
 * adding a second `jobType` column beside it would give the business two answers to one question.
 * The day they disagreed, a job would be maintenance on the pipeline and a project on the billing
 * screen, and nobody would be able to say which was right.
 *
 * A SHUTDOWN is a project here. `lib/sectors` already says so in as many words — *"a shutdown is a
 * project that cannot slip"* — and everything this file decides is about how the money works, where
 * the fixed date makes no difference at all: it is still claimed in stages, still carries
 * variations, still holds retention.
 */
export const typeOf = (workKind: string | null | undefined): JobType =>
  workKind === 'project' || workKind === 'shutdown' ? 'project' : 'maintenance';

export interface TypeInfo {
  key: JobType;
  label: string;
  /** What it is, in the words a business would use. */
  is: string;
  /** How it gets paid, which is the real difference. */
  paid: string;
}

export const TYPES: TypeInfo[] = [
  {
    key: 'maintenance', label: 'Maintenance',
    is: 'Small and quick. Service calls, breakdowns, repeat work and the jobs on a contract.',
    paid: 'Book it, do it, get it signed off, invoice it the same day.',
  },
  {
    key: 'project', label: 'Project',
    is: 'Larger and staged. Fitouts, installs, upgrades — anything quoted off plans or won on a tender.',
    paid: 'Progress claims to the client under the Security of Payment rules, variations signed as they arise, retention held, and a defects period at the end.',
  },
];

export const typeInfo = (key: JobType): TypeInfo => TYPES.find(t => t.key === key)!;

export const isJobType = (v: string): v is JobType => v === 'maintenance' || v === 'project';

/**
 * The default the business can change, in cents.
 *
 * $20,000 is Kris's number and it is a starting point rather than a rule. A business that mostly
 * does $80,000 solar installs and a business that mostly does $3,000 switchboards would both be
 * wrong about half the time on the same threshold, which is why the answer on the quote is a
 * SUGGESTION with a reason attached rather than a decision made quietly.
 */
export const PROJECT_FROM_CENTS = 20_000_00;

export interface Suggestion {
  type: JobType;
  /** Why SPEC thinks so, said so the estimator can disagree with the reasoning rather than the answer. */
  because: string;
}

/**
 * What type this quote probably is.
 *
 * Suggested and never applied. `lib/certificates` set the rule for a value SPEC offers rather than
 * decides, and it holds here for a smaller reason: a job silently typed as a project grows a
 * retention field the estimator did not ask for, and a job silently typed as maintenance quietly
 * loses the right to make a progress claim.
 */
export function suggest(quote: { valueCents: number; fromTender: boolean; fromTakeoff: boolean }): Suggestion {
  if (quote.fromTender) {
    return { type: 'project', because: 'It came from a tender, and tendered work is claimed in stages.' };
  }
  if (quote.fromTakeoff) {
    return { type: 'project', because: 'It was priced off plans, which nearly always means staged work.' };
  }
  if (quote.valueCents >= PROJECT_FROM_CENTS) {
    return {
      type: 'project',
      because: `It is over $${(PROJECT_FROM_CENTS / 100).toLocaleString('en-AU')}, which is where this business treats work as staged. Change it if this one is not.`,
    };
  }
  return { type: 'maintenance', because: 'Small enough to book, do and invoice in one go.' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What shows on the job
 * ───────────────────────────────────────────────────────────────────────────── */

export type StepKey =
  | 'schedule' | 'do' | 'signoff' | 'invoice'
  | 'takeoff' | 'claim' | 'variation' | 'retention' | 'defects';

export interface JobStep {
  key: StepKey;
  label: string;
  /** Which types this step belongs to. */
  on: readonly JobType[];
  where: string;
}

/**
 * Every step a job can have, and which types carry it.
 *
 * Four are on both, because they are simply what doing work is. Five are project-only, and each one
 * of them is a thing a maintenance tech would be baffled to be shown.
 */
export const STEPS: JobStep[] = [
  { key: 'schedule',  label: 'Book it',            on: ['maintenance', 'project'], where: '/jobs?tab=schedule' },
  { key: 'takeoff',   label: 'Takeoff',            on: ['project'],                where: '/jobs?tab=takeoff' },
  { key: 'do',        label: 'Do the work',        on: ['maintenance', 'project'], where: '/tech-day' },
  { key: 'variation', label: 'Variations',         on: ['project'],                where: '/jobs?tab=billing' },
  { key: 'claim',     label: 'Progress claims',    on: ['project'],                where: '/jobs?tab=billing' },
  { key: 'signoff',   label: 'Customer signs off', on: ['maintenance', 'project'], where: '/tech-day' },
  { key: 'invoice',   label: 'Invoice',            on: ['maintenance', 'project'], where: '/jobs?tab=billing' },
  { key: 'retention', label: 'Retention',          on: ['project'],                where: '/jobs?tab=billing' },
  { key: 'defects',   label: 'Defects period',     on: ['project'],                where: '/jobs?tab=rework' },
];

/** The steps this job actually has. The one function every screen must go through. */
export const stepsFor = (type: JobType): JobStep[] =>
  STEPS.filter(s => s.on.includes(type));

export const showsStep = (type: JobType, key: StepKey): boolean =>
  stepsFor(type).some(s => s.key === key);

export const PROJECT_ONLY = STEPS.filter(s => s.on.length === 1 && s.on[0] === 'project').map(s => s.key);

/* ─────────────────────────────────────────────────────────────────────────────
 * The pipeline switch
 * ───────────────────────────────────────────────────────────────────────────── */

export type Filter = 'all' | JobType;

export const isFilter = (v: string): v is Filter =>
  v === 'all' || isJobType(v);

export const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'project', label: 'Projects' },
];

export const matches = <T extends { workKind?: string | null }>(row: T, filter: Filter): boolean =>
  filter === 'all' || typeOf(row.workKind) === filter;

/**
 * What is on the books, split by type.
 *
 * Worth splitting because the two numbers mean different things to an owner: maintenance on the
 * books is revenue that will land this month, and project work on the books is revenue spread over
 * however long the job runs. One combined figure reads as cash that is coming and is not.
 */
export interface Mix {
  maintenance: { jobs: number; cents: number };
  project: { jobs: number; cents: number };
  says: string;
}

export function mix<T extends { workKind?: string | null; valueCents?: number | null }>(rows: readonly T[]): Mix {
  const sum = (type: JobType) => {
    const mine = rows.filter(r => typeOf(r.workKind) === type);
    return { jobs: mine.length, cents: mine.reduce((a, r) => a + (r.valueCents ?? 0), 0) };
  };
  const maintenance = sum('maintenance');
  const project = sum('project');
  const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-AU')}`;

  if (rows.length === 0) return { maintenance, project, says: 'Nothing on the books yet.' };
  return {
    maintenance, project,
    says: `${money(maintenance.cents)} of maintenance, ${money(project.cents)} of project work. The maintenance lands this month; the project money comes in as the work does.`,
  };
}
