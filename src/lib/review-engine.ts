import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import {
  score, rank, summarise, topAndBacklog, tagTask, bestMatch,
  type Scored, type Summary, type TaskKind, type Bucket,
} from './tasks';
import { howBrief, briefText, type HowBrief } from './how-brief';
import { applyFocus, focusedTitle } from './role-focus';

/**
 * The automation review engine, run against a real business.
 *
 * Reads what SPEC already holds — the chart, the roles, their task lists, their KPIs and which
 * systems are connected — and returns what to automate, what to streamline, and what is the job.
 * Nothing new is asked of the customer, which is the brief's first input rule.
 *
 * Every derivation lives in lib/tasks and lib/how-brief, which touch no database and can be argued
 * with in a test. This file only fetches and assembles.
 */

export interface Candidate extends Scored {
  roleId: string | null;
  roleTitle: string;
  holder: string | null;
  state: string;
  source: string;
  brief: HowBrief;
}

export interface Review {
  summary: Summary;
  /** Ranked, failing KPI first. The ten worth starting on. */
  top: Candidate[];
  /** Everything else that could move, in the same order. Shown as a count, opened on demand. */
  backlog: Candidate[];
  /** The job itself — protected, with what is expected of whoever does it. */
  keepHuman: Candidate[];
  /** Approved items, which IS the build queue. */
  queue: Candidate[];
  /** Roles with no KPI at all, which is its own finding rather than a gap to skip over. */
  rolesWithNoKpi: string[];
  /** Roles with no task list yet — the three questions have not been answered. */
  rolesWithNoTasks: { roleId: string; title: string }[];
  liveSystems: string[];
}

/** The three questions a role-holder answers when nobody has written their tasks down. */
export const THREE_QUESTIONS = [
  'What do you actually do each week?',
  'What takes the longest?',
  'What do you hate doing?',
] as const;

