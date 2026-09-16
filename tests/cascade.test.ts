import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  gapsAgainstGoal, worthCascading, topDown, key, LEVEL_ORDER,
  type CascadeRole, type CascadeRow,
} from '../src/lib/cascade';

/*
  ── Predictive KPIs from the goal ────────────────────────────────────────────────────────────────

  Design export 5: "The goal only means something once it is broken into what each role has to
  actually move. This is that cascade, once structure is approved."

  The honest limit, written down because it decides the shape of everything here: turning free text
  like "margin above 32% every month" into a metric and a number for a Site Supervisor is a
  judgement about a trade, and no amount of arithmetic on an org chart will produce it. Inventing
  one anyway would be the worst failure this feature could have — a confident, specific, wrong
  target that somebody then manages a person against.

  So the cascade proper needs Claude. What the pure half does is the part that is true without one:
  name where the goal has NOBODY MOVING IT, and refuse to guess the number.
*/

const role = (over: Partial<CascadeRole> & { id: string; title: string }): CascadeRole => ({
  stream: 'operations', level: 'supervisor', measured: [], untargeted: [], scored: true, ...over,
});

describe('where the goal has nobody moving it', () => {
  it('names a pillar a scored role has nothing measuring', () => {
    const rows = gapsAgainstGoal([role({ id: 'r1', title: 'Site Supervisor', measured: ['safety', 'people', 'earnings'] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pillar).toBe('compliance');
    expect(rows[0].roleTitle).toBe('Site Supervisor');
  });

  /*
    The refusal is the feature. A row that arrives with a number invites somebody to accept it, and
    this half does not know what the number should be.
  */
  it('REFUSES TO INVENT THE NUMBER', () => {
    const rows = gapsAgainstGoal([role({ id: 'r1', title: 'Site Supervisor', measured: ['safety'] })]);
    expect(rows[0].target).toBe('');
    expect(rows[0].metric).toMatch(/^What would /);
    expect(rows[0].why).toContain('conversation with whoever holds the seat');
  });

  it('says nothing about a role that measures everything', () => {
    const full = role({ id: 'r1', title: 'Head of Operations', measured: ['safety', 'people', 'earnings', 'compliance'] });
    expect(gapsAgainstGoal([full])).toEqual([]);
  });

  it('leaves a checklist role out — it has no scorecard to cascade onto', () => {
    expect(gapsAgainstGoal([role({ id: 'r1', title: 'Team member', scored: false })])).toEqual([]);
  });

  /* One per role. A leader handed fourteen suggestions adopts none of them. */
  it('asks a role one question at a time', () => {
    const rows = gapsAgainstGoal([role({ id: 'r1', title: 'Site Supervisor' })]);
    expect(rows).toHaveLength(1);
  });

  /*
    The quieter finding, and in practice the common one: a business that took the proposed scorecard
    and never had the conversation about the numbers. It scores every month against targets that do
    not exist — the most expensive kind of green.
  */
  it('finds a measure with no number agreed against it', () => {
    const rows = gapsAgainstGoal([role({
      id: 'r1', title: 'Head of Commercial',
      measured: ['safety', 'people', 'earnings', 'compliance'],
      untargeted: [{ pillar: 'earnings', text: 'Monthly revenue at or above target' }],
    })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe('Monthly revenue at or above target');
    expect(rows[0].target, 'and still refuses to invent the number').toBe('');
    expect(rows[0].why).toContain('nobody agreed');
  });

  /*
    Caught by looking at the rendered page: a General Manager with five untargeted KPIs filled the
    whole list and the rest of the chart never appeared. A cascade that only ever talks about the
    top of the business is not a cascade.
  */
  it('does not let one role eat the whole list', () => {
    const rows = gapsAgainstGoal([
      role({
        id: 'gm', title: 'General Manager', level: 'gm',
        measured: ['safety', 'people', 'earnings', 'compliance'],
        untargeted: [
          { pillar: 'people', text: 'One' }, { pillar: 'earnings', text: 'Two' },
          { pillar: 'earnings', text: 'Three' }, { pillar: 'compliance', text: 'Four' },
          { pillar: 'compliance', text: 'Five' },
        ],
      }),
      role({
        id: 'c', title: 'Head of Commercial',
        measured: ['safety', 'people', 'earnings', 'compliance'],
        untargeted: [{ pillar: 'people', text: 'Six' }],
      }),
    ]);
    expect(rows.filter(r => r.roleTitle === 'General Manager')).toHaveLength(1);
    expect(rows.map(r => r.roleTitle)).toContain('Head of Commercial');
  });

  it('never hands over more than a leader will read', () => {
    const many = Array.from({ length: 12 }, (_, i) => role({ id: `r${i}`, title: `Role ${i}` }));
    expect(gapsAgainstGoal(many).length).toBeLessThanOrEqual(6);
    expect(gapsAgainstGoal(many, 3)).toHaveLength(3);
  });
});

describe('what is worth suggesting twice', () => {
  const row = (roleId: string, metric: string): CascadeRow =>
    ({ roleId, roleTitle: 'R', pillar: 'earnings', metric, target: '90%', why: 'because' });

  it('does not suggest a measure the role already has', () => {
    expect(worthCascading([row('r1', 'Billable hours')], [{ roleId: 'r1', metric: 'Billable hours' }])).toEqual([]);
  });

  /*
    Two roles measuring the same thing is normal and often right — an Operations Manager and a Site
    Supervisor can both carry billable hours. What is never right is asking the same person twice.
  */
  it('lets two different roles carry the same measure', () => {
    const out = worthCascading([row('r2', 'Billable hours')], [{ roleId: 'r1', metric: 'Billable hours' }]);
    expect(out).toHaveLength(1);
  });

  it('treats two spellings of one measure as the same measure', () => {
    expect(worthCascading([row('r1', '  billable   HOURS ')], [{ roleId: 'r1', metric: 'Billable hours' }])).toEqual([]);
    expect(key('r1', ' Billable  Hours ')).toBe(key('r1', 'billable hours'));
  });

  it('does not repeat itself within one reading', () => {
    expect(worthCascading([row('r1', 'Billable hours'), row('r1', 'Billable hours')], [])).toHaveLength(1);
  });
});

describe('the order, which is the argument', () => {
  /*
    "Net profit 10%" sits with the General Manager and means nothing on its own. It becomes real one
    level at a time, and reading it from the top is what shows a supervisor why their billable hours
    ARE the goal rather than a number somebody made up.
  */
  it('reads from the top of the chart down', () => {
    const roles = [
      role({ id: 's', title: 'Site Supervisor', level: 'supervisor' }),
      role({ id: 'g', title: 'General Manager', level: 'gm' }),
      role({ id: 'm', title: 'Head of Operations', level: 'manager' }),
    ];
    const rows = roles.map(r => ({ roleId: r.id, roleTitle: r.title, pillar: 'earnings' as const, metric: 'm', target: '1', why: 'w' }));
    expect(topDown(rows, roles).map(r => r.roleTitle))
      .toEqual(['General Manager', 'Head of Operations', 'Site Supervisor']);
  });

  it('knows every level the product uses', () => {
    for (const level of ['director', 'gm', 'manager', 'supervisor', 'staff']) {
      expect(LEVEL_ORDER).toContain(level);
    }
  });

  it('is stable when two roles sit at the same level', () => {
    const roles = [
      role({ id: 'b', title: 'Zeta', level: 'manager' }),
      role({ id: 'a', title: 'Alpha', level: 'manager' }),
    ];
    const rows = roles.map(r => ({ roleId: r.id, roleTitle: r.title, pillar: 'people' as const, metric: 'm', target: '1', why: 'w' }));
    expect(topDown(rows, roles).map(r => r.roleTitle)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('what the product does with a row', () => {
  const data = readFileSync('src/lib/cascade-data.ts', 'utf8');
  const panel = readFileSync('src/components/cascade.tsx', 'utf8');
  const page = readFileSync('src/app/org/page.tsx', 'utf8');
  const actions = readFileSync('src/app/org/cascade-actions.ts', 'utf8');

  it('is on the org chart, under the structure it depends on', () => {
    expect(page).toContain('<Cascade');
    expect(page).toContain('cascadeFor(');
    // "This is that cascade, once structure is approved" — the roles question comes first.
    expect(page.indexOf('<PredictedRoles')).toBeLessThan(page.indexOf('<Cascade'));
  });

  /*
    The promise the whole product rests on: "a target is agreed with whoever holds the role, never
    imposed on them." A cascade that wrote the agreed target would break that AND quietly corrupt
    the governance number that reports how many targets were agreed exactly as proposed.
  */
  it('ADOPTS A NUMBER AS PROPOSED, NEVER AS AGREED', () => {
    expect(data).toContain('target: null,');
    expect(data).toContain('proposedTarget: row.target || null,');
    expect(panel).toContain('never agreed');
  });

  it('leaves the pillar weights summing to one', () => {
    expect(data).toContain('weight: 1 / (inPillar.length + 1)');
    expect(data, 'and rebalances what was already there').toContain('Rebalance the rest of the pillar');
  });

  it('remembers a refusal instead of deleting it', () => {
    expect(data).toContain("state: 'dismissed'");
    expect(data).not.toMatch(/delete\(schema\.cascadeKpis\)/);
  });

  it('checks every role id the model returns against the ones it was given', () => {
    expect(data).toContain('byId.get(p.roleId)');
    expect(data).toContain('if (!role) continue;');
  });

  /* Without a goal there is nothing to break down, and the model would invent one to cascade from. */
  it('will not cascade before the goals are set', () => {
    expect(data).toContain('if (goals.length === 0) return [];');
    expect(panel).toContain('Set the goals');
  });

  /*
    The limitation, said out loud. Naming where the goal is at risk is true and checkable; claiming
    it is the cascade would not be. Saying which one you are looking at is the difference between a
    limitation and a lie.
  */
  it('says when it is the smaller reading rather than the real one', () => {
    expect(panel).toContain('SPEC will not invent the number');
    // And names BOTH findings. The caption described only the missing pillar while the list was
    // full of untargeted measures — a caption that does not match its own list.
    expect(panel).toContain('a pillar with nothing measuring it');
    expect(panel).toContain('no number agreed against it');
    expect(data).toContain('fromClaude');
  });

  it('needs manage rights to put a measure on somebody', () => {
    // requireManager is where canManage now lives — plus the look-around refusal, which
    // used to bounce a visitor to a sign-in page with nothing said. See lib/guard.
    expect(actions).toContain('requireManager');
    expect(actions).toContain('assertWritable');
  });
});
