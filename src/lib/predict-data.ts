import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getRoles } from './queries';
import { goalsFor } from './goals-data';
import { goalLines } from './goals';
import {
  structuralGaps, worthProposing, normaliseTitle,
  type Proposal, type RoleShape,
} from './predict';
import type { Pillar } from './scoring';

/**
 * Reading the chart, asking for what is missing, and remembering the answer.
 *
 * The rules are in lib/predict. This half reads the business, layers Claude's judgement on top of
 * the structural reading where there is a key, and stores proposals so approve and deny mean
 * something after the page is closed.
 */

export interface PredictedRole {
  id: string;
  title: string;
  parentRoleId: string | null;
  parentTitle: string | null;
  why: string;
  stream: string;
  level: string;
  source: 'claude' | 'structure';
}

/** The shape of the chart the reading works from, in a flat number of queries. */
async function shapeOf(tenantId: string): Promise<RoleShape[]> {
  const roles = await getRoles(tenantId);
  if (roles.length === 0) return [];
  const criteria = await db.select().from(schema.criteria)
    .where(and(
      inArray(schema.criteria.roleId, roles.map(r => r.id)),
      eq(schema.criteria.active, true),
    ));
  return roles.map(r => ({
    id: r.id,
    title: r.title,
    stream: r.stream,
    level: r.level,
    reportsToRoleId: r.reportsToRoleId,
    pillars: [...new Set(criteria.filter(c => c.roleId === r.id && c.kpi).map(c => c.pillar as Pillar))],
    filled: Boolean(r.holder || r.pencilled),
  }));
}

/** Proposals waiting on a decision, newest reading first. */
export async function pendingPredictions(tenantId: string): Promise<PredictedRole[]> {
  const rows = (await db.select().from(schema.predictedRoles)
    .where(eq(schema.predictedRoles.tenantId, tenantId)))
    .filter(r => r.state === 'pending')
    .sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));
  if (rows.length === 0) return [];

  const roles = await getRoles(tenantId);
  const titleOf = new Map(roles.map(r => [r.id, r.title]));
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    parentRoleId: r.parentRoleId,
    parentTitle: r.parentRoleId ? titleOf.get(r.parentRoleId) ?? null : null,
    why: r.why,
    stream: r.stream,
    level: r.level,
    source: r.source === 'claude' ? 'claude' : 'structure',
  }));
}

/**
 * Read the chart and store anything new worth proposing.
 *
 * Safe to run repeatedly: nothing already on the chart, already proposed, or already REFUSED is
 * proposed again. That last one is the difference between a colleague and a nag.
 *
 * Returns how many were added, so the page can say "nothing new" rather than looking broken when a
 * reading finds a business that is already complete — which is the answer a well-drawn chart should
 * get, and should feel like a result rather than a failure.
 */
export async function readTheChart(tenantId: string, opts: { useClaude?: boolean } = {}): Promise<number> {
  const shape = await shapeOf(tenantId);
  if (shape.length === 0) return 0;

  const existing = await db.select().from(schema.predictedRoles)
    .where(eq(schema.predictedRoles.tenantId, tenantId));

  const structural = structuralGaps(shape);
  const fromClaude = opts.useClaude === false ? [] : await askClaude(tenantId, shape);

  /*
    Structural findings first, and Claude's second.

    Both go through the same filter, and where they collide the structural one wins — it was added
    to the list first, and `worthProposing` keeps the first of any duplicate title. That is the
    right way round: if both say a Head of Operations is missing, the reason a leader should read is
    the one they can check against their own chart, not the one they have to take on trust.
  */
  const fresh = worthProposing(
    [...structural, ...fromClaude],
    shape.map(r => r.title),
    existing.map(r => r.title),
  );
  if (fresh.length === 0) return 0;

  const claudeTitles = new Set(fromClaude.map(p => normaliseTitle(p.title)));
  const now = new Date().toISOString();
  for (const p of fresh) {
    await db.insert(schema.predictedRoles).values({
      id: randomUUID(),
      tenantId,
      title: p.title,
      parentRoleId: p.parentRoleId,
      why: p.why,
      stream: p.stream,
      level: p.level,
      state: 'pending',
      // Structural findings are listed first, so a title in both is credited to the structure —
      // which is the half a leader can verify.
      source: claudeTitles.has(normaliseTitle(p.title))
        && !structural.some(s => normaliseTitle(s.title) === normaliseTitle(p.title))
        ? 'claude' : 'structure',
      proposedAt: now,
    });
  }
  return fresh.length;
}

/**
 * Approve one: it becomes a real role, and the proposal keeps a pointer to it.
 *
 * The role is created here rather than by handing off to addRole, because addRole reads a template
 * id out of a form and applies the one-head-per-stream guard against a form post. A proposal has
 * already been through that guard — the structural reading only proposes a head for a stream that
 * has none — and carries its own stream and level, so there is nothing to look up.
 *
 * It arrives with NO KPIs, deliberately. A proposed role is a proposal about the SHAPE of the
 * business; what it measures is the next conversation, and a role that silently arrived with six
 * criteria somebody never agreed to is how a scorecard stops being theirs.
 */