export async function runReview(tenantId: string): Promise<Review> {
  const roles = (await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenantId)))
    .filter(r => r.active);

  const roleIds = roles.map(r => r.id);
  const [tasks, connections, criteria, assignments] = await Promise.all([
    db.select().from(schema.roleTasks).where(eq(schema.roleTasks.tenantId, tenantId)),
    db.select().from(schema.systemConnections).where(eq(schema.systemConnections.tenantId, tenantId)),
    roleIds.length
      ? db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds))
      : Promise.resolve([]),
    roleIds.length
      ? db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, roleIds))
      : Promise.resolve([]),
  ]);

  // Live, owned by the business, never somebody's personal mailbox. See lib/automation-data.
  const liveSystems = [...new Set(
    connections.filter(c => c.status === 'live' && !c.personalFor).map(c => c.category),
  )];

  const holders = await holderNames(tenantId, assignments);
  const byRole = new Map(roles.map(r => [r.id, r]));
  const criterionById = new Map(criteria.map(c => [c.id, c]));

  /*
    Whether the KPI behind a task is being met.

    Null — not scored yet — is a THIRD answer and is never folded into "met". A business in its first
    month has no scores at all, and ranking its tasks as though every KPI were fine would put the
    engine's whole order the wrong way up on the one businesses that need it most.
  */
  const met = await kpiOutcomes(tenantId, criteria.map(c => c.id));

  const candidates: Candidate[] = tasks
    .filter(t => t.state !== 'rejected')
    .map(t => {
      const role = t.roleId ? byRole.get(t.roleId) : undefined;
      const focus = role?.focus ?? null;
      const criterion = t.criterionId ? criterionById.get(t.criterionId) : undefined;

      const scored = score({
        id: t.id,
        name: applyFocus(t.name, focus),
        kind: t.kind as TaskKind,
        hoursPerWeek: t.hoursPerWeek,
        systems: t.systems ? t.systems.split(',').map(s => s.trim()).filter(Boolean) : [],
        kpi: criterion
          ? { text: applyFocus(criterion.text, focus), met: met.get(criterion.id) ?? null }
          : null,
        pain: t.pain,
        critical: t.critical,
      }, liveSystems);

      return {
        ...scored,
        roleId: t.roleId,
        roleTitle: role ? focusedTitle(role.title, focus) : 'The business',
        holder: t.roleId ? holders.get(t.roleId) ?? null : null,
        state: t.state,
        source: t.source,
        brief: howBrief(scored),
      };
    });

  const proposed = candidates.filter(c => c.state === 'proposed' || c.state === 'parked');
  const ranked = rank(proposed);
  const { top, backlog } = topAndBacklog(ranked);

  const withKpi = new Set(criteria.filter(c => c.active).map(c => c.roleId));

  return {
    summary: summarise(roles.length, candidates),
    top,
    backlog,
    keepHuman: candidates.filter(c => c.bucket === 'keep_human'),
    queue: candidates.filter(c => c.state === 'approved'),
    rolesWithNoKpi: roles.filter(r => !withKpi.has(r.id)).map(r => focusedTitle(r.title, r.focus)),
    rolesWithNoTasks: roles
      .filter(r => !tasks.some(t => t.roleId === r.id))
      .map(r => ({ roleId: r.id, title: focusedTitle(r.title, r.focus) })),
    liveSystems,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Is the KPI behind this task being met?
 * ───────────────────────────────────────────────────────────────────────────── */

async function kpiOutcomes(tenantId: string, criterionIds: string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  if (!criterionIds.length) return out;

  const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  if (!periods.length) return out;

  // The most recent closed month. An open month is half-entered by definition, and half-entered
  // numbers would report KPIs as failing that simply have not been filled in yet.
  const closed = periods.filter(p => p.status === 'locked' || p.status === 'submitted')
    .sort((a, b) => b.period.localeCompare(a.period));
  if (!closed.length) return out;

  const results = await db.select().from(schema.assessments)
    .where(eq(schema.assessments.periodId, closed[0].id));

  /*
    Y is met, N is not, and everything else is left out entirely.

    `NA` and a blank are not failures — lib/scoring drops both from the calculation for exactly this
    reason, and a task whose KPI was marked "not tracked" must not be ranked as urgent because the
    engine read a blank as a miss. Leaving the key absent keeps it `null` downstream, which is the
    third answer: nobody has said.
  */
  for (const r of results) {
    if (r.answer === 'Y') out.set(r.criterionId, true);
    else if (r.answer === 'N') out.set(r.criterionId, false);
  }
  return out;
}

async function holderNames(
  tenantId: string,
  assignments: { roleId: string; staffId: string | null; toDate: string | null }[],
): Promise<Map<string, string>> {
  const current = assignments.filter(a => !a.toDate && a.staffId);
  const ids = [...new Set(current.map(a => a.staffId!))];
  const out = new Map<string, string>();
  if (!ids.length) return out;

  const staff = await db.select().from(schema.staff)
    .where(and(eq(schema.staff.tenantId, tenantId), inArray(schema.staff.id, ids)));
  const names = new Map(staff.map(s => [s.id, s.name]));
  for (const a of current) {
    const name = names.get(a.staffId!);
    if (name) out.set(a.roleId, name);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The intake box
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Somebody writes in a want or a gap.
 *
 * Their words are kept exactly as typed — they are evidence, and tidying a complaint into better
 * language is how the reason it mattered gets lost.
 *
 * It either raises the pain on a task that already exists, or becomes a new one. Matching is
 * deliberately simple word overlap: a wrong match is cheap and visible (the entry shows against a
 * task somebody can see is wrong), while a clever match nobody can explain is the sort of thing that
 * quietly buries a complaint under the wrong heading.
 */
export async function addIntake(opts: {
  tenantId: string; byName: string; text: string;
}): Promise<{ matched: boolean; taskId: string }> {
  const text = opts.text.trim();
  const existing = await db.select().from(schema.roleTasks)
    .where(eq(schema.roleTasks.tenantId, opts.tenantId));

  const candidate = bestMatch(text, existing.map(t => ({ id: t.id, name: t.name })));
  const now = new Date().toISOString();

  if (candidate) {
    const task = existing.find(t => t.id === candidate)!;
    await db.update(schema.roleTasks)
      .set({ pain: task.pain + 1 })
      .where(eq(schema.roleTasks.id, candidate));
    await db.insert(schema.intakeEntries).values({
      id: randomUUID(), tenantId: opts.tenantId, byName: opts.byName, text, taskId: candidate, createdAt: now,
    });
    return { matched: true, taskId: candidate };
  }

  /*
    A new task, from somebody's own words, tagged the same way everything else is.

    `source: 'intake'` and `pain: 1` — it hurt enough that somebody wrote it down, which is exactly
    one more signal than a template task starts with. Not attached to a role: whoever wrote it may
    not be the only person doing it, and guessing whose job it is would be the engine deciding
    something about somebody's role from a single sentence.
  */
  const taskId = randomUUID();
  await db.insert(schema.roleTasks).values({
    id: taskId, tenantId: opts.tenantId, roleId: null,
    name: text.slice(0, 200),
    kind: tagTask(text).kind,
    systems: '',
    pain: 1,
    source: 'intake',
    createdAt: now,
  });
  await db.insert(schema.intakeEntries).values({
    id: randomUUID(), tenantId: opts.tenantId, byName: opts.byName, text, taskId, createdAt: now,
  });
  return { matched: false, taskId };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Approve, park, reject
 * ───────────────────────────────────────────────────────────────────────────── */

export type Decision = 'approved' | 'parked' | 'rejected' | 'proposed';

/**
 * The owner decides. Approving generates the brief and puts it in the queue.
 *
 * A rejection REQUIRES a reason, and that is enforced here rather than suggested on the screen. The
 * brief's words: *"Reject → gone, with a one-line reason so the engine learns not to resurface it."*
 * A no with no reason cannot be revisited by anybody later; it can only be re-argued from scratch,
 * which is how a good idea gets rejected twice and a bad one gets approved on the third attempt.
 */
export async function decideTask(opts: {
  tenantId: string; taskId: string; decision: Decision; reason: string | null; by: string;
}): Promise<{ ok: boolean; why?: string }> {
  if (opts.decision === 'rejected' && !opts.reason?.trim()) {
    return { ok: false, why: 'A rejection needs one line saying why, so it can be revisited rather than re-argued.' };
  }

  await db.update(schema.roleTasks).set({
    state: opts.decision,
    rejectedReason: opts.decision === 'rejected' ? opts.reason!.trim() : null,
    decidedBy: opts.by,
    decidedAt: new Date().toISOString(),
  }).where(and(
    eq(schema.roleTasks.id, opts.taskId),
    eq(schema.roleTasks.tenantId, opts.tenantId),
  ));

  return { ok: true };
}

/** The approved brief, as markdown somebody can paste straight into Claude Code. */
export const queueBrief = (c: Candidate): string => briefText(c.brief);

/* ─────────────────────────────────────────────────────────────────────────────
 * The three questions
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Turn a role-holder's three answers into tasks.
 *
 * Each line becomes a task. The "what takes the longest" and "what do you hate doing" answers carry
 * pain, because the person doing the work is the only reliable source for it — and pain is what
 * breaks the tie between two candidates that save the same amount of time.
 */
export async function answerThreeQuestions(opts: {
  tenantId: string; roleId: string; weekly: string; longest: string; hated: string;
}): Promise<number> {
  const lines = (text: string, pain: number) =>
    text.split('\n').map(l => l.trim()).filter(l => l.length > 3).map(name => ({ name, pain }));

  const all = [
    ...lines(opts.weekly, 0),
    ...lines(opts.longest, 1),
    ...lines(opts.hated, 2),
  ];
  if (!all.length) return 0;

  const now = new Date().toISOString();
  await db.insert(schema.roleTasks).values(all.map(t => ({
    id: randomUUID(), tenantId: opts.tenantId, roleId: opts.roleId,
    name: t.name.slice(0, 200),
    kind: tagTask(t.name).kind,
    systems: '',
    pain: t.pain,
    // The person who does the job said it. This outranks anything SPEC guessed from a template.
    source: 'person',
    createdAt: now,
  })));
  return all.length;
}

export type { Bucket };
export { bestMatch };
