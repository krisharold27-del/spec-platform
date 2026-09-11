/**
 * The week-one cascade — pure functions, no I/O.
 *
 * Five steps, in the only order they work in: what the business is, the roles it needs, the two
 * numbers per pillar each of those roles is measured on, the people who fill them, and then the
 * same five steps handed to each manager for their own part of the chart.
 *
 * Every step's state is COMPUTED from what the business has actually done. Nothing here is a
 * checkbox somebody ticks, because a setup screen that can be ticked without the work being done
 * is a screen that lies to whoever reads it next.
 */

export type StepKey = 'business' | 'roles' | 'kpis' | 'people' | 'cascade';

export interface StepInput {
  /** The business has a name and has answered the AI question. */
  named: boolean;
  tierChosen: boolean;
  roleCount: number;
  /** Roles carrying a scorecard that have two KPIs in every pillar. */
  rolesWithKpis: number;
  scoredRoleCount: number;
  /** Roles with somebody against them, pencilled or invited. */
  rolesFilled: number;
  /** Managers who have been handed their own part of the cascade — anyone invited who can manage. */
  managersHandedOver: number;
  managerCount: number;
}

export interface Step {
  key: StepKey;
  kicker: string;
  label: string;
  done: boolean;
  /** Where it stands, in the words a leader would use. */
  state: string;
  detail: string;
  href: string;
}

export function steps(i: StepInput): Step[] {
  const rolesDone = i.roleCount > 0;
  const kpisDone = i.scoredRoleCount > 0 && i.rolesWithKpis === i.scoredRoleCount;
  const peopleDone = rolesDone && i.rolesFilled === i.roleCount;

  return [
    {
      key: 'business',
      kicker: 'Step 1',
      label: 'The business',
      done: i.named && i.tierChosen,
      state: i.named && i.tierChosen ? 'Done' : 'Waiting',
      detail: i.tierChosen
        ? 'Named, and you have said whether SPEC reads your systems.'
        : 'One question decides the rest: do you want the power of AI? Basic is complete without it.',
      href: '/settings',
    },
    {
      key: 'roles',
      kicker: 'Step 2',
      label: 'Roles it needs',
      done: rolesDone,
      state: rolesDone ? `${i.roleCount} drawn` : 'Nothing drawn',
      detail: rolesDone
        ? 'Roles are defined by what the business needs. A role can exist with nobody in it.'
        : 'Start with what the business needs done, not with who you have. The people come at step 4.',
      href: '/org',
    },
    {
      key: 'kpis',
      kicker: 'Step 3',
      label: 'Two KPIs per pillar',
      done: kpisDone,
      state: i.scoredRoleCount === 0
        ? 'No scored role yet'
        : kpisDone ? 'Done' : `${i.rolesWithKpis} of ${i.scoredRoleCount}`,
      detail: 'SPEC proposes them and the leader edits. A target is agreed with whoever holds the role, never imposed on them.',
      href: '/setup/kpis',
    },
    {
      key: 'people',
      kicker: 'Step 4',
      label: 'People into roles',
      done: peopleDone,
      state: rolesDone ? `${i.rolesFilled} of ${i.roleCount} filled` : 'Draw the roles first',
      detail: 'A name costs nothing and sends nothing. Inviting somebody is the separate act that opens their seat.',
      href: '/org',
    },
    {
      key: 'cascade',
      kicker: 'Step 5',
      label: 'Cascade to managers',
      done: i.managerCount > 0 && i.managersHandedOver === i.managerCount,
      state: i.managerCount === 0
        ? 'No managers yet'
        : `${i.managersHandedOver} of ${i.managerCount}`,
      detail: 'Each manager does the same five steps for their own part of the chart. That is what makes it theirs rather than yours.',
      href: '/team',
    },
  ];
}

/** The step to be on: the first one not finished, or the last when everything is. */
export function currentStep(all: Step[]): Step {
  return all.find(s => !s.done) ?? all[all.length - 1];
}

export function progress(all: Step[]): { done: number; total: number; pct: number } {
  const done = all.filter(s => s.done).length;
  return { done, total: all.length, pct: all.length ? done / all.length : 0 };
}

/**
 * What SPEC is doing at each step, said plainly.
 *
 * It proposes and sense-checks; it never sets. Saying so at every step is the difference between a
 * leader who trusts the numbers and one who suspects the software wrote them.
 */
export const WHAT_SPEC_DOES: Record<StepKey, string> = {
  business: 'Nothing yet. This is you telling SPEC what it is looking at.',
  roles: 'Proposes the roles a business your size and shape usually needs, with a reason against each. You keep or remove.',
  kpis: 'Proposes two measures per pillar from the role’s own purpose, and sense-checks a target that looks unreachable. It never sets one.',
  people: 'Nothing. Who goes where is not a thing software should have an opinion about.',
  cascade: 'Gives each manager the same five steps, scoped to their own part of the chart, and tells you who has finished.',
};
