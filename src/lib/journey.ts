/**
 * The deployment journey — docs/SPEC_Deployment_Journey.md made executable.
 * Each step has a check that computes its real status from the data, so the journey can't be ticked off by hand.
 */
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import diagnostic from '../../seed/diagnostic.json';
import { DOSES, doseQuestionKeys, type SeedSection } from './doses';

export type StepStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export interface StepDef {
  id: string;
  stage: 0 | 1 | 2 | 3 | 4;
  title: string;
  why: string;              // Claude's one-paragraph explanation of why the step exists
  /** What the leader gets the moment this step is finished. Written as a result, not a task. */
  payoff: string;
  /** Honest minutes. A stressed person needs to know the size of the thing before they start it. */
  minutes: number;
  /** Optional steps never appear as work owed — they are offered where they pay off. */
  optional?: boolean;
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


/**
 * Progress through one dose of the diagnostic. Doses are checked by the same definition that builds
 * them, so a step cannot report done while the interview still has questions in it.
 */
async function doseCheck(tenantId: string, doseId: string): Promise<{ status: StepStatus; detail: string }> {
  const keys = doseQuestionKeys(DOSES[doseId], diagnostic.sections as unknown as SeedSection[]);
  const rows = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, tenantId));
  const done = keys.filter(([sec, q]) =>
    rows.some(r => r.sectionId === sec && r.questionId === q && r.answer.trim())).length;
  if (done === 0) return { status: 'todo', detail: `${keys.length} short questions.` };
  if (done < keys.length) return { status: 'in_progress', detail: `${keys.length - done} left of ${keys.length}.` };
  return { status: 'done', detail: `${keys.length} answered.` };
}

