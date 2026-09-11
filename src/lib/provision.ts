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
import trainingCatalogue from '../../seed/training_modules.json';
import { validateWeights, type Criterion as ScoringCriterion, type Pillar } from './scoring';
import { resolveTarget } from './targets';

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
 * Opens the first (or next unopened) period for a tenant.
 *
 * Called at signup, not on payment: the three-day trial is the whole system, scoring included, so a
 * business can try it properly before deciding. Access after the trial is enforced by
 * lib/plan.assertWritable, not by withholding the period.
 * Idempotent — safe to call again for a tenant that already has an open period.
 */
export async function openFirstPeriod(tenantId: string, period?: string) {
  const existing = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  if (existing.length) return existing[0];
  const periodId = id();
  await db.insert(schema.periods).values({ id: periodId, tenantId, period: period ?? now().slice(0, 7) }).onConflictDoNothing();
  return { id: periodId, tenantId, period: period ?? now().slice(0, 7), status: 'open' as const };
}

type CatalogueModule = {
  key: string; title: string; summary: string; pillar: string;
  minutes: number; core: boolean; dueDays: number | null; levels: string[];
};

/**
 * Install SPEC's own training catalogue for a business, and give each role the path its level
 * starts with. Idempotent: called again for a role added later, it adds what is missing and
 * touches nothing a manager has already changed.
 */
export async function installTraining(tenantId: string, roles: { roleId: string; level: string }[]) {
  const catalogue = trainingCatalogue.modules as CatalogueModule[];

  const existing = await db.select().from(schema.trainingModules)
    .where(eq(schema.trainingModules.tenantId, tenantId));
  const byTitle = new Map(existing.map(m => [m.title, m.id]));

  const missing = catalogue.filter(m => !byTitle.has(m.title));
  if (missing.length) {
    const rows = missing.map((m, i) => ({
      id: id(), tenantId, title: m.title, summary: m.summary, pillar: m.pillar,
      minutes: m.minutes, core: m.core, sortOrder: existing.length + i,
    }));
    await db.insert(schema.trainingModules).values(rows);
    for (const r of rows) byTitle.set(r.title, r.id);
  }

  const paths = [];
  for (const { roleId, level } of roles) {
    const already = await db.select().from(schema.roleCurriculum)
      .where(eq(schema.roleCurriculum.roleId, roleId));
    const held = new Set(already.map(r => r.moduleId));
    const wanted = catalogue.filter(m => m.levels.includes(level));
    for (let i = 0; i < wanted.length; i++) {
      const moduleId = byTitle.get(wanted[i].title);
      if (!moduleId || held.has(moduleId)) continue;
      paths.push({ id: id(), roleId, moduleId, dueDays: wanted[i].dueDays, sortOrder: i });
    }
  }
  // One write for every role's path, not one per module — provisioning has to feel instant.
  if (paths.length) await db.insert(schema.roleCurriculum).values(paths).onConflictDoNothing();
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
      // A GM is the business's first administrator — someone has to be able to add seats and
      // grants on day one, and requiring a separate step there would block setup entirely.
      // Everyone else manages within their scope; staff read their own card.
      defaultAccess: t.level === 'gm' ? 'administrator' : t.level === 'staff' ? 'readonly' : 'full',
      reportsToRoleId: t.level === 'gm' ? null : gmId ?? null,
      pnlView: t.pnl_view ?? null, sortOrder: i,
    });

    const resolved = resolveCriteria(t);
    const check: ScoringCriterion[] = resolved.map((r, j) => ({ id: String(j), pillar: r.pillar, text: r.c.text, weight: r.c.weight }));
    const problems = validateWeights(check);
    if (problems.length) throw new Error(`Template ${t.template_id}: weights do not sum to 100% in ${problems.map(p => p.pillar).join(', ')}`);

    // One write per role, not one per KPI — sign-up has to feel instant.
    if (resolved.length) {
      await db.insert(schema.criteria).values(resolved.map((r, j) => {
        const { target, proposed } = resolveTarget(r.c.target);
        return {
          id: id(), roleId: rid, pillar: r.pillar, text: r.c.text, weight: r.c.weight,
          kpi: !!r.c.kpi, target, proposedTarget: proposed, sortOrder: j,
        };
      }));
    }
  }

  // Rule book is global, loaded once, in one write.
  if (rulebook.rules.length) {
    await db.insert(schema.rulebookRules).values(rulebook.rules.map(r => ({ ...r, version: rulebook.version }))).onConflictDoNothing();
  }

  // SPEC's own training, and a starting path against every role. The business edits it from there —
  // SPEC proposes, the leader decides — but nobody should face a blank curriculum screen.
  await installTraining(tenantId, [...roleIds.entries()].map(([templateId, rid]) => ({
    roleId: rid,
    level: roleTemplates.find(t => t.template_id === templateId)?.level ?? 'staff',
  })));

  // Open the first period straight away. The three-day trial is the full system — a business that
  // cannot score a month has not actually tried SPEC, it has only looked at the setup screens.
  await openFirstPeriod(tenantId);

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
