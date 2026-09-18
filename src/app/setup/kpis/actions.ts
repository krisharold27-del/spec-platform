'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { validateWeights, evenWeights, PILLARS, type Pillar } from '@/lib/scoring';
import { virtualGmCriteria } from '@/lib/provision';
import { resolveTarget } from '@/lib/targets';
import { refuseTo } from '@/lib/refuse';

/** Save edited criteria for one role. Refuses to save if any pillar's weights don't sum to 100%. */
export async function saveCriteria(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const roleId = String(formData.get('roleId'));
  const roleRows = await db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  const role = roleRows[0];
  if (!role) redirect('/setup/kpis');
  // KPIs belong to the leader of the section: your own role and those beneath it, never a peer's or your leader's.
  if (!(await getScope(user)).canEdit(roleId)) refuseTo('/setup/kpis', 'You can only set KPIs for your own role and the roles beneath it.');

  /*
    ── SPEC does the arithmetic, not the person ─────────────────────────────────────────────────

    Kris, 18 September: *"i need it way easier to add kpi's"*.

    This screen used to carry a Weight % box on every row, defaulting to 50 — including the blank
    spare row at the bottom. So typing a third criterion made that pillar 150%, `validateWeights`
    refused the save, and everything typed across ALL FOUR pillars came back empty. **Adding a KPI
    broke saving**, on the screen that is half the product.

    The rule is still right and still enforced below: a pillar's weights must add to 100 or a
    percentage means nothing. What was wrong is that a leader had to do the sum in order to write
    down something they wanted to measure. So the weights are worked out here and the column is
    gone from the screen.

    The form is still READ for a weight, so an even split is a default rather than a ceiling — if a
    screen ever offers uneven weights again, this keeps them. What it will not do is demand one.
  */
  const gathered: { id: string; pillar: Pillar; text: string; weight: number | null; kpi: boolean; target: string | null }[] = [];
  const ids = new Set<string>();
  for (const [k] of formData.entries()) { const m = k.match(/^c:([^:]+):text$/); if (m) ids.add(m[1]); }
  for (const id of ids) {
    const text = String(formData.get(`c:${id}:text`) ?? '').trim();
    if (!text) continue;
    const given = formData.get(`c:${id}:weight`);
    gathered.push({
      id, pillar: String(formData.get(`c:${id}:pillar`)) as Pillar, text,
      weight: given === null || given === '' ? null : Number(given) / 100,
      // Not on the screen any more. Every criterion on a scorecard is a thing being measured.
      kpi: formData.get(`c:${id}:kpi`) === null ? true : formData.get(`c:${id}:kpi`) === 'on',
      target: String(formData.get(`c:${id}:target`) ?? '').trim() || null,
    });
  }

  const rows: { id: string; pillar: Pillar; text: string; weight: number; kpi: boolean; target: string | null }[] = [];
  for (const pillar of PILLARS) {
    const inPillar = gathered.filter(g => g.pillar === pillar);
    const shares = evenWeights(inPillar.length);
    inPillar.forEach((g, i) => rows.push({ ...g, weight: g.weight ?? shares[i] }));
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

/**
 * Put the virtual GM's eight KPIs onto the top role.
 *
 * ── Why this is a button and not a script I ran ──────────────────────────────────────────────────
 *
 * Kris, 18 September: *"yes put the new kpis on jbi"*. The eight in `seed/criteria_templates.json`
 * are written at sign-up, so changing them reached every business created afterwards and none that
 * already existed — which left JBI, the first real customer, holding the older generic set.
 *
 * The quick answer is a one-off script pointed at the production database. That is exactly the thing
 * this project has decided not to do: the same keyboard holds the only copy of every customer's
 * records, and "just this once" is how a business loses them. So it is a control, in the product,
 * that a manager presses for their own business — auditable, repeatable, and reaching precisely one
 * tenant because that is the only one the signed-in person can touch.
 *
 * Nothing is deleted. The criteria that were there are marked inactive, exactly as an ordinary edit
 * does, so a month that has already been closed keeps the scorecard it was scored against.
 */
export async function loadVirtualGmKpis(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const roleId = String(formData.get('roleId') ?? '');

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role) redirect('/setup/kpis');
  if (!(await getScope(user)).canEdit(roleId)) refuseTo('/setup/kpis', 'That role is outside your part of the chart.');

  /*
    The top role only. These eight are what the BOARD holds the general manager to — "the SPEC
    scorecard IS the board report" — and dropping them onto a supervisor would be handing somebody
    eight things they have no way to move.
  */
  if (role.level !== 'gm') redirect(`/setup/kpis?role=${roleId}&err=${encodeURIComponent('these eight belong to the top role')}`);

  const wanted = virtualGmCriteria();

  for (const existing of await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, roleId))) {
    await db.update(schema.criteria).set({ active: false }).where(eq(schema.criteria.id, existing.id));
  }
  let order = 0;
  for (const { pillar, c } of wanted) {
    /*
      Same split as provisioning: a target written as `{net_profit_target}` is a figure this business
      has not agreed yet, so it goes in as PROPOSED and the agreed target stays empty. A number SPEC
      invented must never read as one somebody signed up to.
    */
    const { target, proposed } = resolveTarget(c.target);
    await db.insert(schema.criteria).values({
      id: randomUUID(), roleId, pillar, text: c.text, weight: c.weight,
      kpi: c.kpi ?? true, target, proposedTarget: proposed, sortOrder: order++,
    });
  }

  revalidatePath('/setup/kpis'); revalidatePath('/my-page'); revalidatePath('/journey');
  revalidatePath(`/scorecard/${roleId}`);
  redirect(`/setup/kpis?role=${roleId}&saved=1`);
}
