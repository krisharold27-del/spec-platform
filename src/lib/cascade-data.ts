import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getRoles } from './queries';
import { goalsFor } from './goals-data';
import { goalLines } from './goals';
import { isScored } from './today-data';
import {
  gapsAgainstGoal, worthCascading, topDown, key,
  type CascadeRole, type CascadeRow,
} from './cascade';
import { PILLARS, type Pillar } from './scoring';

/**
 * Reading the goal down the chart, and turning a row into a real KPI when the leader takes it.
 *
 * The rules are in lib/cascade. This half reads the business, asks Claude where there is a key, and
 * stores rows so adopt and dismiss mean something after the page is closed.
 */

export interface CascadeKpi {
  id: string;
  roleId: string;
  roleTitle: string;
  pillar: Pillar;
  metric: string;
  target: string;
  why: string;
  source: 'claude' | 'structure';
}

/** How the cascade reads right now, and whether it is the real one or the honest smaller one. */
export interface CascadeView {
  goal: string | null;
  rows: CascadeKpi[];
  /** True when a key is set, so the rows are a real cascade rather than a list of open questions. */
  fromClaude: boolean;
}

async function shapeOf(tenantId: string): Promise<CascadeRole[]> {
  const roles = await getRoles(tenantId);
  if (roles.length === 0) return [];
  const criteria = await db.select().from(schema.criteria)
    .where(and(
      inArray(schema.criteria.roleId, roles.map(r => r.id)),
      eq(schema.criteria.active, true),
    ));
  return roles.map(r => {
    const own = criteria.filter(c => c.roleId === r.id);
    return {
      id: r.id,
      title: r.title,
      stream: r.stream,
      level: r.level,
      measured: [...new Set(own.filter(c => c.kpi).map(c => c.pillar as Pillar))],
      untargeted: own
        .filter(c => c.kpi && !c.target?.trim())
        .map(c => ({ pillar: c.pillar as Pillar, text: c.text })),
      scored: isScored(r.level, own.length),
    };
  });
}

/** The cascade as it stands: pending rows, top of the chart down. */
export async function cascadeFor(tenantId: string): Promise<CascadeView> {
  const goals = goalLines(await goalsFor(tenantId));
  const rows = (await db.select().from(schema.cascadeKpis)
    .where(eq(schema.cascadeKpis.tenantId, tenantId)))
    .filter(r => r.state === 'pending');

  const shape = await shapeOf(tenantId);
  const titleOf = new Map(shape.map(r => [r.id, r.title]));

  const view: CascadeRow[] = rows.map(r => ({
    roleId: r.roleId,
    roleTitle: titleOf.get(r.roleId) ?? '',
    pillar: r.pillar as Pillar,
    metric: r.metric,
    target: r.target,
    why: r.why,
  }));
  const ordered = topDown(view, shape);
  const byKey = new Map(rows.map(r => [key(r.roleId, r.metric), r]));

  return {
    // The goal the cascade hangs off is the middle question — what would make THIS YEAR a win. The
    // three-year answer is the shape of the business, not something a monthly KPI moves.
    goal: goals[1]?.answer ?? goals[0]?.answer ?? null,
    fromClaude: rows.some(r => r.source === 'claude'),
    rows: ordered
      .filter(r => r.roleTitle)
      .map(r => {
        const row = byKey.get(key(r.roleId, r.metric))!;
        return {
          id: row.id,
          roleId: r.roleId,
          roleTitle: r.roleTitle,
          pillar: r.pillar,
          metric: r.metric,
          target: r.target,
          why: r.why,
          source: row.source === 'claude' ? 'claude' as const : 'structure' as const,
        };
      }),
  };
}

/**
 * Work the goal down the chart and store anything new.
 *
 * Returns how many rows were added, and whether Claude produced them — so the page can be honest
 * about which of the two readings the leader is looking at rather than letting them assume.
 */
