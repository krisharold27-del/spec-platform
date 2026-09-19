import { describe, it, expect } from 'vitest';
import { mayShapeChart, reachDown, scoredRolesInScope } from '../src/lib/scope';
import { isScored } from '../src/lib/today-data';

/**
 * ── The founder must not be locked out of their own chart ────────────────────────────────────────
 *
 * Kris, 19 September: *"I still cant change my name in the org chart"*, and then *"i should be the
 * admin as i started the system - Kristopher Harold for JBI"*. Both were the same fault.
 *
 * SPEC decides what somebody may touch by walking DOWN from their own role — the rule the whole
 * product is sold on, and correct. It quietly assumes everybody IS on the chart. An administrator
 * holding no role has nothing to walk down from, so their scope is empty: not one card on the
 * chart can be changed, including the one they should be sitting in, and the only way out is the
 * thing they are locked out of. On day one, the founder of the business is exactly that person.
 *
 * ── Why this is its own rule and not a loosening of `canEdit` ────────────────────────────────────
 *
 * `canEdit` also gates scorecards, KPIs and training — other people's numbers. Widening it so a
 * founder could draw their chart would have handed every administrator a key to all of that, which
 * is the opposite of what SPEC promises. So the chart got its own question, and this holds the line
 * between them: each clause is removed in turn below, and each removal has to break something.
 */

const VISIBLE = new Set(['mine', 'below']);
const ours = (id: string) => ['mine', 'below', 'elsewhere'].includes(id);

describe('who may draw the org chart', () => {
  it('a manager: their own role and the ones beneath it', () => {
    expect(mayShapeChart('full', VISIBLE, ours, 'mine')).toBe(true);
    expect(mayShapeChart('full', VISIBLE, ours, 'below')).toBe(true);
  });

  it('AND NEVER SOMEBODY ELSE’S BRANCH — "managers only have rights to their staff"', () => {
    expect(mayShapeChart('full', VISIBLE, ours, 'elsewhere')).toBe(false);
  });

  /*
    Kris, 19 September, photographing the General Manager card on JBI — "This role is outside your
    part of the chart", above a button offering to ask an administrator for permission: **"i am the
    GM - so how can i ask"**. He IS the administrator. SPEC was inviting him to petition himself.
  */
  it('AN ADMINISTRATOR DRAWS THE WHOLE CHART, including roles above their own', () => {
    expect(mayShapeChart('administrator', VISIBLE, ours, 'elsewhere')).toBe(true);
    expect(mayShapeChart('administrator', new Set(), ours, 'mine')).toBe(true);
  });

  /*
    Each of these is one clause taken away. If any starts passing, the rule has quietly become
    something else.
  */
  it('  but only an ADMINISTRATOR — "full" off its own branch still gets nothing', () => {
    expect(mayShapeChart('full', new Set(), ours, 'mine')).toBe(false);
    expect(mayShapeChart('full', VISIBLE, ours, 'elsewhere')).toBe(false);
  });

  it('  and never a role outside this business', () => {
    expect(mayShapeChart('administrator', new Set(), ours, 'another-company')).toBe(false);
    expect(mayShapeChart('administrator', VISIBLE, ours, 'another-company')).toBe(false);
  });

  it('  and read-only is still read-only', () => {
    expect(mayShapeChart('readonly', new Set(), ours, 'mine')).toBe(false);
    expect(mayShapeChart('readonly', VISIBLE, ours, 'mine')).toBe(false);
  });
});

/**
 * ── Rights over a branch somebody does not sit above ─────────────────────────────────────────────
 *
 * Kris's rule in full, 19 September: *"first person to start is admin rights - then managers only
 * have rights to their staff - if rights are needed then the admin must approve this"*.
 *
 * The middle clause is `reachDown` from your own role. The last clause adds a second starting
 * point: a branch an administrator granted. This is the function that decides who can read whose
 * scorecard, so it is tested on the shape that matters — that a grant reaches exactly one branch
 * and stops.
 */
