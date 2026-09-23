import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope, type Scope } from './scope';
import { DEFAULT_STAGES, orderStages, canSeeDeal, ownerOptions, type StageDef } from './crm';

/**
 * The CRM's reads, each one scoped twice: by tenant in the query, and by the org chart after it.
 *
 * A deal is visible to its owner's role and everybody above it in their own line — the same walk
 * `lib/scope` does for every scorecard. Organisations and people are the business's client list and
 * are shared across it, the way a job's client is; what anybody can see OF them — their deals — is
 * still only the deals in their line.
 */

export type DealRow = typeof schema.crmDeals.$inferSelect;
export type ActivityRow = typeof schema.crmActivities.$inferSelect;
export type EventRow = typeof schema.crmDealEvents.$inferSelect;
export type OrganisationRow = typeof schema.crmOrganisations.$inferSelect;
export type PersonRow = typeof schema.crmPeople.$inferSelect;

const toStage = (s: typeof schema.crmStages.$inferSelect): StageDef =>
  ({ id: s.id, name: s.name, probability: s.probability, rotDays: s.rotDays, position: s.position });

/** The business's stages as stored, in order. Empty until the first deal or the first edit. */
export async function storedStages(tenantId: string): Promise<StageDef[]> {
  const rows = await db.select().from(schema.crmStages).where(eq(schema.crmStages.tenantId, tenantId));
  return orderStages(rows.map(toStage));
}

/**
 * The stages, writing SPEC's proposed five the first time anything needs them to exist. Only ever
 * called from a write — reading the page never writes.
 */
export async function ensureStages(tenantId: string): Promise<StageDef[]> {
  const have = await storedStages(tenantId);
  if (have.length) return have;
  const at = new Date().toISOString();
  const rows = DEFAULT_STAGES.map(s => ({ ...s, id: randomUUID(), tenantId, createdAt: at }));
  await db.insert(schema.crmStages).values(rows);
  return orderStages(rows.map(toStage));
}

/** The stages to draw: the stored ones, or SPEC's proposal before anything has been saved. */
export async function stagesToShow(tenantId: string): Promise<{ stages: StageDef[]; proposed: boolean }> {
  const have = await storedStages(tenantId);
  if (have.length) return { stages: have, proposed: false };
  return { stages: DEFAULT_STAGES.map((s, i) => ({ ...s, id: `proposed-${i}` })), proposed: true };
}

/** May this person reshape the pipeline itself — names, probabilities, days before quiet? */
export function mayShapePipeline(scope: Scope, access: string): boolean {
  if (access !== 'full' && access !== 'administrator') return false;
  if (scope.canAdminister) return true;
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  return Boolean(mine && !mine.reportsToRoleId);
}

export interface CrmView {
  scope: Scope;
  stages: StageDef[];
  proposed: boolean;
  deals: DealRow[];
  activities: ActivityRow[];
  events: EventRow[];
  organisations: OrganisationRow[];
  people: PersonRow[];
  owners: { roleId: string; name: string; title: string }[];
}

/** Everything the CRM screen shows, for this person. */
export async function loadCrm(user: CurrentUser): Promise<CrmView> {
  const scope = await getScope(user);
  const [{ stages, proposed }, allDeals, organisations, people] = await Promise.all([
    stagesToShow(user.tenantId),
    db.select().from(schema.crmDeals).where(eq(schema.crmDeals.tenantId, user.tenantId)).orderBy(schema.crmDeals.createdAt),
    db.select().from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, user.tenantId)).orderBy(schema.crmOrganisations.name),
    db.select().from(schema.crmPeople).where(eq(schema.crmPeople.tenantId, user.tenantId)).orderBy(schema.crmPeople.name),
  ]);
  const deals = allDeals.filter(d => canSeeDeal(d.ownerRoleId, scope.visible, user.access));
  const ids = deals.map(d => d.id);
  const [activities, events] = ids.length
    ? await Promise.all([
        db.select().from(schema.crmActivities)
          .where(and(eq(schema.crmActivities.tenantId, user.tenantId), inArray(schema.crmActivities.dealId, ids))),
        db.select().from(schema.crmDealEvents)
          .where(and(eq(schema.crmDealEvents.tenantId, user.tenantId), inArray(schema.crmDealEvents.dealId, ids)))
          .orderBy(schema.crmDealEvents.at),
      ])
    : [[], []];
  return {
    scope, stages, proposed, deals, activities, events, organisations, people,
    owners: ownerOptions(scope.roles, scope.visible),
  };
}

/** One deal, only if it is this business's AND in this person's line. */
export async function visibleDeal(user: CurrentUser, scope: Scope, id: string): Promise<DealRow | null> {
  if (!id) return null;
  const [deal] = await db.select().from(schema.crmDeals)
    .where(and(eq(schema.crmDeals.id, id), eq(schema.crmDeals.tenantId, user.tenantId)));
  if (!deal || !canSeeDeal(deal.ownerRoleId, scope.visible, user.access)) return null;
  return deal;
}

/** Append a line to a deal's history. */
export async function logEvent(
  tenantId: string, dealId: string, byName: string,
  e: { kind: string; fromStageId?: string | null; toStageId?: string | null; text?: string },
): Promise<void> {
  await db.insert(schema.crmDealEvents).values({
    id: randomUUID(), tenantId, dealId, kind: e.kind, fromStageId: e.fromStageId ?? null,
    toStageId: e.toStageId ?? null, text: (e.text ?? '').slice(0, 1000), byName, at: new Date().toISOString(),
  });
}
