/** Provision a demo tenant ("Acme Electrical") with people assigned and a partly scored first month. */
import { db, schema } from '../src/db';
import { provisionTenant, assignPerson } from '../src/lib/provision';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

async function main() {
  const existingRows = await db.select().from(schema.tenants).where(eq(schema.tenants.name, 'Acme Electrical'));
  const existing = existingRows[0];
  if (existing) { console.log('Demo tenant already exists:', existing.id); return; }

  const { tenantId, periodId, roleIds } = await provisionTenant({
    name: 'Acme Electrical', sector: 'Electrical services',
    roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager', 'supervisor'],
  });
  // Supervisor reports to Operations, not GM.
  await db.update(schema.roles).set({ reportsToRoleId: roleIds.operations_manager }).where(eq(schema.roles.id, roleIds.supervisor));

  await assignPerson(tenantId, roleIds.gm, { name: 'Alex Morgan', email: 'alex@acme.example' });
  await assignPerson(tenantId, roleIds.commercial_manager, { name: 'Sam Lee', email: 'sam@acme.example' });
  await assignPerson(tenantId, roleIds.operations_manager, { name: 'Jo Barnes', email: 'jo@acme.example' });
  await assignPerson(tenantId, roleIds.growth_manager, { name: 'Chris Nguyen', email: 'chris@acme.example' });
  // Supervisor role deliberately left vacant — roles exist before people.

  // Score the Operations role for the first month so the rollup has something to show.
  const opsCriteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleIds.operations_manager));
  const answers = ['Y', 'Y', 'Y', 'N', 'Y', 'N', 'Y', 'Y'];
  for (let i = 0; i < opsCriteria.length; i++) {
    const c = opsCriteria[i];
    await db.insert(schema.assessments).values({
      id: randomUUID(), periodId, roleId: roleIds.operations_manager, criterionId: c.id,
      answer: answers[i] ?? '', enteredBy: 'alex@acme.example', enteredAt: new Date().toISOString(),
    });
  }

  await db.insert(schema.gates).values([
    { id: randomUUID(), periodId, gate: 'zero_harm', value: '0/0/0', pass: true, reason: 'No LTI, MTI or psychosocial incidents recorded.' },
    { id: randomUUID(), periodId, gate: 'clear_to_work', value: '0.86', pass: false, reason: 'Training compliance 86% — three licences expired.' },
  ]);

  await db.insert(schema.claudeRegistrations).values({ tenantId, path: 'own_workspace', workspaceName: 'Acme Electrical', seatsConfirmed: true, confirmedBy: 'alex@acme.example', confirmedAt: new Date().toISOString() });
  console.log('Seeded demo tenant', tenantId, '— sign in as alex@acme.example');
}
main();
