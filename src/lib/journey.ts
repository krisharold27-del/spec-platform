/**
 * The deployment journey — docs/SPEC_Deployment_Journey.md made executable.
 * Each step has a check that computes its real status from the data, so the journey can't be ticked off by hand.
 */
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import diagnostic from '../../seed/diagnostic.json';

export type StepStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export interface StepDef {
  id: string;
  stage: 0 | 1 | 2 | 3 | 4;
  title: string;
  why: string;              // Claude's one-paragraph explanation of why the step exists
  href: string;
  /** Returns status plus a short "what's missing" line. */
  check: (tenantId: string) => Promise<{ status: StepStatus; detail: string }>;
}

/**
 * The diagnostic questions that genuinely gate progress — everything else is asked later, at the
 * step that uses it. Question Zero has its own journey step, so it is not repeated here.
 * Marked `"gate": true` in seed/diagnostic.json; this list is the same set, kept explicit so the
 * gate cannot drift silently when the seed file is edited.
 */
const GATE_QUESTIONS: [string, string][] = [
  ['org_diagnostic', 'od1'],            // what the business does well today
  ['org_diagnostic', 'od3'],            // year 1 ambition
  ['org_diagnostic', 'od6'],            // same as core competence, or different
  ['financial_truth_matrix', 'ftm1'],   // is the business functioning
  ['financial_truth_matrix', 'ftm2'],   // are the financials functioning
  ['financial_truth_matrix', 'ftm3'],   // numbers bad, or the reading of them
  ['confidence', 'c3'],                 // the one indicator you'd need to know about immediately
];

async function answered(tenantId: string, sectionId: string) {
  return db.select().from(schema.diagnostics).where(and(eq(schema.diagnostics.tenantId, tenantId), eq(schema.diagnostics.sectionId, sectionId)));
}
async function activeRoles(tenantId: string) {
  return db.select().from(schema.roles).where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)));
}
async function holder(roleId: string) {
  const rows = await db.select().from(schema.roleAssignments).where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  return rows[0];
}

