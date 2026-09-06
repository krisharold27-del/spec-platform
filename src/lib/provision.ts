/**
 * Provision a tenant from the seed templates.
 * This is the core of the Phase 2 "new client" flow: company name in → roles, criteria, first period out.
 * Roles are created first, empty. People are assigned afterwards (assignPerson), never the reverse.
 */
import { randomUUID } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import templates from '../../seed/criteria_templates.json';
import rulebook from '../../seed/rulebook.json';
import { validateWeights, type Criterion as ScoringCriterion, type Pillar } from './scoring';

type TemplateCriterion = { text: string; weight: number; kpi?: boolean; target?: string };
type TemplateRole = {
  template_id: string; title: string; stream: string; level: string;
  pnl_view?: string;
  criteria: Record<string, TemplateCriterion[] | 'organisational_standard'>;
};

const now = () => new Date().toISOString();
const id = () => randomUUID();

function resolveCriteria(role: TemplateRole): { pillar: Pillar; c: TemplateCriterion }[] {
  const out: { pillar: Pillar; c: TemplateCriterion }[] = [];
  for (const [pillar, list] of Object.entries(role.criteria)) {
    const items = list === 'organisational_standard'
      ? (templates.organisational_standard as unknown as Record<string, TemplateCriterion[]>)[pillar]
      : list;
    for (const c of items) out.push({ pillar: pillar as Pillar, c });
  }
  return out;
}

export interface ProvisionOptions {
  name: string;
  sector?: string;
  /** Template ids to create, in org order. Default: gm + three COGS heads. */
  roleTemplates?: string[];
  /** First open period, YYYY-MM. Default: current month. */
  period?: string;
}

export async function provisionTenant(opts: ProvisionOptions) {
  const tenantId = id();
  const period = opts.period ?? now().slice(0, 7);
  const wanted = opts.roleTemplates ?? ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'];
  const roleTemplates = (templates.roles as TemplateRole[]).filter(r => wanted.includes(r.template_id));

  db.insert(schema.tenants).values({ id: tenantId, name: opts.name, sector: opts.sector, startDate: now() }).run();

  // Roles: GM first, everything else reports to GM by default.
  const roleIds = new Map<string, string>();
  let gmId: string | undefined;
  roleTemplates.sort((a, b) => wanted.indexOf(a.template_id) - wanted.indexOf(b.template_id));
  roleTemplates.forEach((t, i) => {
    const rid = id();
    roleIds.set(t.template_id, rid);
    if (t.level === 'gm') gmId = rid;
    db.insert(schema.roles).values({
      id: rid, tenantId, title: t.title, stream: t.stream, level: t.level,
      defaultAccess: t.level === 'staff' ? 'readonly' : 'full',
      reportsToRoleId: t.level === 'gm' ? null : gmId ?? null,
      pnlView: t.pnl_view ?? null, sortOrder: i,
    }).run();

    const resolved = resolveCriteria(t);
    const check: ScoringCriterion[] = resolved.map((r, j) => ({ id: String(j), pillar: r.pillar, text: r.c.text, weight: r.c.weight }));
    const problems = validateWeights(check);
    if (problems.length) throw new Error(`Template ${t.template_id}: weights do not sum to 100% in ${problems.map(p => p.pillar).join(', ')}`);

    resolved.forEach((r, j) => {
      db.insert(schema.criteria).values({
        id: id(), roleId: rid, pillar: r.pillar, text: r.c.text, weight: r.c.weight,
        kpi: !!r.c.kpi, target: r.c.target ?? null, sortOrder: j,
      }).run();
    });
  });

  const periodId = id();
  db.insert(schema.periods).values({ id: periodId, tenantId, period }).run();

  // Rule book is global, loaded once.
  for (const r of rulebook.rules) {
    db.insert(schema.rulebookRules).values({ ...r, version: rulebook.version }).onConflictDoNothing().run();
  }

  return { tenantId, periodId, roleIds: Object.fromEntries(roleIds) };
}

/** Assign a person to a role. Creates the user if needed. Access is inherited from the role. */
export async function assignPerson(tenantId: string, roleId: string, person: { name: string; email: string }) {
  const role = db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).get();
  if (!role || role.tenantId !== tenantId) throw new Error('Role not found in tenant');

  const found = db.select().from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, person.email))).get();
  const user = found ?? { id: id(), tenantId, email: person.email, name: person.name, access: role.defaultAccess, invitedAt: null, acceptedAt: null };
  if (!found) db.insert(schema.users).values(user).run();
  // Close any current assignment on this role, then open the new one. History is kept.
  db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate))).run();
  db.insert(schema.roleAssignments).values({ id: id(), roleId, userId: user.id, fromDate: now() }).run();
  return user;
}