export async function readTheGoal(tenantId: string): Promise<{ added: number; fromClaude: boolean }> {
  const shape = await shapeOf(tenantId);
  if (shape.length === 0) return { added: 0, fromClaude: false };

  const existingRows = await db.select().from(schema.cascadeKpis)
    .where(eq(schema.cascadeKpis.tenantId, tenantId));
  const criteria = await db.select().from(schema.criteria)
    .where(and(
      inArray(schema.criteria.roleId, shape.map(r => r.id)),
      eq(schema.criteria.active, true),
    ));

  const fromClaude = await askClaude(tenantId, shape);
  const proposed = fromClaude.length > 0 ? fromClaude : gapsAgainstGoal(shape);

  /*
    Only criteria that already have an AGREED TARGET count as "this role measures it".

    A KPI with no target is precisely what one half of the structural reading is for — measured, and
    nothing saying what good looks like. Treating it as taken would have filtered out the finding
    that names it, which is the quiet way a rule cancels itself.
  */
  const fresh = worthCascading(proposed, [
    ...existingRows.map(r => ({ roleId: r.roleId, metric: r.metric })),
    ...criteria.filter(c => c.target?.trim()).map(c => ({ roleId: c.roleId, metric: c.text })),
  ]);
  if (fresh.length === 0) return { added: 0, fromClaude: fromClaude.length > 0 };

  const now = new Date().toISOString();
  for (const r of fresh) {
    await db.insert(schema.cascadeKpis).values({
      id: randomUUID(),
      tenantId,
      roleId: r.roleId,
      pillar: r.pillar,
      metric: r.metric,
      target: r.target,
      why: r.why,
      state: 'pending',
      source: fromClaude.length > 0 ? 'claude' : 'structure',
      proposedAt: now,
    });
  }
  return { added: fresh.length, fromClaude: fromClaude.length > 0 };
}

/**
 * Adopt a row: it becomes a criterion on that role, with the number as a PROPOSAL.
 *
 * `target` is left empty and `proposedTarget` carries the suggestion, which is the whole reason the
 * cascade can be trusted: "a target is agreed with whoever holds the role, never imposed on them."
 * The product already reports how many targets were agreed exactly as first proposed — see
 * lib/boards — so a cascade that wrote the agreed target would have quietly broken a governance
 * number as well as a promise.
 *
 * Weight is halved across the pillar rather than assumed: two KPIs per pillar is the shape the whole
 * system is built around, and a row arriving at 100% would silently outrank whatever is already
 * there.
 */
export async function adoptCascadeRow(tenantId: string, id: string, by: string | null): Promise<string | null> {
  const [row] = await db.select().from(schema.cascadeKpis)
    .where(and(eq(schema.cascadeKpis.id, id), eq(schema.cascadeKpis.tenantId, tenantId)));
  if (!row || row.state !== 'pending') return null;

  // The chart can move between a reading and a decision.
  const roles = await getRoles(tenantId);
  if (!roles.some(r => r.id === row.roleId)) {
    await db.update(schema.cascadeKpis)
      .set({ state: 'dismissed', decidedAt: new Date().toISOString(), decidedBy: by })
      .where(eq(schema.cascadeKpis.id, id));
    return null;
  }

  const inPillar = (await db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, row.roleId), eq(schema.criteria.active, true))))
    .filter(c => c.pillar === row.pillar);

  const criterionId = randomUUID();
  await db.insert(schema.criteria).values({
    id: criterionId,
    roleId: row.roleId,
    pillar: row.pillar,
    text: row.metric,
    // Even split across the pillar. Weights are validated to sum to 100% when the leader saves the
    // scorecard, so this leaves it correct rather than leaving them a sum to fix.
    weight: 1 / (inPillar.length + 1),
    kpi: true,
    target: null,
    proposedTarget: row.target || null,
    sortOrder: inPillar.length,
  });

  // Rebalance the rest of the pillar so the weights still sum to one.
  for (const c of inPillar) {
    await db.update(schema.criteria)
      .set({ weight: 1 / (inPillar.length + 1) })
      .where(eq(schema.criteria.id, c.id));
  }

  await db.update(schema.cascadeKpis)
    .set({ state: 'adopted', decidedAt: new Date().toISOString(), decidedBy: by, criterionId })
    .where(eq(schema.cascadeKpis.id, id));
  return criterionId;
}