export const STEPS: StepDef[] = [
  {
    id: 'systems', stage: 2, title: 'Connect the systems you already run', href: '/setup/systems',
    optional: true, minutes: 10,
    why: 'Everything in SPEC works without this. Connecting the systems you already run — jobs, financials, safety, clients, payroll — is what stops the numbers being typed in by hand each month.',
    payoff: 'Your numbers arrive on their own instead of being re-typed each month.',
    check: async t => {
      const rows = await db.select().from(schema.systemConnections).where(eq(schema.systemConnections.tenantId, t));
      if (!rows.length) return { status: 'todo', detail: 'Nothing connected yet — everything else still works without it.' };
      const live = rows.filter(r => r.status === 'live').length;
      if (live === rows.length) return { status: 'done', detail: `${live} system${live === 1 ? '' : 's'} feeding numbers automatically.` };
      return { status: 'in_progress', detail: `${rows.length} named, ${live} live.` };
    },
  },
  {
    id: 'pillar_focus', stage: 1, title: "Understand what's driving it", href: '/setup/focus',
    why: "The four questions say where it hurts. This says why — one question for each pillar the business said yes to, so the cause is named before anything is built. It is the shortest step in the journey and the one that decides where the work starts.",
    minutes: 2,
    payoff: 'You can name the actual cause, in a sentence, instead of carrying a vague feeling that something is wrong.',
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
    minutes: 10,
    payoff: 'The business drawn on one page — what it needs, not who happens to be here.',
    check: async t => {
      const roles = await activeRoles(t);
      const managers = roles.filter(r => r.level === 'manager');
      if (roles.length <= 1) return { status: 'todo', detail: 'Start with the three heads under you: Commercial, Operations, Growth.' };
      if (managers.length < 3) return { status: 'in_progress', detail: `${managers.length} of 3 COGS heads (Commercial, Operations, Growth) defined.` };
      return { status: 'done', detail: `${roles.length} roles defined.` };
    },
  },
  {
    id: 'question_zero', stage: 1, title: 'Question Zero — why now?', href: '/setup/expectations#question_zero',
    why: 'If leadership cannot say what number or moment made this worth doing, that is itself information, and the rollout should slow down rather than push on.',
    minutes: 3,
    payoff: 'The reason you started this, written down, for the month you feel like stopping.',
    check: async t => {
      const a = await answered(t, 'question_zero');
      if (!a.length) return { status: 'todo', detail: 'One question, in your own words.' };
      if (a[0].answer.trim().length < 40) return { status: 'in_progress', detail: 'Started. Worth adding the specific number or moment — that is the part you will come back to.' };
      return { status: 'done', detail: a[0].answer.slice(0, 80) + (a[0].answer.length > 80 ? '…' : '') };
    },
  },
  {
    id: 'expectations', stage: 1, title: 'Business expectations', href: '/setup/expectations',
    why: 'What the business does well, what it wants to do well, and what success looks like to the owner decide how SPEC gets applied here. Every KPI proposed later is tuned to these answers.',
    minutes: 8,
    payoff: 'Every KPI proposed from here on is tuned to your business instead of a template.',
    check: async t => {
      const total = GATE_QUESTIONS.length;
      let done = 0;
      for (const [sectionId, questionId] of GATE_QUESTIONS) {
        const rows = await answered(t, sectionId);
        if (rows.some(a => a.questionId === questionId && a.answer.trim())) done += 1;
      }
      if (done === 0) return { status: 'todo', detail: `${total} short questions.` };
      if (done < total) return { status: 'in_progress', detail: `${total - done} left of ${total}.` };
      return { status: 'done', detail: `${total} questions answered — the rest are asked as they're needed.` };
    },
  },
  {
    id: 'commercial', stage: 1, title: 'The cost and revenue base', href: '/setup/expectations?dose=commercial',
    why: 'A gross profit target is only as good as the cost base underneath it. These questions are asked here, before the numbers are set, because a target built on costs nobody has captured is a number that will be missed and nobody will know why.',
    minutes: 15,
    payoff: 'A gross profit target with a real cost base under it, so a miss tells you where it went.',
    check: async t => doseCheck(t, 'commercial'),
  },
  {
    id: 'kpi_inputs', stage: 1, title: 'What you watch, and what clients think', href: '/setup/expectations?dose=kpis',
    why: 'What the leader already looks at, and what clients already think, are the two most reliable sources of a KPI that means something. They are asked immediately before the KPIs so the answers can go straight into them.',
    minutes: 5,
    payoff: 'The numbers you already trust become the numbers the system watches.',
    check: async t => doseCheck(t, 'kpis'),
  },
  {
    id: 'kpis', stage: 1, title: 'KPIs per role — two per pillar', href: '/setup/kpis',
    why: 'Two KPIs per pillar keeps every role simple enough to hold in your head. Targets are negotiated and recorded, not imposed — an agreed number beats a better one nobody owns.',
    minutes: 20,
    payoff: 'Two numbers per pillar per role — small enough that every manager can hold their own job in their head.',
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
      return { status: ok ? 'in_progress' : 'todo', detail: ok ? `${ok} of ${roles.length} roles set. Still to do: ${problems.join(', ')}.` : `Ready to set: ${problems.join(', ')}.` };
    },
  },
  {
    id: 'people', stage: 1, title: 'Put people in the roles', href: '/setup/people',
    minutes: 5,
    payoff: 'Everyone can sign in and see their own scorecard. This is the point the business starts using it.',
    why: 'Names go on the chart first, free and private to you. Sending the invite is a separate step, because that is when a colleague hears about it and when the seat starts being charged.',
    check: async t => {
      const roles = (await activeRoles(t)).filter(r => r.level !== 'staff');
      let placed = 0, invited = 0;
      for (const r of roles) {
        const a = await holder(r.id);
        if (!a) continue;
        placed++;
        if (a.userId) invited++;
      }
      if (!roles.length) return { status: 'todo', detail: 'No roles yet.' };
      if (!placed) return { status: 'todo', detail: 'Write the names in — nothing is sent and nothing is charged.' };
      if (placed < roles.length) return { status: 'in_progress', detail: `${placed} of ${roles.length} roles have someone in them.` };
      if (!invited) return { status: 'in_progress', detail: 'Everyone is pencilled in. Send the invites when you are happy with the chart.' };
      if (invited < placed) return { status: 'in_progress', detail: `${invited} of ${placed} invited.` };
      return { status: 'done', detail: 'Everyone is in and invited.' };
    },
  },
  {
    id: 'strategy', stage: 2, title: 'Where the business is going', href: '/setup/expectations?dose=strategy',
    why: 'The year 2 and year 3 ambition, and what stepping back would actually look like. Asked once the structure exists, because the answers are sharper when the leader can see the business laid out in front of them.',
    minutes: 8,
    payoff: 'A year 2 and year 3 that the org chart in front of you can actually reach.',
    check: async t => doseCheck(t, 'strategy'),
  },
  {
    id: 'cascade', stage: 2, title: 'Managers build their own teams', href: '/org',
    why: 'Each manager repeats roles → KPIs → people for their reports. They meet their own scorecard first, so they understand it scores the role, not them.',
    minutes: 15,
    payoff: 'Your managers running their own teams the same way, without you in the middle of it.',
    check: async t => {
      const roles = await activeRoles(t);
      const subs = roles.filter(r => r.level === 'supervisor' || r.level === 'staff');
      const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, t));
      const accepted = users.filter(u => u.acceptedAt).length;
      if (!subs.length) return { status: 'todo', detail: 'Your managers do this part — they each build their own team the same way.' };
      let filled = 0;
      for (const r of subs) if (await holder(r.id)) filled++;
      return { status: filled === subs.length ? 'done' : 'in_progress', detail: `${filled} of ${subs.length} team roles filled · ${accepted} people signed in.` };
    },
  },
  {
    id: 'rhythm', stage: 3, title: 'How we communicate', href: '/setup/expectations?dose=rhythm',
    why: 'How often the board-style conversation happens, what belongs in it, and what never comes up. Asked while the rhythm is being set, since that is exactly what these answers decide.',
    minutes: 4,
    payoff: 'A standing conversation that handles the business, so problems stop arriving at your desk at random.',
    check: async t => doseCheck(t, 'rhythm'),
  },
  {
    id: 'covenant', stage: 3, title: "Agree how we'll work together", href: '/setup/expectations#covenant',
    why: "This names how the arrangement runs — the scorecard drives the board conversation, the GM runs the business, and if trust is ever in question it gets named directly. It sits here rather than on day one because agreeing to it means more once the system has produced something real.",
    minutes: 3,
    payoff: 'Everyone knows how this runs and what happens when something goes wrong.',
    check: async t => (await answered(t, 'covenant')).length ? { status: 'done', detail: 'Agreed.' } : { status: 'todo', detail: 'Not yet agreed.' },
  },
  {
    id: 'board_setup', stage: 3, title: 'How your board runs', href: '/setup/board',
    minutes: 4,
    payoff: 'Your board pack reports its own governance — who the directors are and whether the board is actually sitting.',
    why: 'The board is the fourth audience on the same data. Setting the cadence and recording the directors means governance is reported alongside the numbers every period, rather than being remembered once a year.',
    check: async t => {
      const dirs = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, t));
      const active = dirs.filter(d => d.active).length;
      const board = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, t))).filter(m => m.type === 'board');
      if (!active && !board.length) return { status: 'todo', detail: 'Cadence, directors, and when the board last met.' };
      if (!active) return { status: 'in_progress', detail: 'Meetings recorded, no directors yet.' };
      if (!board.length) return { status: 'in_progress', detail: `${active} director(s) recorded, no board meeting yet.` };
      return { status: 'done', detail: `${active} director(s) · last met ${board.map(m => m.date).sort().reverse()[0]}.` };
    },
  },
  {
    id: 'first_month', stage: 3, title: 'Score the first month', href: '/',
    why: 'Month one is a baseline, not a verdict. What matters is that every role is scored once and both gates report real numbers, so month two has something to compare against.',
    minutes: 20,
    payoff: 'A real baseline. Not a verdict — the first honest picture of where the business actually is.',
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
      if (!scored && !g) return { status: 'todo', detail: 'Ready when the month is. Nothing to do until then.' };
      if (scored < roles.length || g < 2) return { status: 'in_progress', detail: `${scored} of ${roles.length} roles scored · ${g} of 2 gates entered.` };
      return { status: 'done', detail: 'All roles scored and both gates entered.' };
    },
  },
  {
    id: 'board_output', stage: 3, title: 'Lock the month and approve the board output', href: '/',
    why: 'The board output is generated from the data, never written from memory. Locking the period is what makes month-on-month comparison honest.',
    minutes: 10,
    payoff: 'A board pack generated from your own data, that you did not have to write.',
    check: async t => {
      const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, t));
      const period = periods[0];
      if (!period || period.status !== 'locked') return { status: 'todo', detail: 'Comes at the end of the month, once everything is scored.' };
      const bos = await db.select().from(schema.boardOutputs).where(eq(schema.boardOutputs.periodId, period.id));
      const bo = bos[0];
      return bo?.approvedBy ? { status: 'done', detail: 'Approved.' } : { status: 'in_progress', detail: 'Locked; board output not yet approved.' };
    },
  },
];