describe('how far somebody can see', () => {
  const CHART = [
    { id: 'gm', reportsToRoleId: null },
    { id: 'ops', reportsToRoleId: 'gm' },
    { id: 'crew-a', reportsToRoleId: 'ops' },
    { id: 'commercial', reportsToRoleId: 'gm' },
    { id: 'estimator', reportsToRoleId: 'commercial' },
    { id: 'off-chart', reportsToRoleId: null },
  ];

  it('your own role and everybody under it', () => {
    expect([...reachDown(['ops'], CHART)].sort()).toEqual(['crew-a', 'ops']);
  });

  it('A GRANTED BRANCH IS REACHED TOO, and nothing beside it', () => {
    expect([...reachDown(['ops', 'commercial'], CHART)].sort())
      .toEqual(['commercial', 'crew-a', 'estimator', 'ops']);
  });

  it('a grant never reaches UP — managing a branch is not managing the business', () => {
    expect(reachDown(['estimator'], CHART).has('commercial')).toBe(false);
    expect(reachDown(['estimator'], CHART).has('gm')).toBe(false);
  });

  it('no role, no grants, nothing at all', () => {
    expect(reachDown([], CHART).size).toBe(0);
  });

  it('a role that is not in this business is ignored rather than trusted', () => {
    expect(reachDown(['another-company'], CHART).size).toBe(0);
  });

  /*
    A chart that reports to itself is a bug in the data. The right behaviour is to stop, not to
    hang the page somebody was trying to open.
  */
  it('and a chart that loops does not spin', () => {
    const looped = [
      { id: 'a', reportsToRoleId: 'b' },
      { id: 'b', reportsToRoleId: 'a' },
    ];
    expect([...reachDown(['a'], looped)].sort()).toEqual(['a', 'b']);
  });
});

/*
  ── The set a month is marked from has to agree with what counts as scored ──────────────────────

  Kris, having built a team on the chart: *"how do i sign off the team kpi's"*.

  He could not, anywhere in the product. A team node is a role with `isTeam` set, sitting at
  `staff` level because everybody in one is on a team seat — and TWO separate filters excluded
  `staff`: `isScored`, which decides whether a role carries a scorecard, and `scoredRolesInScope`,
  which is the set `/scoring` lists and the roll-up averages over.

  So a team's KPIs could be written on the org chart and then never marked, never rolled up and
  never signed off. Every unit test passed, because they all tested the team layer, which worked.
  Nothing asked whether the rest of the product could see what it produced.

  These two rules are the same question asked of one role and of a set, so they are held to the
  same answer here. A team that is scored but not listed is a scorecard nobody can reach.
*/
describe('which roles a month is marked from', () => {
  const team = { id: 't', title: 'Technicians', level: 'staff', isTeam: true };
  const member = { id: 'm', title: 'Electrician', level: 'staff', isTeam: false };
  const boss = { id: 'b', title: 'Site Supervisor', level: 'supervisor', isTeam: false };
  const scope = {
    roles: [team, member, boss],
    visible: new Set(['t', 'm', 'b']),
  } as unknown as Parameters<typeof scoredRolesInScope>[0];

  it('INCLUDES A TEAM, which is the whole reason a team node exists', () => {
    expect(scoredRolesInScope(scope).map(r => r.id).sort()).toEqual(['b', 't']);
  });

  it('and still leaves an individual team member out — they have a checklist, not a percentage', () => {
    expect(scoredRolesInScope(scope).map(r => r.id)).not.toContain('m');
  });

  /*
    The two rules, side by side. `isScored` says whether a role HAS a scorecard;
    `scoredRolesInScope` says which roles get listed. They disagreed for a day, and the disagreement
    was invisible because each was tested on its own.
  */
  it('AND AGREES WITH isScored ON EVERY ROLE, which is where the two drifted apart', () => {
    const listed = new Set(scoredRolesInScope(scope).map(r => r.id));
    for (const r of [team, member, boss]) {
      expect(listed.has(r.id), `${r.title}`).toBe(isScored(r.level, 4, r.isTeam));
    }
  });
});
