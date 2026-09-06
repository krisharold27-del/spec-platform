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
  check: (tenantId: string) => { status: StepStatus; detail: string };
}

const WEEK1_SECTIONS = ['org_diagnostic', 'financial_truth_matrix', 'success', 'commercial_reality', 'timeline', 'confidence', 'trust', 'communication', 'nps'];

function answered(tenantId: string, sectionId: string) {
  return db.select().from(schema.diagnostics).where(and(eq(schema.diagnostics.tenantId, tenantId), eq(schema.diagnostics.sectionId, sectionId))).all();
}
function questionCount(sectionId: string) {
  const s = (diagnostic.sections as { id: string; questions?: unknown[] }[]).find(x => x.id === sectionId);
  return s?.questions?.length ?? 0;
}
function activeRoles(tenantId: string) {
  return db.select().from(schema.roles).where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true))).all();
}
function holder(roleId: string) {
  return db.select().from(schema.roleAssignments).where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate))).get();
}

export const STEPS: StepDef[] = [
  {
    id: 'claude_registration', stage: 0, title: 'Register Claude', href: '/setup/claude',
    why: 'SPEC is delivered through Claude. Registering it first is the first act of commitment, and it is what lets the rest of the journey run without a consultant in the room.',
    check: t => {
      const r = db.select().from(schema.claudeRegistrations).where(eq(schema.claudeRegistrations.tenantId, t)).get();
      if (!r) return { status: 'blocked', detail: 'Not registered. The journey stays closed until Claude is in place.' };
      if (!r.seatsConfirmed) return { status: 'in_progress', detail: 'Seats for supervisor level and above not yet confirmed.' };
      return { status: 'done', detail: r.workspaceName ? `Workspace: ${r.workspaceName}` : 'Confirmed' };
    },
  },
  {
    id: 'question_zero', stage: 1, title: 'Question Zero — why now?', href: '/setup/expectations#question_zero',
    why: 'If leadership cannot say what number or moment made this worth doing, that is itself information, and the rollout should slow down rather than push on.',
    check: t => {
      const a = answered(t, 'question_zero');
      if (!a.length) return { status: 'todo', detail: 'Unanswered.' };
      if (a[0].answer.trim().length < 40) return { status: 'in_progress', detail: 'Answer is thin. What was the specific number or moment?' };
      return { status: 'done', detail: a[0].answer.slice(0, 80) + (a[0].answer.length > 80 ? '…' : '') };
    },
  },
  {
    id: 'expectations', stage: 1, title: 'Business expectations', href: '/setup/expectations',
    why: 'What the business does well, what it wants to do well, and what success looks like to the owner decide how SPEC gets applied here. Every KPI proposed later is tuned to these answers.',
    check: t => {
      const total = WEEK1_SECTIONS.reduce((s, id) => s + questionCount(id), 0);
      const done = WEEK1_SECTIONS.reduce((s, id) => s + answered(t, id).filter(a => a.answer.trim()).length, 0);
      if (done === 0) return { status: 'todo', detail: `0 of ${total} questions answered.` };
      if (done < total) return { status: 'in_progress', detail: `${done} of ${total} questions answered.` };
      return { status: 'done', detail: `${total} questions answered.` };
    },
  },
  {
    id: 'covenant', stage: 1, title: 'Accept the leadership covenant', href: '/setup/expectations#covenant',
    why: 'The covenant names how this arrangement works and the three ways it typically breaks down. Naming them now means they are recognised as known patterns later, not personal conflicts.',
    check: t => answered(t, 'covenant').length ? { status: 'done', detail: 'Accepted.' } : { status: 'todo', detail: 'Not yet accepted.' },
  },
  {
    id: 'roles', stage: 1, title: 'Org chart — roles first', href: '/setup/roles',
    why: 'Roles are defined by what the business needs; people are assigned afterwards. Building the chart empty stops the role being bent around whoever happens to be there.',
    check: t => {
      const roles = activeRoles(t);
      const managers = roles.filter(r => r.level === 'manager');
      if (roles.length <= 1) return { status: 'todo', detail: 'Only the top role exists. Add the roles the business needs.' };
      if (managers.length < 3) return { status: 'in_progress', detail: `${managers.length} of 3 COGS heads (Commercial, Operations, Growth) defined.` };
      return { status: 'done', detail: `${roles.length} roles defined.` };
    },
  },
  {
    id: 'kpis', stage: 1, title: 'KPIs per role — two per pillar', href: '/setup/kpis',
    why: 'Two KPIs per pillar keeps every role simple enough to hold in your head. Targets are negotiated and recorded, not imposed — an agreed number beats a better one nobody owns.',
    check: t => {
      const roles = activeRoles(t).filter(r => r.level !== 'staff');
      let ok = 0; const problems: string[] = [];
      for (const r of roles) {
        const crit = db.select().from(schema.criteria).where(and(eq(schema.criteria.roleId, r.id), eq(schema.criteria.active, true))).all();
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
    check: t => {
      const roles = activeRoles(t).filter(r => r.level !== 'staff');
      const filled = roles.filter(r => holder(r.id)).length;
      if (!filled) return { status: 'todo', detail: 'No one assigned yet.' };
      if (filled < roles.length) return { status: 'in_progress', detail: `${filled} of ${roles.length} manager-level roles have a person.` };
      return { status: 'done', detail: 'Every manager-level role has a person.' };
    },
  },
  {
    id: 'cascade', stage: 2, title: 'Managers build their own teams', href: '/org',
    why: 'Each manager repeats roles → KPIs → people for their reports. They meet their own scorecard first, so they understand it scores the role, not them.',
    check: t => {
      const roles = activeRoles(t);
      const subs = roles.filter(r => r.level === 'supervisor' || r.level === 'staff');
      const accepted = db.select().from(schema.users).where(eq(schema.users.tenantId, t)).all().filter(u => u.acceptedAt).length;
      if (!subs.length) return { status: 'todo', detail: 'No supervisor or staff roles yet — managers haven\'t started.' };
      const filled = subs.filter(r => holder(r.id)).length;
      return { status: filled === subs.length ? 'done' : 'in_progress', detail: `${filled} of ${subs.length} team roles filled · ${accepted} people signed in.` };
    },
  },
  {
    id: 'first_month', stage: 3, title: 'Score the first month', href: '/',
    why: 'Month one is a baseline, not a verdict. What matters is that every role is scored once and both gates report real numbers, so month two has something to compare against.',
    check: t => {
      const period = db.select().from(schema.periods).where(eq(schema.periods.tenantId, t)).get();
      if (!period) return { status: 'todo', detail: 'No period open.' };
      const roles = activeRoles(t).filter(r => r.level !== 'staff');
      const scored = roles.filter(r => db.select().from(schema.assessments).where(and(eq(schema.assessments.periodId, period.id), eq(schema.assessments.roleId, r.id))).all().some(a => a.answer)).length;
      const g = db.select().from(schema.gates).where(eq(schema.gates.periodId, period.id)).all().length;
      if (!scored && !g) return { status: 'todo', detail: 'Nothing entered for this period yet.' };
      if (scored < roles.length || g < 2) return { status: 'in_progress', detail: `${scored} of ${roles.length} roles scored · ${g} of 2 gates entered.` };
      return { status: 'done', detail: 'All roles scored and both gates entered.' };
    },
  },
  {
    id: 'board_output', stage: 3, title: 'Lock the month and approve the board output', href: '/',
    why: 'The board output is generated from the data, never written from memory. Locking the period is what makes month-on-month comparison honest.',
    check: t => {
      const period = db.select().from(schema.periods).where(eq(schema.periods.tenantId, t)).get();
      if (!period || period.status !== 'locked') return { status: 'todo', detail: 'Period still open.' };
      const bo = db.select().from(schema.boardOutputs).where(eq(schema.boardOutputs.periodId, period.id)).get();
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

export function journeyFor(tenantId: string) {
  const reg = STEPS[0].check(tenantId);
  return STEPS.map(s => {
    const r = s.check(tenantId);
    // Everything after registration is blocked until registration is done.
    const status: StepStatus = s.stage > 0 && reg.status !== 'done' && r.status === 'todo' ? 'blocked' : r.status;
    return { ...s, status, detail: status === 'blocked' && s.stage > 0 ? 'Register Claude first.' : r.detail };
  });
}

export function nextStep(tenantId: string) {
  return journeyFor(tenantId).find(s => s.status !== 'done');
}