export async function approvePrediction(tenantId: string, id: string, by: string | null): Promise<string | null> {
  const [row] = await db.select().from(schema.predictedRoles)
    .where(and(eq(schema.predictedRoles.id, id), eq(schema.predictedRoles.tenantId, tenantId)));
  if (!row || row.state !== 'pending') return null;

  const roles = await getRoles(tenantId);
  // The chart moved since the reading: a role with this title now exists, or the parent is gone.
  if (roles.some(r => normaliseTitle(r.title) === normaliseTitle(row.title))) {
    await db.update(schema.predictedRoles)
      .set({ state: 'denied', decidedAt: new Date().toISOString(), decidedBy: by })
      .where(eq(schema.predictedRoles.id, id));
    return null;
  }
  const parentId = row.parentRoleId && roles.some(r => r.id === row.parentRoleId)
    ? row.parentRoleId
    : roles.find(r => r.level === 'gm')?.id ?? null;

  const roleId = randomUUID();
  await db.insert(schema.roles).values({
    id: roleId,
    tenantId,
    title: row.title,
    stream: row.stream,
    level: row.level,
    defaultAccess: row.level === 'staff' ? 'readonly' : 'full',
    reportsToRoleId: parentId,
    sortOrder: roles.length,
  });
  await db.update(schema.predictedRoles)
    .set({ state: 'approved', decidedAt: new Date().toISOString(), decidedBy: by, roleId })
    .where(eq(schema.predictedRoles.id, id));
  return roleId;
}

/** Deny one. It is kept, so the same proposal is never made twice. */
export async function denyPrediction(tenantId: string, id: string, by: string | null): Promise<void> {
  await db.update(schema.predictedRoles)
    .set({ state: 'denied', decidedAt: new Date().toISOString(), decidedBy: by })
    .where(and(eq(schema.predictedRoles.id, id), eq(schema.predictedRoles.tenantId, tenantId)));
}

/* ── Claude's half ─────────────────────────────────────────────────────────────────────────────── */

const SYSTEM = `You read a small business's org chart and say which roles it is MISSING.

You are given the business's sector, the goals its owner wrote in their own words, and every role on
the chart with who it reports to and which of the four SPEC pillars it measures (Safety, People,
Earnings, Compliance).

Propose at most 3 roles. Fewer is better, and NONE is a valid answer for a well-drawn chart — say so
rather than inventing work.

Rules:
- Propose a role only if its absence is costing this business something you can name.
- The reason must be about THIS business: its sector, its size, its goals, and the specific gap in
  the chart you were shown. Never a generic statement about businesses of this type.
- Every proposal must serve one of the goals given. If it serves none, do not propose it.
- Never propose a role that already exists under a different name.
- parentRoleId must be the id of a role you were given, or null.
- stream is one of: commercial, operations, growth.
- level is one of: manager, supervisor, specialist, technician, apprentice, staff.

Reply with ONLY this JSON, no prose and no code fence:
{"proposals":[{"title":"...","parentRoleId":"...","why":"...","stream":"...","level":"..."}]}`;

const STREAMS = new Set(['commercial', 'operations', 'growth']);
const LEVELS = new Set(['manager', 'supervisor', 'specialist', 'technician', 'apprentice', 'staff']);

/**
 * Claude's reading, or nothing.
 *
 * Never throws. Every failure — no key, a refusal, a timeout, malformed JSON, a proposal pointing at
 * a role that does not exist — returns an empty list, and the structural reading stands on its own.
 * The one thing this must never do is stop a business seeing the holes in its own chart because a
 * third-party API had a bad minute.
 */
async function askClaude(tenantId: string, shape: RoleShape[]): Promise<Proposal[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];

  const [tenant] = await db.select({ sector: schema.tenants.sector, name: schema.tenants.name })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const goals = goalLines(await goalsFor(tenantId));

  /*
    No goals, no ask.

    "Every proposal must serve one of the goals given" is the rule that makes these worth reading,
    and without any goals it cannot be applied — the model would fall back to proposing the roles a
    business of this shape usually has, which is exactly the generic answer this feature exists to
    beat. The structural reading still runs, so the leader is not left with nothing.
  */
  if (goals.length === 0) return [];

  const ids = new Set(shape.map(r => r.id));
  const brief = JSON.stringify({
    sector: tenant?.sector ?? 'unknown',
    goals: goals.map(g => `${g.label} ${g.answer}`),
    roles: shape.map(r => ({
      id: r.id, title: r.title, stream: r.stream, level: r.level,
      reportsTo: r.reportsToRoleId, measures: r.pillars, filled: r.filled,
    })),
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: brief }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return [];
    const parsed = JSON.parse(json) as { proposals?: unknown };
    return clean(parsed.proposals, ids);
  } catch {
    return [];
  }
}

/**
 * Everything coming back from the model is untrusted input.
 *
 * A `parentRoleId` is a foreign key into this business's own roles, and a stream or level is written
 * straight onto a row the whole product reads. A hallucinated id would either break the insert or —
 * worse, if it happened to be a real id — hang a role off another company's chart. So ids are
 * checked against the set that went in, not against the database, and anything unrecognised becomes
 * null rather than being trusted.
 */
function clean(raw: unknown, validIds: Set<string>): Proposal[] {
  if (!Array.isArray(raw)) return [];
  const out: Proposal[] = [];
  for (const r of raw.slice(0, 3)) {
    if (!r || typeof r !== 'object') continue;
    const p = r as Record<string, unknown>;
    const title = typeof p.title === 'string' ? p.title.trim().slice(0, 80) : '';
    const why = typeof p.why === 'string' ? p.why.trim().slice(0, 400) : '';
    if (!title || !why) continue;
    const stream = typeof p.stream === 'string' && STREAMS.has(p.stream) ? p.stream : 'operations';
    const level = typeof p.level === 'string' && LEVELS.has(p.level) ? p.level : 'supervisor';
    const parent = typeof p.parentRoleId === 'string' && validIds.has(p.parentRoleId) ? p.parentRoleId : null;
    out.push({ title, why, stream, level, parentRoleId: parent });
  }
  return out;
}