export const STEPS: StepDef[] = [
  {
    id: 'claude_registration', stage: 0, title: 'Register Claude', href: '/setup/claude',
    why: 'SPEC is delivered through Claude. Registering it first is the first act of commitment, and it is what lets the rest of the journey run without a consultant in the room.',
    check: async t => {
      const rows = await db.select().from(schema.claudeRegistrations).where(eq(schema.claudeRegistrations.tenantId, t));
      const r = rows[0];
      if (!r) return { status: 'blocked', detail: 'Not registered. The journey stays closed until Claude is in place.' };
      if (!r.seatsConfirmed) return { status: 'in_progress', detail: 'Seats for supervisor level and above not yet confirmed.' };
      return { status: 'done', detail: r.workspaceName ? `Workspace: ${r.workspaceName}` : 'Confirmed' };
    },
  },
  {
    id: 'pillar_focus', stage: 1, title: "Understand what's driving it", href: '/setup/focus',
    why: "The four questions say where it hurts. This says why — one question for each pillar the business said yes to, so the cause is named before anything is built. It is the shortest step in the journey and the one that decides where the work starts.",
    check: async t => {
      const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, t));
      const hurting = rows.filter(r => r.sectionId === 'four_questions' && r.answer === 'yes').map(r => r.questionId);
      if (!hurting.length) return { status: 'done', detail: 'Nothing flagged in the four questions.' };
      const done = hurting.filter(p => rows.some(r => r.sectionId === 'pillar_drilldown' && r.questionId === p && r.answer.trim()));
      if (!done.length) return { status: 'todo', detail: `${hurting.length} pillar(s) flagged: ${hurting.join(', ')}.` };
      if (done.length < hurting.length) return { status: 'in_progress', detail: `${done.length} of ${hurting.length} understood.` };
      return { status: 'done', detail: `Cause named for ${done.join(', ')}.` };
    },
  },
  {
    id: 'roles', stage: 1, title: 'Org chart — roles first', href: '/setup/roles',
    why: 'Roles are defined by what the business needs; people are assigned afterwards. Building the chart empty stops the role being bent around whoever happens to be there.',
    check: async t => {
      const roles = await activeRoles(t);
      const managers = roles.filter(r => r.level === 'manager');
      if (roles.length <= 1) return { status: 'todo', detail: 'Only the top role exists. Add the roles the business needs.' };
      if (managers.length < 3) return { status: 'in_progress', detail: `${managers.length} of 3 COGS heads (Commercial, Operations, Growth) defined.` };
      return { status: 'done', detail: `${roles.length} roles defined.` };
    },
  },
  {
    id: 'question_zero', stage: 1, title: 'Question Zero — why now?', href: '/setup/expectations#question_zero',
    why: 'If leadership cannot say what number or moment made this worth doing, that is itself information, and the rollout should slow down rather than push on.',
    check: async t => {
      const a = await answered(t, 'question_zero');
      if (!a.length) return { status: 'todo', detail: 'Unanswered.' };
      if (a[0].answer.trim().length < 40) return { status: 'in_progress', detail: 'Answer is thin. What was the specific number or moment?' };
      return { status: 'done', detail: a[0].answer.slice(0, 80) + (a[0].answer.length > 80 ? '…' : '') };
    },
  },
  {
    id: 'expectations', stage: 1, title: 'Business expectations', href: '/setup/expectations',
    why: 'What the business does well, what it wants to do well, and what success looks like to the owner decide how SPEC gets applied here. Every KPI proposed later is tuned to these answers.',
    check: async t => {
      const total = GATE_QUESTIONS.length;
      let done = 0;
      for (const [sectionId, questionId] of GATE_QUESTIONS) {
        const rows = await answered(t, sectionId);
        if (rows.some(a => a.questionId === questionId && a.answer.trim())) done += 1;
      }
      if (done === 0) return { status: 'todo', detail: `0 of ${total} questions answered.` };
      if (done < total) return { status: 'in_progress', detail: `${done} of ${total} questions answered.` };
      return { status: 'done', detail: `${total} questions answered — the rest are asked as they're needed.` };
    },
  },
  {
    id: 'kpis', stage: 1, title: 'KPIs per role — two per pillar', href: '/setup/kpis',
    why: 'Two KPIs per pillar keeps every role simple enough to hold in your head. Targets are negotiated and recorded, not imposed — an agreed number beats a better one nobody owns.',
    check: async t => {
      const roles = (await activeRoles(t)).filter(r => r.level !== 'staff');
      let ok = 0; const problems: string[] = [];
      for (const r of roles) {
        const crit = await db.select().from(schema.criteria).where(and(eq(schema.criteria.roleId, r.id), eq(schema.criteria.active, true)));
        const perPillar = ['safety', 'people', 'earnings', 'compliance'].map(p => crit.filter(c => c.pillar === p));
        const sums = perPillar.map(cs => cs.reduce((s, c) => s + c.weight, 0));
        const kpiCounts = perPillar.map(cs => cs.filter(c => c.kpi).length);
        if (sums.every(s => Math.abs(s - 1) < 0.005) && kpiCounts.every(k => k >= 2)) ok++;
        else problems.push(r.title);
      }
      if (!roles.length) return { status: 'todo', detail: 'No roles yet.' };
      if (ok === roles.length) return { status: 'done', detail: `${ok} roles with two KPIs per pillar and weights at 100%.` };
      return { status: ok ? 'in_progress' : 'todo', detail: `Needs work: ${problems.join(', ')}.` };
    },
  },
  {
    id: 'people', stage: 1, title: 'Assign people to roles', href: '/setup/people',
    why: 'Access follows the role: supervisor and above score and write notes; staff see their own checklist. Putting a person in a role is the only way a person enters the system.',
    check: async t => {
      const roles = (await activeRoles(t)).filter(r => r.level !== 'staff');
      let filled = 0;
      for (const r of roles) if (await holder(r.id)) filled++;
      if (!filled) return { status: 'todo', detail: 'No one assigned yet.' };
      if (filled < roles.length) return { status: 'in_progress', detail: `${filled} of ${roles.length} manager-level roles have a person.` };
      return { status: 'done', detail: 'Every manager-level role has a person.' };
    },
  },
  {
    id: 'cascade', stage: 2, title: 'Managers build their own teams', href: '/org',
    why: 'Each manager repeats roles → KPIs → people for their reports. They meet their own scorecard first, so they understand it scores the role, not them.',
    check: async t => {
      const roles = await activeRoles(t);
      const subs = roles.filter(r => r.level === 'supervisor' || r.level === 'staff');
      const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, t));
      const accepted = users.filter(u => u.acceptedAt).length;
      if (!subs.length) return { status: 'todo', detail: 'No supervisor or staff roles yet — managers haven\'t started.' };
      let filled = 0;
      for (const r of subs) if (await holder(r.id)) filled++;
      return { status: filled === subs.length ? 'done' : 'in_progress', detail: `${filled} of ${subs.length} team roles filled · ${accepted} people signed in.` };
    },
  },
  {
    id: 'covenant', stage: 3, title: "Agree how we'll work together", href: '/setup/expectations#covenant',
    why: "This names how the arrangement runs — the scorecard drives the board conversation, the GM runs the business, and if trust is ever in question it gets named directly. It sits here rather than on day one because agreeing to it means more once the system has produced something real.",
    check: async t => (await answered(t, 'covenant')).length ? { status: 'done', detail: 'Agreed.' } : { status: 'todo', detail: 'Not yet agreed.' },
  },
  {
    id: 'first_month', stage: 3, title: 'Score the first month', href: '/',
    why: 'Month one is a baseline, not a verdict. What matters is that every role is scored once and both gates report real numbers, so month two has something to compare against.',
    check: async t => {
      const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, t));
      const period = periods[0];
      if (!period) return { status: 'todo', detail: 'No period open.' };
      const roles = (await activeRoles(t)).filter(r => r.level !== 'staff');
      let scored = 0;
      for (const r of roles) {
        const a = await db.select().from(schema.assessments).where(and(eq(schema.assessments.periodId, period.id), eq(schema.assessments.roleId, r.id)));
        if (a.some(x => x.answer)) scored++;
      }
      const g = (await db.select().from(schema.gates).where(eq(schema.gates.periodId, period.id))).length;
      if (!scored && !g) return { status: 'todo', detail: 'Nothing entered for this period yet.' };
      if (scored < roles.length || g < 2) return { status: 'in_progress', detail: `${scored} of ${roles.length} roles scored · ${g} of 2 gates entered.` };
      return { status: 'done', detail: 'All roles scored and both gates entered.' };
    },
  },
  {
    id: 'board_output', stage: 3, title: 'Lock the month and approve the board output', href: '/',
    why: 'The board output is generated from the data, never written from memory. Locking the period is what makes month-on-month comparison honest.',
    check: async t => {
      const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, t));
      const period = periods[0];
      if (!period || period.status !== 'locked') return { status: 'todo', detail: 'Period still open.' };
      const bos = await db.select().from(schema.boardOutputs).where(eq(schema.boardOutputs.periodId, period.id));
      const bo = bos[0];
      return bo?.approvedBy ? { status: 'done', detail: 'Approved.' } : { status: 'in_progress', detail: 'Locked; board output not yet approved.' };
    },
  },
];

