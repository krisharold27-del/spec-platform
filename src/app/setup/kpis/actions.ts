'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { validateWeights, type Pillar } from '@/lib/scoring';

/** Save edited criteria for one role. Refuses to save if any pillar's weights don't sum to 100%. */
export async function saveCriteria(formData: FormData) {
  const user = await getCurrentUser(); if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);
  const roleId = String(formData.get('roleId'));
  const roleRows = await db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  const role = roleRows[0];
  if (!role) redirect('/setup/kpis');
  // KPIs belong to the leader of the section: your own role and those beneath it, never a peer's or your leader's.
  if (!(await getScope(user)).canEdit(roleId)) throw new Error('You can only set KPIs for your own role and the roles beneath it.');

  const rows: { id: string; pillar: Pillar; text: string; weight: number; kpi: boolean; target: string | null }[] = [];
  const ids = new Set<string>();
  for (const [k] of formData.entries()) { const m = k.match(/^c:([^:]+):text$/); if (m) ids.add(m[1]); }
  for (const id of ids) {
    const text = String(formData.get(`c:${id}:text`) ?? '').trim();
    if (!text) continue;
    rows.push({
      id, pillar: String(formData.get(`c:${id}:pillar`)) as Pillar, text,
      weight: Number(formData.get(`c:${id}:weight`)) / 100,
      kpi: formData.get(`c:${id}:kpi`) === 'on',
      target: String(formData.get(`c:${id}:target`) ?? '').trim() || null,
    });
  }
  const problems = validateWeights(rows);
  if (problems.length) redirect(`/setup/kpis?role=${roleId}&err=${encodeURIComponent(problems.map(p => `${p.pillar} = ${Math.round(p.total * 100)}%`).join(', '))}`);

  const existing = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleId));
  const keep = new Set(rows.map(r => r.id));
  for (const e of existing) if (!keep.has(e.id)) await db.update(schema.criteria).set({ active: false }).where(eq(schema.criteria.id, e.id));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const e = existing.find(x => x.id === r.id);
    if (e) await db.update(schema.criteria).set({ text: r.text, weight: r.weight, kpi: r.kpi, target: r.target, pillar: r.pillar, sortOrder: i, active: true,
      proposedTarget: e.proposedTarget ?? e.target }).where(eq(schema.criteria.id, r.id));
    else await db.insert(schema.criteria).values({ id: randomUUID(), roleId, pillar: r.pillar, text: r.text, weight: r.weight, kpi: r.kpi, target: r.target, proposedTarget: null, sortOrder: i });
  }
  revalidatePath('/setup/kpis'); revalidatePath('/journey'); revalidatePath(`/scorecard/${roleId}`);
  redirect(`/setup/kpis?role=${roleId}&saved=1`);
}
