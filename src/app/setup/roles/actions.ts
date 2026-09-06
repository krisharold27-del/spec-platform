'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import templates from '../../../../seed/criteria_templates.json';

type TC = { text: string; weight: number; kpi?: boolean; target?: string };
type TR = { template_id: string; title: string; stream: string; level: string; pnl_view?: string; criteria: Record<string, TC[] | 'organisational_standard'> };

function criteriaFor(t: TR) {
  const out: { pillar: string; c: TC }[] = [];
  for (const [pillar, list] of Object.entries(t.criteria)) {
    const items = list === 'organisational_standard' ? (templates.organisational_standard as unknown as Record<string, TC[]>)[pillar] : list;
    items.forEach(c => out.push({ pillar, c }));
  }
  return out;
}

/** Add a role from a template (Claude's proposal) or a custom one. Roles are created empty. */
export async function addRole(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const templateId = String(formData.get('template') ?? '');
  const reportsTo = String(formData.get('reportsTo') ?? '') || null;
  const customTitle = String(formData.get('title') ?? '').trim();
  const t = (templates.roles as TR[]).find(r => r.template_id === templateId);
  const level = t?.level ?? String(formData.get('level') ?? 'staff');
  const stream = t?.stream ?? String(formData.get('stream') ?? 'operations');
  const count = db.select().from(schema.roles).where(eq(schema.roles.tenantId, user.tenantId)).all().length;
  const rid = randomUUID();
  db.insert(schema.roles).values({
    id: rid, tenantId: user.tenantId, title: customTitle || t?.title || 'New role', stream, level,
    defaultAccess: level === 'staff' ? 'readonly' : 'full', reportsToRoleId: reportsTo, pnlView: t?.pnl_view ?? null, sortOrder: count,
  }).run();
  if (t) criteriaFor(t).forEach((r, j) => db.insert(schema.criteria).values({
    id: randomUUID(), roleId: rid, pillar: r.pillar, text: r.c.text, weight: r.c.weight, kpi: !!r.c.kpi,
    target: r.c.target ?? null, proposedTarget: r.c.target ?? null, sortOrder: j,
  }).run());
  revalidatePath('/setup/roles'); revalidatePath('/org'); revalidatePath('/journey');
}

export async function removeRole(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const id = String(formData.get('roleId'));
  const role = db.select().from(schema.roles).where(and(eq(schema.roles.id, id), eq(schema.roles.tenantId, user.tenantId))).get();
  if (!role || role.level === 'gm') return;
  db.update(schema.roles).set({ active: false }).where(eq(schema.roles.id, id)).run();
  revalidatePath('/setup/roles'); revalidatePath('/org'); revalidatePath('/journey');
}