/** Plain names. Nobody stressed reads "Deploy into the organisation" and feels calmer. */
export const STAGES: Record<number, string> = {
  0: 'Getting started',
  1: 'Set the business up — about an hour, and it can be split',
  2: 'Hand it to your managers',
  3: 'Run the first month',
  4: 'What good looks like from here',
};

export const MILESTONES = [
  { when: 'Month 1', what: 'All roles scored at least once; both gates reporting real numbers; SOG meeting held every week.' },
  { when: 'Month 3', what: 'No "unknown" items on the cost and revenue coverage checklist; billables/GP lever live; STAR rating assigned monthly.' },
  { when: 'Month 6', what: 'Two consecutive months with every pillar at 90%+, or a named fix per pillar below 90%; the leader\'s time in day-to-day decisions measurably down.' },
  { when: 'Month 12', what: 'Business is SPEC; supervisors signed off as capable; engagement steps down to board-level only.' },
];

/**
 * Nothing in the journey blocks anything else. An earlier build gated every step behind registering
 * Claude, which meant a business owner who had just admitted four things were going wrong was met
 * with fourteen red "Blocked" badges. People arriving here already have enough that is blocked.
 * The order below is the order that works best; it is not a lock.
 */
export async function journeyFor(tenantId: string) {
  const out = [];
  for (const s of STEPS) out.push({ ...s, ...(await s.check(tenantId)) });
  return out;
}

/** The one thing to do next. Optional steps are offered, never queued as work owed. */
export async function nextStep(tenantId: string) {
  const steps = await journeyFor(tenantId);
  return steps.find(s => !s.optional && s.status !== 'done');
}

/** Minutes of required work left — the honest answer to "how much more of this is there?". */
export function minutesLeft(steps: { status: StepStatus; minutes: number; optional?: boolean }[]) {
  return steps.filter(s => !s.optional && s.status !== 'done')
    .reduce((n, s) => n + (s.status === 'in_progress' ? Math.ceil(s.minutes / 2) : s.minutes), 0);
}
