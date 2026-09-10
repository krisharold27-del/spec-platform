/**
 * The founder's sandbox: an example business to look around in, signed into with a real inbox.
 *
 *   npx tsx --env-file=.env.local scripts/seed-sandbox.ts [email]
 *
 * Adds only — never deletes or changes anything that exists — and does nothing if the sandbox is
 * already there. Sends no email: the example people have .invalid addresses, which can never
 * receive mail, and none of them has a seat. Stays on the free plan, so it is never billed.
 *
 * One email can hold more than one business, so the sandbox sits beside the founder's real
 * business under the same address, reached from "Switch business". The real business is untouched.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { provisionTenant, assignPerson } from '../src/lib/provision';
import { answerFor, type Status } from '../src/lib/status';

const EMAIL = (process.argv[2] ?? 'kris.harold27@gmail.com').toLowerCase().trim();
const NAME = 'Sandbox — Northside Electrical (example)';
const now = () => new Date().toISOString();

/** Statuses to mark each role's KPIs with, in order, cycling. Empty = left Pending. */
const MARKS: Record<string, Status[]> = {
  gm: ['met', 'met', 'confirmed', 'not_met', 'on_track', 'met', 'watch', 'met', 'met', 'not_tracked'],
  commercial_manager: ['met', 'not_met', 'met', 'met', 'pending', 'met', 'not_met', 'met'],
  operations_manager: ['met', 'met', 'met', 'not_met', 'met', 'not_met', 'met', 'met', 'watch'],
  supervisor: ['not_met', 'not_met', 'met', 'pending', 'not_met', 'met', 'not_tracked'],
  staff: [],
};

async function main() {
  // One email can hold several businesses, so an address that already has one is fine — the
  // sandbox appears beside it under "Switch business".
  if ((await db.select().from(schema.tenants).where(eq(schema.tenants.name, NAME)))[0]) {
    console.log('Nothing done: the sandbox business already exists.'); return;
  }

  const { tenantId, roleIds } = await provisionTenant({
    name: NAME, sector: 'Electrical services',
    roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager', 'supervisor', 'staff'],
  });

  // Depth, not a flat list: the crew reports to a supervisor, who reports to Operations.
  await db.update(schema.roles).set({ reportsToRoleId: roleIds.operations_manager }).where(eq(schema.roles.id, roleIds.supervisor));
  await db.update(schema.roles).set({ reportsToRoleId: roleIds.supervisor }).where(eq(schema.roles.id, roleIds.staff));

  // You at the top. Everyone else is an example with an address that can never receive mail.
  await assignPerson(tenantId, roleIds.gm, { name: 'Kris (sandbox)', email: EMAIL });
  await assignPerson(tenantId, roleIds.commercial_manager, { name: 'Sam Lee (example)', email: 'sam@northside.invalid' });
  await assignPerson(tenantId, roleIds.operations_manager, { name: 'Jo Barnes (example)', email: 'jo@northside.invalid' });
  await assignPerson(tenantId, roleIds.supervisor, { name: 'Tom Reid (example)', email: 'tom@northside.invalid' });
  await assignPerson(tenantId, roleIds.staff, { name: 'Mia Chen (example)', email: 'mia@northside.invalid' });
  // Growth is deliberately left open — a role with nobody in it is a normal state, and worth seeing.

  const period = (await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId)))[0]!;
  let marked = 0;
  for (const [template, statuses] of Object.entries(MARKS)) {
    if (!statuses.length) continue;
    const criteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleIds[template]));
    for (let i = 0; i < criteria.length; i++) {
      const status = statuses[i % statuses.length];
      await db.insert(schema.assessments).values({
        id: randomUUID(), periodId: period.id, roleId: roleIds[template], criterionId: criteria[i].id,
        status, answer: answerFor(status), enteredBy: EMAIL, enteredAt: now(),
        source: status === 'not_tracked' ? null : 'Example mark',
      });
      marked++;
    }
  }

  await db.insert(schema.gates).values([
    { id: randomUUID(), periodId: period.id, gate: 'zero_harm', value: '0/0/0', pass: true, reason: 'No LTI, MTI or psychosocial incidents recorded.' },
    { id: randomUUID(), periodId: period.id, gate: 'clear_to_work', value: '0.86', pass: false, reason: 'Training compliance 86% — three licences expired; renewals booked for the 18th.' },
  ]);
  await db.insert(schema.directors).values({ id: randomUUID(), tenantId, name: 'Pat Ellis (example)', title: 'Chair', appointedAt: now().slice(0, 10), active: true });
  await db.insert(schema.systemConnections).values({ id: randomUUID(), tenantId, name: 'Job management system', category: 'job_management', ownerIsSelf: true, status: 'live', createdAt: now() });

  console.log(`Sandbox ready: 6 roles (Growth left open), 5 people, ${marked} KPIs marked for ${period.period}, both gates, a board chair.`);
  console.log(`Sign in at https://app.specbizhq.com/signin with ${EMAIL}. No email has been sent.`);
}

main().then(() => process.exit(0), err => { console.error('Sandbox not created:', err.message); process.exit(1); });
