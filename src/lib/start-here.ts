/**
 * The one thing a business has not done yet, said on the page they open every morning.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * The org chart is not a feature of SPEC, it is the foundation of it: roles report to roles, every
 * score rolls up the lines drawn there, and nothing else in the product means anything until it
 * exists. Link, then Flow, then Grow — in that order, always.
 *
 * And it was reachable from a one-time welcome banner and a list at the BOTTOM of My Page. A new
 * customer who closed that banner, or came back the next morning, had to know to scroll past their
 * whole day to find the thing they were supposed to do first. Kris found it hard to locate and he
 * built the business — a GM at JBI Electrical on a phone has no chance.
 *
 * So while the foundation is missing, it leads the page. Not a nag: it disappears the moment the
 * step is done, and each step only appears once the one before it is finished, which is the same
 * order the method insists on.
 *
 * Deliberately at most ONE step at a time. A list of five things to do is a list nobody starts.
 */

export type StartStep = 'chart' | 'kpis' | null;

export interface StartState {
  /** People written onto the chart — a name counts, an invitation is not required. */
  onChart: number;
  /** Roles that carry an individual scorecard and have their two measures per pillar set. */
  scoredRoles: number;
  rolesWithKpis: number;
}

export interface StartHere {
  step: Exclude<StartStep, null>;
  title: string;
  why: string;
  action: string;
  href: string;
}

/**
 * What to do first, or nothing at all.
 *
 * Returns null once the business is standing on its own, which is the point — this is scaffolding
 * for the first week and must not become furniture.
 */
export function startHere(state: StartState): StartHere | null {
  /*
    A business is "drawn" once somebody other than the person who signed up is on the chart. One
    name is what provisioning creates for the signer, so one name means nothing has been added.

    This asks about NAMES rather than seats on purpose: writing the business down is free, costs
    nobody a licence, and is the step. Waiting until people are invited would hold the prompt open
    for weeks and confuse "we have not drawn it" with "we have not paid for it".
  */
  if (state.onChart <= 1) {
    return {
      step: 'chart',
      title: 'Start here — write down who does what',
      why: 'SPEC scores roles, not people, so the chart is what everything else hangs off. Nobody is emailed and nothing is charged: a name on the chart is just a name until you choose to invite them. It takes a few minutes and it is the step that makes the rest of this page mean something.',
      action: 'Build the org chart',
      href: '/org',
    };
  }

  /*
    Then the measures. A chart with no KPIs draws four empty lights and looks like a bad month
    rather than an unfinished setup — which is the single most demoralising thing a new customer
    could see on day two.
  */
  if (state.scoredRoles > 0 && state.rolesWithKpis === 0) {
    return {
      step: 'kpis',
      title: 'Next — give each role its numbers',
      why: 'Two measures per pillar, agreed with the person who holds the role rather than handed to them. Until a role has its numbers there is nothing to score, and your page stays empty.',
      action: 'Set the KPIs',
      href: '/setup/kpis',
    };
  }

  return null;
}
