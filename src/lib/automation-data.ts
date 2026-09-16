import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import {
  assess, reviewRole, saving,
  type Measure, type Assessment, type RoleReview, type Saving, type Verdict,
} from './automation';
import { applyFocus, focusedTitle } from './role-focus';
import type { Pillar } from './scoring';

/**
 * Reading the business, so the automation review can be computed rather than remembered.
 *
 * ── Four tables, once each ───────────────────────────────────────────────────────────────────────
 *
 * Roles, criteria, live system connections, and whatever the leader has already decided. Everything
 * else is derived in lib/automation, which touches no database and can be argued with in a test.
 *
 * The obvious alternative — call the scorecard machinery per role — was what an earlier feature in
 * this codebase did, and it turned one screen into forty round trips on a forty-role business. Four
 * reads, whatever the size of the chart.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Does a number already arrive on its own?
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Which kind of system would hold the numbers behind a measure.
 *
 * This is a reading of English and it is only ever used to decide whether to PROPOSE `automated`
 * rather than `assisted` — never to decide anything on its own. Null means SPEC has no idea, which
 * is the safe answer: the measure then proposes as `assisted` at best, and a person still has to
 * look at it.
 */
export function likelySystem(text: string): string | null {
  const t = text.toLowerCase();
  if (/incident|hazard|near miss|induction|licence|license|ticket|training record|safety/.test(t)) return 'safety';
  if (/quote|conversion|enquir|lead|client|customer|review|crm|pipeline|prospect/.test(t)) return 'crm';
  if (/revenue|invoice|margin|profit|cost|debtor|creditor|p&l|gross/.test(t)) return 'financials';
  if (/timesheet|job |jobs|schedul|utilisation|billable|work in progress|wip/.test(t)) return 'job_management';
  if (/leave|turnover|payroll|headcount|staffed|roster/.test(t)) return 'payroll';
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The review
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * One measure, assessed, still carrying the criterion it came from.
 *
 * The id travels WITH the line rather than being matched back up by array position afterwards.
 * Position-matching worked and would have kept working right up until somebody filtered or sorted
 * one of the two arrays — at which point a leader's decision would be written against a different
 * person's measure, silently, with no error anywhere. That is not a risk worth carrying to save a
 * field.
 */
export type ReviewedMeasure = Measure & Assessment & { criterionId: string };

export interface RoleLine {
  roleId: string;
  /** The title as the business would say it — "Sales Supervisor — Solar". */
  title: string;
  level: string;
  stream: string;
  /** Who holds it, when somebody does. Shown so a leader is never discussing an abstraction. */
  holder: string | null;
  review: RoleReview;
  /** The same lines as `review.lines`, typed so each one still knows its criterion. */
  measures: ReviewedMeasure[];
  saving: Saving;
  /** Measures the leader has answered, out of the total. Undecided is a state, not agreement. */
  decided: number;
}

export interface AutomationReview {
  roles: RoleLine[];
  /** Business-wide, counted the same careful way: only hours somebody actually stated. */
  total: Saving;
  /** Roles where every measure could move. A conversation to have WITH them, not about them. */
  wholeRoles: RoleLine[];
  /** Categories of system that are live, so the screen can say why something reads as it does. */
  liveSystems: string[];
  /** True when the business has connected nothing — in which case nothing can read as automated. */
  nothingConnected: boolean;
}

export async function automationReview(tenantId: string, hourlyRate: number | null = null): Promise<AutomationReview> {
  const roles = (await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenantId)))
    .filter(r => r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!roles.length) {
    return { roles: [], total: saving([], hourlyRate), wholeRoles: [], liveSystems: [], nothingConnected: true };
  }

  const roleIds = roles.map(r => r.id);
  const [criteria, connections, decisions, assignments] = await Promise.all([
    db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds)),
    db.select().from(schema.systemConnections).where(eq(schema.systemConnections.tenantId, tenantId)),
    db.select().from(schema.roleAutomation).where(eq(schema.roleAutomation.tenantId, tenantId)),
    db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, roleIds)),
  ]);

  /*
    Live, belonging to the business, and not merely listed.

    Two filters, and both were learned the hard way.

    **Live.** A connection sitting at `requested` or `broken` feeds nothing. Counting it would mean
    proposing "a process can do this end to end" about a number still being typed in by hand.

    **Not personal.** `personalFor` marks a connection that belongs to ONE PERSON rather than to the
    business — a mailbox, which is nobody's to switch on but their own. This file read every row
    until tests/mail.test.ts caught it, which is exactly what that test exists for. Counting
    somebody's own mailbox as a business system would have been bad on its own; doing it HERE, on
    the one page that weighs up whether their job could be a process, would have meant their private
    connection quietly arguing for their redundancy. There is no version of that which is acceptable.
  */
  const liveSystems = [...new Set(
    connections.filter(c => c.status === 'live' && !c.personalFor).map(c => c.category),
  )];
  const live = new Set(liveSystems);

  const decidedBy = new Map(decisions.map(d => [d.criterionId, d]));
  const holders = new Map<string, string>();
  for (const a of assignments) {
    if (a.toDate) continue;
    if (a.staffId) holders.set(a.roleId, a.staffId);
  }
  const staffNames = new Map<string, string>();
  const staffIds = [...new Set([...holders.values()])];
  if (staffIds.length) {
    for (const s of await db.select().from(schema.staff).where(inArray(schema.staff.id, staffIds))) {
      staffNames.set(s.id, s.name);
    }
  }

  const out: RoleLine[] = [];
  for (const role of roles) {
    const mine = criteria.filter(c => c.roleId === role.id && c.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const measures: (Measure & { criterionId: string })[] = mine.map(c => {
      const category = likelySystem(c.text);
      return {
        criterionId: c.id,
        // The business's own word for what this role covers, put where the template left a gap.
        text: applyFocus(c.text, role.focus),
        pillar: c.pillar as Pillar,
        kpi: c.kpi,
        target: c.target,
        proposedTarget: c.proposedTarget,
        fedBySystem: category !== null && live.has(category),
        hoursPerMonth: decidedBy.get(c.id)?.hoursPerMonth ?? undefined,
      };
    });

    const title = focusedTitle(role.title, role.focus);
    const review = reviewRole(title, measures);

    /*
      The leader's answer replaces SPEC's, and the headline has to be recomputed from the result.

      Overriding the lines but leaving the headline as SPEC first wrote it would produce a page that
      contradicts itself — "3 of 6 could come off a person's plate" above six lines a person has
      since marked as theirs. That exact contradiction has been shipped twice in this codebase.
    */
    const overridden = review.lines.map((l, i) => {
      const d = decidedBy.get(measures[i].criterionId);
      if (!d) return l;
      return { ...l, verdict: d.verdict as Verdict, why: d.note?.trim() || `Decided by ${d.decidedBy}.` };
    });
    const settled: ReviewedMeasure[] = overridden.map((l, i) => ({ ...measures[i], ...l }));
    const counts = countOf(settled);
    const final: RoleReview = {
      ...reviewRole(title, settled),
      lines: settled,
      counts,
      everyMeasureCouldMove: settled.length > 0 && counts.person === 0 && counts.unknown === 0,
    };

    out.push({
      roleId: role.id,
      title,
      level: role.level,
      stream: role.stream,
      holder: staffNames.get(holders.get(role.id) ?? '') ?? null,
      review: final,
      measures: settled,
      saving: saving(settled, hourlyRate),
      decided: mine.filter(c => decidedBy.has(c.id)).length,
    });
  }

  const everyLine = out.flatMap(r => r.review.lines);
  return {
    roles: out,
    total: saving(everyLine, hourlyRate),
    wholeRoles: out.filter(r => r.review.everyMeasureCouldMove),
    liveSystems,
    nothingConnected: liveSystems.length === 0,
  };
}

