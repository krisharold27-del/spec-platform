/**
 * A demo business with a history.
 *
 * A seed that creates an empty shell makes a finished product look unfinished: every screen renders
 * its emptiest state, every score is a dash, and the J curve is a single blank column. So this
 * builds a business that has actually been running — four closed months on a real curve, cards with
 * results and sources and notes against them, meetings that were held and logged, comments, a
 * connection that has been feeding, and training part-way through.
 *
 * It is obviously fictional and stays that way. No real client, no real figures.
 */
import { db, schema } from '../src/db';
import { provisionTenant, assignPerson, installTraining } from '../src/lib/provision';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const id = () => randomUUID();
const at = (iso: string) => new Date(iso).toISOString();

/**
 * The shape of the story: a business that started badly, found its feet, and is now holding.
 * The dip and the climb are the point — a demo where everything is green teaches nobody anything.
 */
const MONTHS = [
  { period: '2026-05', answers: ['Y', 'N', 'N', 'N', 'Y', 'N', 'Y', 'N'], locked: true },
  { period: '2026-06', answers: ['Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'Y'], locked: true },
  { period: '2026-07', answers: ['Y', 'Y', 'Y', 'N', 'Y', 'Y', 'Y', 'Y'], locked: true },
  { period: '2026-08', answers: ['Y', 'Y', 'Y', 'Y', 'Y', 'N', 'Y', 'Y'], locked: true },
  { period: '2026-09', answers: ['Y', 'Y', 'N', '', 'Y', '', 'Y', ''], locked: false },
];

const STATUS_FOR: Record<string, string> = { Y: 'met', N: 'not_met', '': 'pending' };

/** Results that read like a real business rather than like placeholder text. */
const RESULTS = [
  '0 incidents', '0 claims', '4 of 5 held', '18% against 15%',
  '92% billable', '28.4% against 32%', '0 breaches', '+41 against +35',
];

const NOTES: Record<number, string> = {
  3: 'Two departures inside ninety days, both from the same crew. The Yard Lead vacancy is the common factor.',
  5: 'Rework on two jobs that were quoted before the scope changed. Quoting rule goes to the board in October.',
};

async function main() {
  const existing = (await db.select().from(schema.tenants).where(eq(schema.tenants.name, 'Acme Electrical')))[0];
  if (existing) { console.log('Demo tenant already exists:', existing.id); process.exit(0); }

  const { tenantId, roleIds } = await provisionTenant({
    name: 'Acme Electrical', sector: 'Electrical services',
    roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager', 'supervisor'],
  });

  // Supervisor reports to Operations, not to the GM.
  await db.update(schema.roles).set({ reportsToRoleId: roleIds.operations_manager })
    .where(eq(schema.roles.id, roleIds.supervisor));

  // Started five months ago, on Advanced, so the connectors and the assistant are part of the demo.
  await db.update(schema.tenants)
    .set({ plan: 'basic', tier: 'advanced', startDate: at('2026-04-28T09:00:00Z') })
    .where(eq(schema.tenants.id, tenantId));

  await assignPerson(tenantId, roleIds.gm, { name: 'Alex Morgan', email: 'alex@acme.example' });
  await assignPerson(tenantId, roleIds.commercial_manager, { name: 'Sam Lee', email: 'sam@acme.example' });
  await assignPerson(tenantId, roleIds.operations_manager, { name: 'Jo Barnes', email: 'jo@acme.example' });
  await assignPerson(tenantId, roleIds.growth_manager, { name: 'Chris Nguyen', email: 'chris@acme.example' });
  // Supervisor is deliberately left open: a vacancy is information, and several screens are about it.

  // A crew under the supervisor, pencilled in rather than invited — free, and nobody emailed.
  for (const name of ['Priya Raman', 'Tom Alderson']) {
    const roleId = id();
    const staffId = id();
    await db.insert(schema.roles).values({
      id: roleId, tenantId, title: 'Electrician', stream: 'operations', level: 'staff',
      defaultAccess: 'readonly', reportsToRoleId: roleIds.supervisor, sortOrder: 9,
    });
    await db.insert(schema.staff).values({ id: staffId, tenantId, name, createdAt: at('2026-05-04T09:00:00Z') });
    await db.insert(schema.roleAssignments).values({
      id: id(), roleId, staffId, fromDate: '2026-05-04',
    });
    await installTraining(tenantId, [{ roleId, level: 'staff' }]);
  }

  // Back-date the placements so the training paths have real due dates behind them.
  const placements = await db.select().from(schema.roleAssignments);
  for (const p of placements.filter(x => x.userId)) {
    await db.update(schema.roleAssignments).set({ fromDate: '2026-04-30' }).where(eq(schema.roleAssignments.id, p.id));
  }

  const scoredRoles = [
    roleIds.gm, roleIds.commercial_manager, roleIds.operations_manager, roleIds.growth_manager,
  ];

  // provisionTenant opens the current month the moment a role has its KPIs, which is right for a
  // real business and in the way of a seeded history. Clear it and lay the months down deliberately.
  await db.delete(schema.periods).where(eq(schema.periods.tenantId, tenantId));

  // Five months of scoring: four closed, one open.
  const periodIds: Record<string, string> = {};
  for (const m of MONTHS) {
    const periodId = id();
    periodIds[m.period] = periodId;
    // Marking a month and signing it are not one act. Managers score over the last week and the GM
    // signs at the end of it. Writing both at a single timestamp made the first close read as nought
    // days after the first mark, which is not how any month is actually closed.
    const marked = `${m.period}-24T16:00:00Z`;
    const close = `${m.period}-28T17:00:00Z`;
    await db.insert(schema.periods).values({
      id: periodId, tenantId, period: m.period,
      status: m.locked ? 'locked' : 'open',
      submittedBy: m.locked ? 'Alex Morgan' : null,
      submittedAt: m.locked ? at(close) : null,
      signedBy: m.locked ? 'Alex Morgan' : null,
      signedAt: m.locked ? at(close) : null,
    });

    for (const roleId of scoredRoles) {
      const criteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleId));
      // The Operations card carries the story; the others sit steadier around it.
      const answers = roleId === roleIds.operations_manager
        ? m.answers
        : m.answers.map(a => (a === 'N' && Math.random() > 0.5 ? 'Y' : a));

      for (let i = 0; i < criteria.length; i++) {
        const c = criteria[i];
        const answer = answers[i] ?? 'Y';
        const enteredBy = roleId === roleIds.gm ? 'alex@acme.example'
          : roleId === roleIds.operations_manager ? 'jo@acme.example'
          : roleId === roleIds.commercial_manager ? 'sam@acme.example' : 'chris@acme.example';

        await db.insert(schema.assessments).values({
          id: id(), periodId, roleId, criterionId: c.id,
          answer,
          status: STATUS_FOR[answer] ?? 'pending',
          result: answer ? RESULTS[i % RESULTS.length] : null,
          source: i % 3 === 0 ? 'Job management system · scheduled vs billable'
            : i % 3 === 1 ? 'Accounts package · plain actuals'
            : 'Manual — confirmed by the person accountable',
          note: roleId === roleIds.operations_manager ? (NOTES[i] ?? null) : null,
          enteredBy,
          enteredAt: at(marked),
        });
      }
    }

    await db.insert(schema.gates).values([
      { id: id(), periodId, gate: 'zero_harm', value: '0/0/0', pass: true,
        reason: 'No lost-time, medical-treatment or psychosocial incidents recorded.' },
      { id: id(), periodId, gate: 'clear_to_work', value: m.period >= '2026-07' ? '1' : '0.86',
        pass: m.period >= '2026-07',
        reason: m.period >= '2026-07' ? 'Every ticket current.' : 'Three licences expired mid-month; renewed on the 22nd.' },
    ]);
  }

  // A target that was actually negotiated, and several that were not — the sharpest signal on the
  // first conversation board reads this.
  const opsCriteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleIds.operations_manager));
  for (let i = 0; i < opsCriteria.length; i++) {
    const c = opsCriteria[i];
    await db.update(schema.criteria)
      .set({ proposedTarget: i === 5 ? '30%' : c.target })
      .where(eq(schema.criteria.id, c.id));
  }

  // A connection that has been feeding, and one still waiting on the board.
  await db.insert(schema.systemConnections).values([
    { id: id(), tenantId, name: 'Job management system', category: 'job_management',
      ownerIsSelf: true, status: 'live', lastSyncAt: at('2026-09-11T06:04:00Z'), createdAt: at('2026-05-02T09:00:00Z') },
    { id: id(), tenantId, name: 'Accounts package', category: 'financials',
      ownerName: 'Sam Lee', ownerIsSelf: false, status: 'live',
      lastSyncAt: at('2026-09-11T06:04:00Z'), createdAt: at('2026-05-06T09:00:00Z') },
  ]);
  const pendingSafety = id();
  await db.insert(schema.systemConnections).values({
    id: pendingSafety, tenantId, name: 'Safety register', category: 'safety',
    ownerIsSelf: true, status: 'requested', createdAt: at('2026-08-30T09:00:00Z'),
  });
  await db.insert(schema.approvals).values({
    id: id(), tenantId, kind: 'connection',
    title: 'Safety and compliance — Safety register',
    detail: 'Incidents, inductions and training records. Read only.',
    blocks: 'Blocks: incident rate has no system behind it and is closed out unmeasured each month.',
    decidedByLevel: 'board', requestedBy: 'Jo Barnes',
    requestedAt: at('2026-08-30T09:00:00Z'), refId: pendingSafety,
  });

  // The weekly rhythm: held most weeks, with the group thinning out towards the end.
  const WEEKS = [
    { date: '2026-08-17', present: ['Alex Morgan', 'Sam Lee', 'Jo Barnes', 'Chris Nguyen'] },
    { date: '2026-08-24', present: ['Alex Morgan', 'Jo Barnes', 'Chris Nguyen'] },
    { date: '2026-08-31', present: ['Alex Morgan', 'Jo Barnes'] },
    { date: '2026-09-07', present: ['Alex Morgan', 'Jo Barnes'] },
  ];
  for (const [i, w] of WEEKS.entries()) {
    await db.insert(schema.meetings).values({
      id: id(), tenantId, type: 'sog', date: w.date,
      minutes: i === 0 ? 'Ran twenty minutes. Nothing carried that was not on the list.' : null,
      attendees: JSON.stringify(w.present),
      decisions: JSON.stringify(
        i === 0
          ? [{ text: 'Inspections stay on Monday mornings — completion went to 100% and it is now the standard.', who: 'Jo Barnes', at: w.date }]
          : i === 2
            ? [{ text: 'The incident rate is closed out unmeasured rather than estimated until the safety register is connected.', who: 'Alex Morgan', at: w.date }]
            : [],
      ),
      actions: JSON.stringify(
        i === 1
          ? [{ id: id(), text: 'Confirm the Yard Lead budget with the board', owner: 'Alex Morgan', due: null, done: false, pillar: 'people' }]
          : i === 3
            ? [
                { id: id(), text: 'Hold the two outstanding crew one-to-ones', owner: 'Jo Barnes', due: '2026-09-30', done: false, pillar: 'people' },
                { id: id(), text: 'Rewrite the quoting rule before October', owner: 'Sam Lee', due: '2026-09-30', done: false, pillar: 'earnings' },
              ]
            : [],
      ),
    });
  }

  // A conversation on the month that is still open.
  const openPeriod = periodIds['2026-09'];
  await db.insert(schema.scorecardComments).values([
    { id: id(), tenantId, roleId: roleIds.operations_manager, periodId: openPeriod,
      author: 'Alex Morgan', body: 'Margin is the third month at 28%. Either the target moves or the quoting rule does — bring a recommendation, not the number.',
      createdAt: at('2026-09-09T08:30:00Z') },
    { id: id(), tenantId, roleId: roleIds.operations_manager, periodId: openPeriod,
      author: 'Jo Barnes', body: 'Agreed. Both jobs that dragged it were quoted before the scope changed, so it is the rule rather than the crews.',
      createdAt: at('2026-09-09T14:10:00Z') },
  ]);

  // Training: the GM part-way through, Operations finished and waiting on a signature.
  const gmUser = (await db.select().from(schema.users).where(eq(schema.users.email, 'alex@acme.example')))[0];
  const opsUser = (await db.select().from(schema.users).where(eq(schema.users.email, 'jo@acme.example')))[0];
  const gmPath = await db.select().from(schema.roleCurriculum).where(eq(schema.roleCurriculum.roleId, roleIds.gm));
  const opsPath = await db.select().from(schema.roleCurriculum).where(eq(schema.roleCurriculum.roleId, roleIds.operations_manager));

  for (const [i, c] of gmPath.entries()) {
    if (i > 2) break;
    await db.insert(schema.trainingRecords).values({
      id: id(), tenantId, moduleId: c.moduleId, userId: gmUser.id,
      progress: i < 2 ? 100 : 50, resultPct: i < 2 ? [94, 88][i] : null,
      startedAt: at('2026-06-02T09:00:00Z'),
      completedAt: i < 2 ? at(['2026-06-12T09:00:00Z', '2026-07-26T09:00:00Z'][i]) : null,
    });
  }
  for (const c of opsPath) {
    await db.insert(schema.trainingRecords).values({
      id: id(), tenantId, moduleId: c.moduleId, userId: opsUser.id,
      progress: 100, resultPct: 91, startedAt: at('2026-05-11T09:00:00Z'), completedAt: at('2026-07-04T09:00:00Z'),
    });
  }

  await db.insert(schema.directors).values({
    id: id(), tenantId, name: 'R. Okafor', title: 'Chair', appointedAt: '2026-04-28', active: true,
  });

  console.log('Seeded Acme Electrical —', tenantId);
  console.log('  4 closed months, 1 open · 2 systems feeding, 1 waiting on the board');
  console.log('  sign in as alex@acme.example');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
