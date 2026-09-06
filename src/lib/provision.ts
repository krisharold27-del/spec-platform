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
}

/**
 * Opens the first (or next unopened) period for a tenant. Gated on plan — trial tenants get the
 * full deployment journey (Stage 0–1: register Claude, roles, KPIs, people) but no period to score
 * against, so scoring and the board output stay out of reach until they pay (see docs/
 * SPEC_GoLive_and_Operations.md §6 and the Stripe webhook at src/app/api/stripe/webhook/route.ts).
 * Idempotent — safe to call again for a tenant that already has an open period.
 */
export async function openFirstPeriod(tenantId: string, period?: string) {
  const existing = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  if (existing.length) return existing[0];
  const periodId = id();
  await db.insert(schema.periods).values({ id: periodId, tenantId, period: period ?? now().slice(0, 7) }).onConflictDoNothing();
  return { id: periodId, tenantId, period: period ?? now().slice(0, 7), status: 'open' as const };
}

export async function provisionTenant(opts: ProvisionOptions) {
  const tenantId = id();
  const wanted = opts.roleTemplates ?? ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'];
  const roleTemplates = (templates.roles as TemplateRole[]).filter(r => wanted.includes(r.template_id));

  await db.insert(schema.tenants).values({ id: tenantId, name: opts.name, sector: opts.sector, startDate: now() });

  // Roles: GM first, everything else reports to GM by default.
  const roleIds = new Map<string, string>();
  let gmId: string | undefined;
  roleTemplates.sort((a, b) => wanted.indexOf(a.template_id) - wanted.indexOf(b.template_id));
  for (let i = 0; i < roleTemplates.length; i++) {
    const t = roleTemplates[i];
    const rid = id();
    roleIds.set(t.template_id, rid);
    if (t.level === 'gm') gmId = rid;
    await db.insert(schema.roles).values({
      id: rid, tenantId, title: t.title, stream: t.stream, level: t.level,
      defaultAccess: t.level === 'staff' ? 'readonly' : 'full',
      reportsToRoleId: t.level === 'gm' ? null : gmId ?? null,
      pnlView: t.pnl_view ?? null, sortOrder: i,
    });

    const resolved = resolveCriteria(t);
    const check: ScoringCriterion[] = resolved.map((r, j) => ({ id: String(j), pillar: r.pillar, text: r.c.text, weight: r.c.weight }));
    const problems = validateWeights(check);
    if (problems.length) throw new Error(`Template ${t.template_id}: weights do not sum to 100% in ${problems.map(p => p.pillar).join(', ')}`);

    for (let j = 0; j < resolved.length; j++) {
      const r = resolved[j];
      await db.insert(schema.criteria).values({
        id: id(), roleId: rid, pillar: r.pillar, text: r.c.text, weight: r.c.weight,
        kpi: !!r.c.kpi, target: r.c.target ?? null, sortOrder: j,
      });
    }
  }

  // Rule book is global, loaded once.
  for (const r of rulebook.rules) {
    await db.insert(schema.rulebookRules).values({ ...r, version: rulebook.version }).onConflictDoNothing();
  }

  // No period is opened here — trial tenants get the full journey (Stage 0–1) but nothing to
  // score until they pay. See openFirstPeriod, called from the Stripe webhook on checkout success.
  return { tenantId, roleIds: Object.fromEntries(roleIds) };
}

/** Assign a person to a role. Creates the user if needed. Access is inherited from the role. */
export async function assignPerson(tenantId: string, roleId: string, person: { name: string; email: string }) {
  const roleRows = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId));
  const role = roleRows[0];
  if (!role || role.tenantId !== tenantId) throw new Error('Role not found in tenant');

  const foundRows = await db.select().from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, person.email)));
  const found = foundRows[0];
  const user = found ?? { id: id(), tenantId, email: person.email, name: person.name, access: role.defaultAccess, authUserId: null, invitedAt: null, acceptedAt: null };
  if (!found) await db.insert(schema.users).values(user);
  // Close any current assignment on this role, then open the new one. History is kept.
  await db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  await db.insert(schema.roleAssignments).values({ id: id(), roleId, userId: user.id, fromDate: now() });
  return user;
}