export const STAGES: Record<number, string> = {
  0: 'Sign in and register Claude',
  1: 'Deploy into the organisation (week 1)',
  2: 'Cascade (weeks 1–2)',
  3: 'Run the rhythm (month 1)',
  4: 'Steps that ensure success (months 2–12)',
};

export const MILESTONES = [
  { when: 'Month 1', what: 'All roles scored at least once; both gates reporting real numbers; SOG meeting held every week.' },
  { when: 'Month 3', what: 'No "unknown" items on the cost and revenue coverage checklist; billables/GP lever live; STAR rating assigned monthly.' },
  { when: 'Month 6', what: 'Two consecutive months with every pillar at 90%+, or a named fix per pillar below 90%; the leader\'s time in day-to-day decisions measurably down.' },
  { when: 'Month 12', what: 'Business is SPEC; supervisors signed off as capable; engagement steps down to board-level only.' },
];

export async function journeyFor(tenantId: string) {
  const reg = await STEPS[0].check(tenantId);
  const out = [];
  for (const s of STEPS) {
    const r = await s.check(tenantId);
    // Everything after registration is blocked until registration is done.
    const status: StepStatus = s.stage > 0 && reg.status !== 'done' && r.status === 'todo' ? 'blocked' : r.status;
    out.push({ ...s, status, detail: status === 'blocked' && s.stage > 0 ? 'Register Claude first.' : r.detail });
  }
  return out;
}

export async function nextStep(tenantId: string) {
  return (await journeyFor(tenantId)).find(s => s.status !== 'done');
}
