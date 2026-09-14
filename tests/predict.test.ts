import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  structuralGaps, worthProposing, normaliseTitle, SPAN_LIMIT,
  type RoleShape,
} from '../src/lib/predict';

/*
  ── Predicted roles: what this chart is missing ──────────────────────────────────────────────────

  Design export 5: "Claude's read of what this structure is still missing. Nothing here counts as
  real until you say so — approve to add it to the chart, deny to drop it."

  Claude is genuinely better at this than arithmetic is — it knows an electrical contractor at forty
  people needs a yard lead. But SPEC Basic is a complete way to run the system, not a crippled one,
  and a business with no API key still has holes in its chart. So the findings tested here are the
  ones that are ARITHMETIC on the leader's own chart: right or wrong for a reason anybody can check
  by looking. Claude's reading layers on top, never instead.
*/

const role = (over: Partial<RoleShape> & { id: string; title: string }): RoleShape => ({
  stream: 'operations', level: 'supervisor', reportsToRoleId: null, pillars: [], filled: true, ...over,
});

/** A business with all three streams owned and every pillar measured — nothing to find. */
const complete = (): RoleShape[] => [
  role({ id: 'gm', title: 'General Manager', level: 'gm', stream: 'gm' }),
  role({ id: 'c', title: 'Head of Commercial', level: 'manager', stream: 'commercial', reportsToRoleId: 'gm', pillars: ['earnings', 'compliance'] }),
  role({ id: 'o', title: 'Head of Operations', level: 'manager', stream: 'operations', reportsToRoleId: 'gm', pillars: ['safety', 'people'] }),
  role({ id: 'g', title: 'Head of Growth', level: 'manager', stream: 'growth', reportsToRoleId: 'gm', pillars: ['earnings'] }),
];

describe('what the chart itself says is missing', () => {
  it('finds nothing in a business that is already drawn properly', () => {
    expect(structuralGaps(complete())).toEqual([]);
  });

  it('says nothing at all about an empty business', () => {
    // Proposing four roles to somebody who has not drawn one yet is not help, it is a wizard.
    expect(structuralGaps([])).toEqual([]);
  });

  /*
    The sharpest finding there is. The whole model rests on "who owns the numbers" having exactly
    one answer per stream, so a stream with no head means a quarter of the business has nobody
    accountable for it.
  */
  it('finds a stream nobody owns', () => {
    const roles = complete().filter(r => r.id !== 'o');
    const found = structuralGaps(roles);
    expect(found.map(p => p.title)).toContain('Head of Operations');
    expect(found[0].stream).toBe('operations');
    expect(found[0].level).toBe('manager');
  });

  it('says how many roles are sitting in an unowned stream', () => {
    const roles = [
      ...complete().filter(r => r.id !== 'o'),
      role({ id: 's1', title: 'Site Supervisor', stream: 'operations' }),
      role({ id: 's2', title: 'Scheduler', stream: 'operations' }),
    ];
    const found = structuralGaps(roles);
    const ops = found.find(p => p.title === 'Head of Operations')!;
    expect(ops.why).toContain('2 roles sit');
  });

  /*
    Not the same as a pillar scoring badly. This is a pillar the business is not LOOKING at, which
    shows up as grey on every card rather than as a problem — and grey is the easiest thing on a
    chart to stop noticing.
  */
  it('finds a pillar nobody measures', () => {
    const roles = complete().map(r => (r.id === 'o' ? { ...r, pillars: ['people' as const] } : r));
    const found = structuralGaps(roles);
    expect(found.some(p => p.why.includes('Safety'))).toBe(true);
  });

  it('does not call a pillar unmeasured in a business that measures nothing yet', () => {
    // Before any KPIs exist, EVERY pillar is unmeasured. Reporting four gaps to somebody who has
    // simply not reached step 5 yet would be noise, not a reading.
    const noKpis = complete().map(r => ({ ...r, pillars: [] }));
    expect(structuralGaps(noKpis).some(p => p.why.includes('measures'))).toBe(false);
  });

  /*
    Deliberately about the SEAT, not the person: past seven reports the one-to-ones stop happening
    whoever is in the chair, and People is the pillar that fails first when they do.
  */
  it('finds a span nobody can hold', () => {
    const roles = [
      ...complete(),
      ...Array.from({ length: SPAN_LIMIT + 1 }, (_, i) =>
        role({ id: `t${i}`, title: `Technician ${i}`, reportsToRoleId: 'o', pillars: ['safety'] })),
    ];
    const found = structuralGaps(roles);
    const span = found.find(p => p.why.includes('direct reports'));
    expect(span).toBeTruthy();
    expect(span!.parentRoleId).toBe('o');
    expect(span!.why).toContain(String(SPAN_LIMIT + 1));
  });

  it('leaves a span at the limit alone', () => {
    const roles = [
      ...complete(),
      ...Array.from({ length: SPAN_LIMIT }, (_, i) =>
        role({ id: `t${i}`, title: `Technician ${i}`, reportsToRoleId: 'o', pillars: ['safety'] })),
    ];
    expect(structuralGaps(roles).some(p => p.why.includes('direct reports'))).toBe(false);
  });

  /* A list of eleven things to approve is a list nobody approves. */
  it('never proposes more than a leader will actually read', () => {
    const bare = [role({ id: 'gm', title: 'General Manager', level: 'gm', stream: 'gm' })];
    expect(structuralGaps(bare).length).toBeLessThanOrEqual(3);
    expect(structuralGaps(bare, 2)).toHaveLength(2);
  });

  it('hangs a proposed head off the top of the business', () => {
    const roles = complete().filter(r => r.id !== 'g');
    expect(structuralGaps(roles)[0].parentRoleId).toBe('gm');
  });
});

