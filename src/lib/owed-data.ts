/**
 * What SPEC found the business is owed, and what is on the cards.
 *
 * Both read straight from what SPEC already holds. That is the whole argument for these living
 * here rather than in an accountant's March review: SPEC has the jobs, the spend and the pay runs
 * in front of it every day, and nobody else does.
 */
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import {
  CLAIMS, readOwed, needsChasing, debtorsLine,
  type Found, type OwedReading, type Debt, type DebtWatch,
} from './owed';
import {
  CARD_ROLES, limitsReady, readSpends,
  type Limit, type Spend, type CardReading, type CardRole, type BlockedKey,
} from './angus-card';

export interface OwedView {
  owed: OwedReading;
  debts: DebtWatch[];
  debtorsSays: string;
  limits: Limit[];
  limitsReady: ReturnType<typeof limitsReady>;
  card: CardReading;
}

const isRole = (v: string): v is CardRole => CARD_ROLES.some(r => r.key === v);

export async function owedFor(tenantId: string, now: Date = new Date()): Promise<OwedView> {
  const [claimRows, limitRows, spendRows, jobs] = await Promise.all([
    db.select().from(schema.taxClaims)
      .where(eq(schema.taxClaims.tenantId, tenantId))
      .orderBy(desc(schema.taxClaims.periodStart)),
    db.select().from(schema.cardLimits).where(eq(schema.cardLimits.tenantId, tenantId)),
    db.select().from(schema.cardSpends)
      .where(eq(schema.cardSpends.tenantId, tenantId))
      .orderBy(desc(schema.cardSpends.spentAt))
      .limit(100),
    db.select({ id: schema.jobs.id, ref: schema.jobs.ref }).from(schema.jobs)
      .where(eq(schema.jobs.tenantId, tenantId)),
  ]);

  const refOf = new Map(jobs.map(j => [j.id, j.ref]));

  /* Newest period per claim kind — a claim has a history and the screen is about the current one. */
  const latest = new Map<string, typeof claimRows[number]>();
  for (const r of claimRows) if (!latest.has(r.claimKey)) latest.set(r.claimKey, r);

  const found: Found[] = CLAIMS
    .map(kind => {
      const row = latest.get(kind.key);
      if (!row) return null;
      return {
        kind,
        basis: row.basis,
        /*
          An amount only counts when a source came with it. A plausible number nobody can trace is
          exactly what an audit asks about, and this is the one place it would be easiest to let a
          bare value through.
        */
        amountCents: row.rateSource?.trim() ? row.amountCents : null,
        rateSource: row.rateSource,
        sentAt: row.sentAt,
        sentTo: row.sentTo,
      } satisfies Found;
    })
    .filter((f): f is Found => f !== null);

  const limits: Limit[] = CARD_ROLES.map(r => ({
    role: r.key,
    monthlyCents: limitRows.find(l => l.role === r.key)?.monthlyCents ?? null,
  }));

  const spends: Spend[] = spendRows.map(s => ({
    id: s.id,
    who: s.personName,
    leader: s.leaderName,
    merchant: s.merchant,
    cents: s.cents,
    at: s.spentAt,
    jobRef: s.jobId ? refOf.get(s.jobId) ?? null : null,
    toOverhead: s.toOverhead,
    receiptAt: s.receiptAt,
    blockedAs: (s.blockedAs as BlockedKey | null) ?? null,
  }));

  const debts = await debtsFor(tenantId, now);

  return {
    owed: readOwed(found),
    debts: needsChasing(debts),
    debtorsSays: debtorsLine(debts),
    limits,
    limitsReady: limitsReady(limits),
    card: readSpends(spends, now),
  };
}

/**
 * Unpaid invoices, aged from the day they were sent.
 *
 * From the invoice date, which is how every aged-debtor report in the trade reads and how the
 * design's own thresholds are written — nothing over 45 days, nothing near 90.
 */
async function debtsFor(tenantId: string, now: Date): Promise<Debt[]> {
  try {
    const rows = await db.select({
      id: schema.jobBills.id,
      jobId: schema.jobBills.jobId,
      what: schema.jobBills.what,
      cents: schema.jobBills.amountCents,
      sentAt: schema.jobBills.sentAt,
      paidAt: schema.jobBills.paidAt,
      client: schema.jobs.client,
      ref: schema.jobs.ref,
    })
      .from(schema.jobBills)
      .innerJoin(schema.jobs, and(
        eq(schema.jobs.id, schema.jobBills.jobId),
        eq(schema.jobs.tenantId, tenantId),
      ))
      .where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.kind, 'invoice')));

    return rows
      .filter(r => !r.paidAt && r.sentAt)
      .map(r => {
        const sent = Date.parse(r.sentAt!);
        const days = Number.isFinite(sent) ? Math.floor((now.getTime() - sent) / 86_400_000) : 0;
        return {
          id: r.id,
          client: r.client ?? 'the client',
          ref: r.ref,
          cents: r.cents,
          days,
          /*
            Which reminders have gone is not recorded yet, so this is empty and every due reminder
            reads as outstanding. Honest rather than convenient: pretending one was sent would mean
            the screen quietly stopped asking for an invoice nobody had actually chased.
          */
          remindedAt: [] as number[],
        };
      });
  } catch {
    return [];
  }
}

/** Send a claim to the accountant. Records who it went to, so nobody sends it twice. */
export async function sendToAccountant(input: {
  tenantId: string; claimKey: string; periodStart: string; to: string;
}): Promise<void> {
  await db.update(schema.taxClaims)
    .set({ sentAt: new Date().toISOString(), sentTo: input.to })
    .where(and(
      eq(schema.taxClaims.tenantId, input.tenantId),
      eq(schema.taxClaims.claimKey, input.claimKey),
      eq(schema.taxClaims.periodStart, input.periodStart),
    ));
}

/** Write what SPEC found. Called by whatever does the finding; never invents an amount. */
export async function recordFound(input: {
  tenantId: string; claimKey: string; periodStart: string; basis: string;
  amountCents?: number | null; rateSource?: string | null;
}): Promise<void> {
  await db.insert(schema.taxClaims).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    claimKey: input.claimKey,
    periodStart: input.periodStart,
    basis: input.basis,
    amountCents: input.rateSource?.trim() ? input.amountCents ?? null : null,
    rateSource: input.rateSource ?? null,
    createdAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.taxClaims.tenantId, schema.taxClaims.claimKey, schema.taxClaims.periodStart],
    set: {
      basis: input.basis,
      amountCents: input.rateSource?.trim() ? input.amountCents ?? null : null,
      rateSource: input.rateSource ?? null,
    },
  });
}

export { isRole };