/** Dismiss a row. Kept, so the same question is never asked of the same person twice. */
export async function dismissCascadeRow(tenantId: string, id: string, by: string | null): Promise<void> {
  await db.update(schema.cascadeKpis)
    .set({ state: 'dismissed', decidedAt: new Date().toISOString(), decidedBy: by })
    .where(and(eq(schema.cascadeKpis.id, id), eq(schema.cascadeKpis.tenantId, tenantId)));
}

/* ── Claude's half ─────────────────────────────────────────────────────────────────────────────── */

const SYSTEM = `You cascade a small business's GOAL down its org chart.

You are given the sector, the goals the owner wrote in their own words, and every role with its
level, stream, and which of the four SPEC pillars it already measures (Safety, People, Earnings,
Compliance).

For each role that should carry part of the goal, give ONE measure it would have to move, and the
number. Work from the top down: the goal itself sits with the most senior role, and each level below
gets the thing THEY control that feeds it.

Rules:
- At most 6 rows. Fewer is better. A leader handed fourteen suggestions adopts none of them.
- Never propose a measure a role already has.
- The reason must connect the measure to the GOAL, in this business's own terms. "Profit at this
  size is won or lost on billable hours, not on quoting" — not "utilisation is important".
- The target must be a specific number or percentage with its unit.
- roleId must be one of the ids you were given.
- pillar is one of: safety, people, earnings, compliance.

Reply with ONLY this JSON, no prose and no code fence:
{"rows":[{"roleId":"...","pillar":"...","metric":"...","target":"...","why":"..."}]}`;

async function askClaude(tenantId: string, shape: CascadeRole[]): Promise<CascadeRow[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];

  const goals = goalLines(await goalsFor(tenantId));
  // No goal, no cascade. The entire object is "the goal, broken down" — without one there is
  // nothing to break down, and the model would invent a plausible goal to cascade from.
  if (goals.length === 0) return [];

  const [tenant] = await db.select({ sector: schema.tenants.sector })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));

  const scored = shape.filter(r => r.scored);
  if (scored.length === 0) return [];

  const brief = JSON.stringify({
    sector: tenant?.sector ?? 'unknown',
    goals: goals.map(g => `${g.label} ${g.answer}`),
    roles: scored.map(r => ({
      id: r.id, title: r.title, level: r.level, stream: r.stream, alreadyMeasures: r.measured,
    })),
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: brief }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return [];
    const parsed = JSON.parse(json) as { rows?: unknown };
    return clean(parsed.rows, scored);
  } catch {
    return [];
  }
}

/**
 * Everything the model returns is untrusted input.
 *
 * A roleId is a foreign key into this business's own roles: a hallucinated one either breaks the
 * insert or, if it happened to be real, writes a KPI onto another company's scorecard. So ids are
 * checked against the set that went in, and a row naming anything else is dropped rather than
 * repaired — a proposal about a role that does not exist has no correct fix.
 */
function clean(raw: unknown, roles: CascadeRole[]): CascadeRow[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(roles.map(r => [r.id, r]));
  const out: CascadeRow[] = [];
  for (const r of raw.slice(0, 6)) {
    if (!r || typeof r !== 'object') continue;
    const p = r as Record<string, unknown>;
    const role = typeof p.roleId === 'string' ? byId.get(p.roleId) : undefined;
    if (!role) continue;
    const pillar = typeof p.pillar === 'string' && (PILLARS as string[]).includes(p.pillar)
      ? p.pillar as Pillar : null;
    const metric = typeof p.metric === 'string' ? p.metric.trim().slice(0, 120) : '';
    const target = typeof p.target === 'string' ? p.target.trim().slice(0, 60) : '';
    const why = typeof p.why === 'string' ? p.why.trim().slice(0, 400) : '';
    if (!pillar || !metric || !why) continue;
    // A row the role already measures is not a cascade, it is a duplicate.
    if (role.measured.includes(pillar) && !target) continue;
    out.push({ roleId: role.id, roleTitle: role.title, pillar, metric, target, why });
  }
  return out;
}
