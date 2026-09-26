/**
 * Reading a pay run against the seven checks, and the rates it depends on.
 *
 * ── The thing this file must never do ────────────────────────────────────────────────────────────
 *
 * Return a passed check that did not run. `readRun` in lib/pay-run treats a missing result exactly
 * as a failure, and the only way that guarantee can be broken is here — by a query that throws
 * being caught and turned into an empty list which then reads as "nothing failed".
 *
 * So the catch below records the failure as a FAILED check rather than swallowing it. A database
 * SPEC cannot read is a pay run SPEC cannot vouch for, and the approve button must not appear.
 */
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import {
  CHECKS, readRun, whyNotApprovable, ratesReady, oddities,
  RATE_KEYS, RATE_LABELS,
  type CheckKey, type CheckResult, type RunReading, type LegalRate, type RateChange, type Oddity,
} from './pay-run';

export interface PayRunView {
  runId: string | null;
  fromDate: string | null;
  toDate: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  reading: RunReading;
  whyNot: string | null;
  rates: LegalRate[];
  ratesReady: ReturnType<typeof ratesReady>;
  pendingChanges: RateChange[];
  oddities: Oddity[];
}

const isCheckKey = (v: string): v is CheckKey => CHECKS.some(c => c.key === v);

/** Every rate payroll depends on, whether or not anybody has set it. Missing is a real state. */
export async function ratesFor(tenantId: string): Promise<{ rates: LegalRate[]; pending: RateChange[] }> {
  let rows: typeof schema.legalRates.$inferSelect[] = [];
  try {
    rows = await db.select().from(schema.legalRates).where(eq(schema.legalRates.tenantId, tenantId));
  } catch {
    rows = [];
  }
  const byKey = new Map(rows.map(r => [r.rateKey, r]));

  const rates: LegalRate[] = RATE_KEYS.map(key => {
    const row = byKey.get(key);
    return {
      key,
      label: row?.label ?? RATE_LABELS[key],
      value: row?.value ?? null,
      unit: (row?.unit as LegalRate['unit']) ?? (key === 'super' ? 'percent' : 'hours'),
      source: row?.source ?? null,
      checkedAt: row?.checkedAt ?? null,
    };
  });

  const pending: RateChange[] = rows
    .filter(r => r.pendingTo !== null)
    .map(r => ({
      key: r.rateKey,
      label: r.label,
      from: r.value,
      to: r.pendingTo!,
      effective: r.pendingFrom ?? '',
      source: r.pendingSource ?? 'Unknown',
      acceptedAt: null,
    }));

  return { rates, pending };
}

export async function payRunFor(tenantId: string): Promise<PayRunView> {
  const { rates, pending } = await ratesFor(tenantId);
  const ready = ratesReady(rates);

  let run: typeof schema.payRuns.$inferSelect | undefined;
  let results: CheckResult[] = [];
  let readFailed = false;

  try {
    [run] = await db.select()
      .from(schema.payRuns)
      .where(eq(schema.payRuns.tenantId, tenantId))
      .orderBy(desc(schema.payRuns.fromDate))
      .limit(1);

    if (run) {
      const rows = await db.select()
        .from(schema.payRunChecks)
        .where(and(
          eq(schema.payRunChecks.tenantId, tenantId),
          eq(schema.payRunChecks.payRunId, run.id),
        ));
      results = rows
        .filter(r => isCheckKey(r.checkKey))
        .map(r => ({
          key: r.checkKey as CheckKey,
          state: r.state === 'passed' ? 'passed' : 'failed',
          says: r.says,
          who: r.who ?? undefined,
        }));
    }
  } catch {
    readFailed = true;
  }

  /*
    Two things that FAIL a check rather than being reported beside it.

    A rate that is not set fails the award check, because there is nothing to interpret the award
    with — and an award check that "passed" on missing rates would be the most dangerous green tick
    in the product.

    A read that threw fails everything, for the reason at the top of this file.
  */
  if (readFailed) {
    results = CHECKS.map(c => ({
      key: c.key, state: 'failed' as const,
      says: 'SPEC could not read this run, so it cannot say whether it is right.',
    }));
  } else if (!ready.ready) {
    results = [
      ...results.filter(r => r.key !== 'award'),
      { key: 'award', state: 'failed', says: ready.says },
    ];
  }

  const reading = readRun(results);

  return {
    runId: run?.id ?? null,
    fromDate: run?.fromDate ?? null,
    toDate: run?.toDate ?? null,
    approvedAt: run?.approvedAt ?? null,
    approvedBy: run?.approvedBy ?? null,
    reading,
    whyNot: whyNotApprovable(reading),
    rates,
    ratesReady: ready,
    pendingChanges: pending,
    oddities: await oddDaysIn(tenantId, run?.fromDate ?? null, run?.toDate ?? null),
  };
}

/**
 * Days in this run that are worth asking about.
 *
 * Asked of the supervisor as a gentle prompt, never blocked — a fourteen-hour day on a shutdown is
 * a fourteen-hour day, and the person who knows is the one who was there. See lib/gentle.
 */
async function oddDaysIn(tenantId: string, from: string | null, to: string | null): Promise<Oddity[]> {
  if (!from || !to) return [];
  try {
    const rows = await db.select({
      who: schema.timesheetEntries.personName,
      day: schema.timesheetEntries.day,
      minutes: schema.timesheetEntries.minutes,
    })
      .from(schema.timesheetEntries)
      .where(eq(schema.timesheetEntries.tenantId, tenantId));

    const inRun = rows.filter(r => r.day >= from && r.day <= to);
    /* Summed per person per day: two entries of seven hours is a fourteen-hour day. */
    const byPersonDay = new Map<string, { who: string; date: string; hours: number }>();
    for (const r of inRun) {
      const k = `${r.who}|${r.day}`;
      const found = byPersonDay.get(k) ?? { who: r.who, date: r.day, hours: 0 };
      found.hours += (r.minutes ?? 0) / 60;
      byPersonDay.set(k, found);
    }
    return oddities([...byPersonDay.values()].map(d => ({ ...d, hours: Math.round(d.hours * 10) / 10 })));
  } catch {
    return [];
  }
}

/** Record a check's result against a run. Used by whatever runs the checks. */
export async function recordCheck(input: {
  tenantId: string; payRunId: string; key: CheckKey; passed: boolean; says: string; who?: string;
}): Promise<void> {
  await db.insert(schema.payRunChecks).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    payRunId: input.payRunId,
    checkKey: input.key,
    state: input.passed ? 'passed' : 'failed',
    says: input.says,
    who: input.who ?? null,
    ranAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.payRunChecks.payRunId, schema.payRunChecks.checkKey],
    set: {
      state: input.passed ? 'passed' : 'failed',
      says: input.says,
      who: input.who ?? null,
      ranAt: new Date().toISOString(),
    },
  });
}