describe('what is worth proposing twice', () => {
  const p = (title: string) => ({ title, parentRoleId: null, why: 'because', stream: 'operations', level: 'supervisor' });

  it('does not propose a role that already exists', () => {
    expect(worthProposing([p('Yard Lead')], ['Yard Lead'], [])).toEqual([]);
  });

  /*
    The one that matters most. Proposing the same Yard Lead every month after somebody has said no
    is how software teaches people to stop reading it — and then they stop reading everything else
    on the page too.
  */
  it('never proposes something that was already refused', () => {
    expect(worthProposing([p('Yard Lead')], [], ['Yard Lead'])).toEqual([]);
  });

  it('treats two spellings of the same job as the same job', () => {
    expect(worthProposing([p('yard  lead')], ['Yard Lead'], [])).toEqual([]);
    expect(normaliseTitle('  Yard   Lead ')).toBe('yard lead');
  });

  it('does not propose the same thing twice in one reading', () => {
    expect(worthProposing([p('Yard Lead'), p('Yard Lead')], [], [])).toHaveLength(1);
  });

  it('keeps what is genuinely new', () => {
    expect(worthProposing([p('Yard Lead')], ['Scheduler'], ['Estimator']).map(x => x.title)).toEqual(['Yard Lead']);
  });
});

describe('what the product does with them', () => {
  const data = readFileSync('src/lib/predict-data.ts', 'utf8');
  const panel = readFileSync('src/components/predicted-roles.tsx', 'utf8');
  const page = readFileSync('src/app/org/page.tsx', 'utf8');
  const actions = readFileSync('src/app/org/predict-actions.ts', 'utf8');
  const schema = readFileSync('src/db/schema.ts', 'utf8');

  it('is on the org chart, where the structure is worked on', () => {
    expect(page).toContain('<PredictedRoles');
    expect(page).toContain('pendingPredictions(');
  });

  /*
    A proposal is not a role that happens to be switched off. Keeping them in their own table is
    what stops the chart, the roll-up, the incentive chain and the seat count ever seeing one —
    without every one of those having to remember to filter it out.
  */
  it('keeps proposals out of the roles table entirely', () => {
    expect(schema).toContain("pgTable('predicted_roles'");
    expect(page, 'the chart is still built from real roles only').toContain('scope.roles');
  });

  it('remembers a refusal instead of deleting it', () => {
    expect(data).toContain("state: 'denied'");
    expect(data).not.toMatch(/delete\(schema\.predictedRoles\)/);
  });

  /*
    Everything a model returns is untrusted input. A parentRoleId is a foreign key into this
    business's own roles — a hallucinated one would break the insert, or worse, if it happened to
    be real, hang a role off another company's chart.
  */
  it('checks every id the model returns against the ones it was given', () => {
    expect(data).toContain('validIds.has(p.parentRoleId)');
    expect(data).toContain('STREAMS.has');
    expect(data).toContain('LEVELS.has');
  });

  it('works with no API key at all, because Basic is not a crippled product', () => {
    expect(data).toContain('if (!key) return [];');
    expect(data, 'the structural reading runs either way').toContain('structuralGaps(shape)');
  });

  /* "Every proposal must serve one of the goals given" cannot be applied without goals, and without
     it the model falls back to the generic answer this feature exists to beat. */
  it('does not ask Claude before the goals are set', () => {
    expect(data).toContain('if (goals.length === 0) return [];');
  });

  it('creates an approved role with no KPIs, so the scorecard is still a conversation', () => {
    expect(data).toContain('arrives with NO KPIs');
    expect(data).not.toMatch(/insert\(schema\.criteria\)/);
  });

  it('needs manage rights to change the shape of the business', () => {
    expect(actions).toContain('canManage');
    expect(actions).toContain('assertWritable');
  });

  it('says where each proposal came from, because the two need different trust', () => {
    expect(panel).toContain('a judgement');
    expect(panel).toContain('from your chart');
  });

  it('says plainly that nothing is real until the leader says so', () => {
    expect(panel).toContain('Nothing here counts as real until you say so');
    expect(panel).toContain('never proposed again');
  });

  /* A well-drawn chart getting "nothing new" should read as a result, not a button that did nothing. */
  it('has something to say when it finds nothing', () => {
    expect(panel).toContain('Nothing new');
  });
});
