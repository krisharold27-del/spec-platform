import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import { CLAUDE_MODEL, anthropicHeaders } from './claude';
import { coverageFor, connectionsFor } from './coverage-data';
import { ledgerConnections } from './virtual-gm-data';
import { standardRate } from './jobs-data';
import {
  fingerprint, wordsKey, wordsSource, wordsHold, WORDS_SYSTEM,
  type Answered, type Recommendation, type Action,
} from './recommends';
import { labourRateAdvice, TOPIC as LABOUR_TOPIC, WINDOW_DAYS } from './labour-rate-advice';
import {
  SWITCH_AREAS, areaOf, checksFor, relevant, switchAdvice, topicOf,
  type BusinessCounts, type Check, type SwitchArea, type SwitchRow, type SwitchState,
} from './switch';

/**
 * Claude recommends, against the database. Thin: every judgement is in lib/recommends and the
 * topic files; this reads the rows they judge, keeps the decision log, and does what a Yes names.
 *
 * Every read and write carries the tenant in the query — the same rule every other table keeps.
 */

const daysAgo = (days: number, now = new Date()) =>
  new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

/* ─────────────────────────────────────────────────────────────────────────────
 * What SPEC can count about a business
 * ───────────────────────────────────────────────────────────────────────────── */

export async function businessCounts(tenantId: string): Promise<BusinessCounts> {
  const [staff, customers, catalogue, jobs, sheets, runs, ledger] = await Promise.all([
    db.select({ startDate: schema.staff.startDate, phone: schema.staff.phone, email: schema.staff.email, inductedAt: schema.staff.inductedAt })
      .from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
    db.select({ id: schema.crmOrganisations.id }).from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, tenantId)),
    db.select({ id: schema.catalogueItems.id }).from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, tenantId)),
    db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId)),
    db.select({ id: schema.timesheetEntries.id }).from(schema.timesheetEntries)
      .where(and(eq(schema.timesheetEntries.tenantId, tenantId), gte(schema.timesheetEntries.day, daysAgo(30)))),
    db.select({ id: schema.payRuns.id }).from(schema.payRuns)
      .where(and(eq(schema.payRuns.tenantId, tenantId), isNotNull(schema.payRuns.checkedAt))),
    ledgerConnections(tenantId),
  ]);
  return {
    staff: staff.length,
    staffWithStart: staff.filter(s => s.startDate).length,
    staffWithContact: staff.filter(s => s.phone || s.email).length,
    staffInducted: staff.filter(s => s.inductedAt).length,
    customers: customers.length,
    catalogue: catalogue.length,
    jobs: jobs.length,
    timesheets30: sheets.length,
    payRunsChecked: runs.length,
    ledgerLinked: ledger.some(l => l.linked && l.orgName !== null && l.status !== 'broken'),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The topics
 * ───────────────────────────────────────────────────────────────────────────── */

export async function labourRateRecommendation(tenantId: string): Promise<Recommendation> {
  const rate = await standardRate(tenantId);
  const since = daysAgo(WINDOW_DAYS);
  const sheets = await db.select({ jobId: schema.timesheetEntries.jobId, minutes: schema.timesheetEntries.minutes, billable: schema.timesheetEntries.billable })
    .from(schema.timesheetEntries)
    .where(and(eq(schema.timesheetEntries.tenantId, tenantId), gte(schema.timesheetEntries.day, since)));
  const total = sheets.reduce((n, s) => n + s.minutes, 0);
  const billable = sheets.filter(s => s.billable && s.jobId).reduce((n, s) => n + s.minutes, 0);

  /*
    This quarter's jobs, costed the way the job board costs them: hours on the job at the standard
    cost rate, plus materials recorded. A job with no hours and no materials is not costed, so it is
    left out rather than counted as a hundred per cent margin.
  */
  const minutesOn = new Map<string, number>();
  for (const s of sheets) if (s.jobId) minutesOn.set(s.jobId, (minutesOn.get(s.jobId) ?? 0) + s.minutes);
  const jobRows = minutesOn.size
    ? await db.select({ id: schema.jobs.id, valueCents: schema.jobs.valueCents, materialsCents: schema.jobs.materialsCents })
      .from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId))
    : [];
  const jobs = jobRows
    .filter(j => minutesOn.has(j.id))
    .map(j => ({
      valueCents: j.valueCents,
      costCents: Math.round(((minutesOn.get(j.id) ?? 0) / 60) * (rate?.costCents ?? 0)) + (j.materialsCents ?? 0),
    }));

  return labourRateAdvice({
    rate: rate ? { id: rate.id, name: rate.name, costCents: rate.costCents, chargeCents: rate.chargeCents } : null,
    minutes: { total, billable },
    jobs,
  });
}

export async function switchRow(tenantId: string, area: string) {
  const [row] = await db.select().from(schema.systemSwitches)
    .where(and(eq(schema.systemSwitches.tenantId, tenantId), eq(schema.systemSwitches.area, area)));
  return row ?? null;
}

export const asSwitchRow = (row: typeof schema.systemSwitches.$inferSelect | null): SwitchRow | null =>
  row ? { state: row.state as SwitchState, ownerReadyAt: row.ownerReadyAt, switchedAt: row.switchedAt } : null;