function countOf(lines: Assessment[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { person: 0, assisted: 0, automated: 0, unknown: 0 };
  for (const l of lines) counts[l.verdict] += 1;
  return counts;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Recording a decision
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The leader's answer about one measure.
 *
 * `hours` is the only number SPEC will ever turn into money, so it is taken exactly as given and
 * nothing is inferred from a blank. Clearing the answer removes the row rather than writing an
 * "undecided" one: undecided is the absence of a decision, and a row saying so would be a decision.
 */
export async function decide(opts: {
  tenantId: string;
  criterionId: string;
  verdict: Verdict | null;
  hours: number | null;
  note: string | null;
  by: string;
}): Promise<void> {
  const existing = await db.select().from(schema.roleAutomation)
    .where(and(
      eq(schema.roleAutomation.tenantId, opts.tenantId),
      eq(schema.roleAutomation.criterionId, opts.criterionId),
    ));

  if (!opts.verdict) {
    if (existing.length) {
      await db.delete(schema.roleAutomation).where(eq(schema.roleAutomation.id, existing[0].id));
    }
    return;
  }

  const row = {
    verdict: opts.verdict,
    hoursPerMonth: opts.hours,
    note: opts.note?.trim() || null,
    decidedBy: opts.by,
    decidedAt: new Date().toISOString(),
  };

  if (existing.length) {
    await db.update(schema.roleAutomation).set(row).where(eq(schema.roleAutomation.id, existing[0].id));
    return;
  }
  await db.insert(schema.roleAutomation).values({
    id: randomUUID(), tenantId: opts.tenantId, criterionId: opts.criterionId, ...row,
  });
}

/** What SPEC would say, for a screen that wants to show the proposal beside the decision. */
export const proposalFor = (m: Measure): Assessment => assess(m);
