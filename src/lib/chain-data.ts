/**
 * Reading a chain of responsibility against the business's own chart.
 *
 * The seat carries the duty, so a link's state comes from the seat: who is in it, and whether
 * somebody was and has gone. That last distinction is the one worth the query — a duty whose holder
 * LEFT is worse than one never filled, because everybody still believes it is covered.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import {
  OBLIGATIONS, isObligation, linkByKey, readChain, brokenChains,
  type Link, type LinkKey, type ChainReading, type ObligationKey,
} from './chain';

/** Every link the business has mapped, with who is in each seat right now. */
export async function linksFor(tenantId: string): Promise<Link[]> {
  const rows = await db.select().from(schema.chainLinks)
    .where(eq(schema.chainLinks.tenantId, tenantId));
  if (rows.length === 0) return [];

  const roles = await db.select({ id: schema.roles.id, title: schema.roles.title })
    .from(schema.roles).where(eq(schema.roles.tenantId, tenantId));
  const titleOf = new Map(roles.map(r => [r.id, r.title]));

  /*
    Placements, scoped to THIS business's roles.

    `role_assignments` has no tenant_id of its own — it hangs off a role — so the scoping has to be
    the role list, and it has to be explicit. The first version of this query read every business's
    placements; `tests/tenant-isolation.test.ts` caught it, which is exactly what that check exists
    for and exactly the kind of leak that would never have shown up in a demo.
  */
  const roleIds = roles.map(r => r.id);
  const placements = roleIds.length
    ? await db.select({
      roleId: schema.roleAssignments.roleId,
      staffId: schema.roleAssignments.staffId,
      userId: schema.roleAssignments.userId,
      toDate: schema.roleAssignments.toDate,
    })
      .from(schema.roleAssignments)
      .where(inArray(schema.roleAssignments.roleId, roleIds))
    : [];

  const open = placements.filter(p => p.toDate === null);
  const closed = placements;

  const [staff, users] = await Promise.all([
    db.select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
    db.select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users).where(eq(schema.users.tenantId, tenantId)),
  ]);
  const nameOf = new Map<string, string>([
    ...staff.map(s => [`staff:${s.id}`, s.name] as const),
    ...users.map(u => [`user:${u.id}`, u.name ?? ''] as const),
  ]);

  const heldBy = new Map<string, string>();
  for (const a of open) {
    const name = a.userId ? nameOf.get(`user:${a.userId}`) : a.staffId ? nameOf.get(`staff:${a.staffId}`) : null;
    if (name?.trim()) heldBy.set(a.roleId, name);
  }

  const leftAt = new Map<string, string>();
  for (const a of closed) {
    if (!a.toDate || heldBy.has(a.roleId)) continue;
    const seen = leftAt.get(a.roleId);
    if (!seen || a.toDate > seen) leftAt.set(a.roleId, a.toDate);
  }

  return rows
    .filter(r => isObligation(r.obligation) && linkByKey(r.link))
    .map(r => ({
      obligation: r.obligation as ObligationKey,
      link: r.link as LinkKey,
      duty: r.duty,
      roleId: r.roleId,
      roleTitle: r.roleId ? titleOf.get(r.roleId) ?? null : null,
      person: r.roleId ? heldBy.get(r.roleId) ?? null : null,
      leftAt: r.roleId && !heldBy.has(r.roleId) ? leftAt.get(r.roleId) ?? null : null,
    }));
}

export interface ChainView {
  chosen: ObligationKey | null;
  reading: ChainReading | null;
  /** Seats to light. Empty when nothing is chosen, which means the chart draws as normal. */
  lit: Set<string>;
  /** Every duty with something wrong in it, worst first. */
  broken: ChainReading[];
}

export async function chainFor(tenantId: string, chosen: string | null): Promise<ChainView> {
  const links = await linksFor(tenantId).catch(() => [] as Link[]);
  const key = chosen && isObligation(chosen) ? chosen : null;
  const obligation = key ? OBLIGATIONS.find(o => o.key === key)! : null;
  const reading = obligation ? readChain(obligation, links) : null;

  return {
    chosen: key,
    reading,
    lit: new Set(reading?.roleIds ?? []),
    broken: brokenChains(links),
  };
}

/** Put a seat on a duty. One row per obligation and link. */
export async function setLink(input: {
  tenantId: string; obligation: string; link: string; duty: string; roleId: string | null;
}): Promise<void> {
  await db.insert(schema.chainLinks).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    obligation: input.obligation,
    link: input.link,
    duty: input.duty,
    roleId: input.roleId,
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.chainLinks.tenantId, schema.chainLinks.obligation, schema.chainLinks.link],
    set: { duty: input.duty, roleId: input.roleId, updatedAt: new Date().toISOString() },
  });
}

export { and, eq };