export interface SwitchReading {
  area: SwitchArea;
  row: SwitchRow | null;
  checks: Check[];
  rec: Recommendation;
}

export async function switchReading(tenantId: string, area: SwitchArea, counts?: BusinessCounts): Promise<SwitchReading> {
  const [c, raw] = await Promise.all([counts ?? businessCounts(tenantId), switchRow(tenantId, area.key)]);
  const row = asSwitchRow(raw);
  const checks = checksFor(area, c);
  return { area, row, checks, rec: switchAdvice(area, row, checks) };
}

/** The areas that show up for this business — accounting and payroll always, the rest when it runs its own. */
export async function relevantAreas(tenantId: string): Promise<SwitchArea[]> {
  const [connections, choices] = await Promise.all([connectionsFor(tenantId), coverageFor(tenantId)]);
  return SWITCH_AREAS.filter(a => relevant(a, { connections, choices }));
}

/** Any topic's recommendation, by name. The one place the list of topics lives. */
export async function recommendationFor(tenantId: string, topic: string): Promise<Recommendation | null> {
  if (topic === LABOUR_TOPIC) return labourRateRecommendation(tenantId);
  if (topic.startsWith('switch:')) {
    const area = areaOf(topic.slice('switch:'.length));
    return area ? (await switchReading(tenantId, area)).rec : null;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The decision log
 * ───────────────────────────────────────────────────────────────────────────── */

export async function lastAnswer(tenantId: string, topic: string): Promise<Answered | null> {
  const [row] = await db.select().from(schema.decisions)
    .where(and(eq(schema.decisions.tenantId, tenantId), eq(schema.decisions.topic, topic)))
    .orderBy(desc(schema.decisions.decidedAt))
    .limit(1);
  return row ? { answer: row.answer as Answered['answer'], fingerprint: row.fingerprint, decidedAt: row.decidedAt, outcome: row.outcome } : null;
}

export async function logDecision(opts: {
  tenantId: string; userName: string; rec: Recommendation; answer: 'yes' | 'not_yet';
  action?: Action; outcome?: 'done' | 'failed';
}): Promise<void> {
  await db.insert(schema.decisions).values({
    id: randomUUID(),
    tenantId: opts.tenantId,
    topic: opts.rec.topic,
    answer: opts.answer,
    fingerprint: fingerprint(opts.rec),
    headline: opts.rec.headline,
    facts: JSON.stringify(opts.rec.facts),
    action: opts.action ? JSON.stringify(opts.action) : null,
    outcome: opts.outcome ?? null,
    decidedBy: opts.userName,
    decidedAt: new Date().toISOString(),
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Doing what a Yes names
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Carry out an action — only ever one a recommendation named, re-derived on the server.
 *
 * `set_labour_rate` changes the charge on the business's own rate, and nothing else. `start_switch`
 * creates the plan; for accounting that is Shadow, which changes nothing anywhere.
 */
export async function carryOut(tenantId: string, userName: string, action: Action): Promise<void> {
  const at = new Date().toISOString();
  if (action.type === 'set_labour_rate') {
    await db.update(schema.labourRates)
      .set({ chargeCents: action.chargeCents })
      .where(and(eq(schema.labourRates.id, action.rateId), eq(schema.labourRates.tenantId, tenantId)));
    return;
  }
  const area = areaOf(action.area);
  if (!area) throw new Error('No such area.');
  const existing = await switchRow(tenantId, area.key);
  if (existing) return;
  await db.insert(schema.systemSwitches).values({
    id: randomUUID(), tenantId, area: area.key,
    // Accounting starts in Shadow — Angus Shield beside the books, changing nothing.
    state: area.key === 'accounting' ? 'side_by_side' : 'requested',
    sideBySideAt: area.key === 'accounting' ? at : null,
    requestedBy: userName, requestedAt: at, updatedAt: at,
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Claude's wording, in the background
 * ───────────────────────────────────────────────────────────────────────────── */

export async function wordsFor(tenantId: string, rec: Recommendation): Promise<string | null> {
  const [row] = await db.select({ text: schema.recommendationWords.text }).from(schema.recommendationWords)
    .where(and(
      eq(schema.recommendationWords.tenantId, tenantId),
      eq(schema.recommendationWords.topic, rec.topic),
      eq(schema.recommendationWords.wordsKey, wordsKey(rec)),
    ));
  return row && wordsHold(rec, row.text) ? row.text : null;
}

/**
 * Ask Claude to word a recommendation, and keep the answer — called from `after()`, so the page is
 * never held up by it. No key, a refusal, a timeout, or wording that dropped a figure: nothing is
 * kept, and SPEC's own wording stands. Only the figures go to Claude — never a person's name.
 */
export async function wordInBackground(tenantId: string, rec: Recommendation): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return;
  try {
    if (await wordsFor(tenantId, rec)) return;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 300, system: WORDS_SYSTEM, messages: [{ role: 'user', content: wordsSource(rec) }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { content: { type: string; text?: string }[] };
    const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    if (!wordsHold(rec, text)) return;
    await db.insert(schema.recommendationWords).values({
      id: randomUUID(), tenantId, topic: rec.topic, wordsKey: wordsKey(rec), text, createdAt: new Date().toISOString(),
    }).onConflictDoNothing();
  } catch {
    // The deterministic wording is already on the page. Nothing to recover.
  }
}

export { topicOf };
