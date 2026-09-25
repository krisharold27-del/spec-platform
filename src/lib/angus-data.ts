/**
 * What the Angus Shield screen reads.
 *
 * ── The architecture rule, in practice ───────────────────────────────────────────────────────────
 *
 * Design 19: *"build Angus Shield on the same tenant, auth and data layer as SPEC so 'connect' is a
 * setting, not an integration. Any connector code written for Xero must not be reused as the Angus
 * Shield path."*
 *
 * So this file has exactly one branch on `financeSource`, and it is about WHERE THE FIGURES COME
 * FROM rather than about which code path runs. On `connector`, SPEC reads whatever the business's
 * accounting system last gave it. On `angus`, it reads the same tables the jobs and invoices are
 * already in — because it IS those tables. There is no client, no token, no mapping and no sync,
 * which is the whole promise, and it stays true only as long as nobody adds one here.
 *
 * ── How much of this is honestly known ───────────────────────────────────────────────────────────
 *
 * Quite a lot of it is not, yet, and that is said on the screen rather than filled in. The four
 * shields each return `unknown` when the business has not set the thing they are measured against,
 * and a review with nothing true to say carries a null finding, which the page prints as "a report
 * that could not be written" rather than as a clean bill of health.
 *
 * That is not modesty. A business reading an invented cash-buffer figure makes a real decision on
 * it, and the failure mode of a made-up finance number is somebody not making payroll.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { financialsFor } from './financials-data';
import type { CurrentUser } from './auth';
import {
  REVIEWS, readiness, switchOffer, sourceTitle, sourceNote, shields,
  type FinanceSource, type Shield, type ShieldSetup, type PreparedReview,
  type SwitchAnswer, type SwitchOffer,
} from './angus';
import type { Figures } from './financials';
import { seatFor } from './seat-of';
import { maySeeMoney } from './sight';

export interface AngusView {
  source: FinanceSource;
  /** The business's own accounting system, where there is one. */
  connectorName: string | null;
  title: string;
  note: string;
  figures: Figures;
  shields: Shield[];
  setup: ShieldSetup;
  reviews: PreparedReview[];
  offer: SwitchOffer;
  /** Whether this viewer may act on any of it. Money is leadership. */
  canAct: boolean;
}

/**
 * How many months of the business's own data sit in SPEC.
 *
 * Counted from the oldest job SPEC holds, because jobs are what the ledger would be built from —
 * counting from the day the business signed up would let an empty account reach six months and be
 * offered a switch with nothing to move.
 */
async function monthsOfData(tenantId: string, now: Date): Promise<number> {
  const [oldest] = await db.select({ createdAt: schema.jobs.createdAt })
    .from(schema.jobs)
    .where(eq(schema.jobs.tenantId, tenantId))
    .orderBy(schema.jobs.createdAt)
    .limit(1);
  if (!oldest?.createdAt) return 0;
  const from = Date.parse(oldest.createdAt);
  if (!Number.isFinite(from)) return 0;
  return Math.floor((now.getTime() - from) / (30 * 86_400_000));
}

/** The reviews SPEC has prepared for the current period, in the design's order. */
async function preparedReviews(tenantId: string): Promise<PreparedReview[]> {
  const rows = await db.select()
    .from(schema.financeReviews)
    .where(eq(schema.financeReviews.tenantId, tenantId))
    .orderBy(desc(schema.financeReviews.periodStart))
    .limit(40);

  /* Newest per review key. A review has a history; the screen is about the current one. */
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!latest.has(r.reviewKey)) latest.set(r.reviewKey, r);

  return REVIEWS.map(kind => {
    const row = latest.get(kind.key);
    return {
      kind,
      finding: row?.finding ?? null,
      signedAt: row?.signedAt ?? null,
      signedBy: row?.signedBy ?? null,
    };
  });
}

export async function angusFor(user: CurrentUser, now = new Date()): Promise<AngusView> {
  const tenantId = user.tenantId;

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const source: FinanceSource = tenant?.financeSource === 'angus' ? 'angus' : 'connector';

  const [financials, reviews, months] = await Promise.all([
    financialsFor(user),
    preparedReviews(tenantId),
    monthsOfData(tenantId, now),
  ]);

  const connectorName = source === 'angus' ? null : financials.ledger.name;

  const setup: ShieldSetup = {
    bufferWeeks: tenant?.bufferWeeks ?? null,
    weeklyCostCents: tenant?.weeklyCostCents ?? null,
    benchmarkMarginPct: tenant?.benchmarkMarginPct ?? null,
  };

  const [oldestDays, seat] = await Promise.all([
    oldestUnpaidDays(tenantId, now),
    seatFor(user),
  ]);

  return {
    source,
    connectorName,
    title: sourceTitle(source, connectorName),
    note: sourceNote(source, connectorName),
    figures: financials.figures,
    setup,
    shields: shields(financials.figures, setup, {
      setAsideCents: tenant?.taxSetAsideCents ?? null,
      /*
        Not worked out yet. Null is the honest value: a margin needs finished jobs with their real
        costs against them, and inventing one here would put a number on the board that nothing
        underneath it supports.
      */
      marginPct: null,
      overdueCents: financials.overdueCents,
      oldestDays,
    }),
    reviews,
    offer: switchOffer(source, months, (tenant?.angusAnswer as SwitchAnswer | null) ?? null),
    /* Money is leadership — the same rule the Jobs tabs are filtered by. */
    canAct: maySeeMoney(seat),
  };
}

/**
 * How old the oldest unpaid invoice is, counted from the day it was sent.
 *
 * Aged from the invoice date rather than from a due date, which is how every aged-debtor report in
 * the trade reads and how the design's own thresholds are written — nothing over 45 days, nothing
 * near 90. The amount itself comes from `financialsFor`, which already works it out; recomputing it
 * here would give the business two figures for one fact, and one of them would eventually be wrong.
 */
async function oldestUnpaidDays(tenantId: string, now: Date): Promise<number | null> {
  const rows = await db.select({ sentAt: schema.jobBills.sentAt, paidAt: schema.jobBills.paidAt })
    .from(schema.jobBills)
    .where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.kind, 'invoice')));

  const sent = rows
    .filter(r => !r.paidAt && r.sentAt)
    .map(r => Date.parse(r.sentAt!))
    .filter(n => Number.isFinite(n));
  if (sent.length === 0) return null;
  return Math.floor((now.getTime() - Math.min(...sent)) / 86_400_000);
}

export { readiness };
