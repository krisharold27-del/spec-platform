/**
 * Progress claims, retentions and defects, read from what the business already has.
 *
 * Claims are `job_bills` rows of kind `claim` — the same table variations and invoices live in,
 * because they are three views of one fact: a sum against a job that somebody owes or will owe.
 * What genuinely differs is when it may be raised and what must happen before it can be sent, and
 * those are rules in `lib/billing-job` and `lib/claims` rather than three sets of columns.
 *
 * Defects are `callbacks`, which SPEC has held since the rework work on 25 September. A defect and
 * a callback are the same event seen from two sides — the client calls it a defect, the business
 * calls it a callback — and giving them separate tables would mean a business counting the same
 * return trip twice in two places and reconciling them by hand.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  claimWatch, needsAttention, claimsLine, goAndGetIt, retentionLine, retentionState,
  openDefects, carriedBy, defectsLine, closingOut,
  NO_SOPA, isSetUp,
  type Claim, type ClaimWatch, type SopaSetup, type Retention, type Defect, type Territory,
} from './claims';

export interface ClaimsView {
  setup: SopaSetup;
  setUp: boolean;
  claims: ClaimWatch[];
  /** Only the ones with something to do. What the screen is for. */
  attention: ClaimWatch[];
  claimsSays: string;
  retentions: Retention[];
  dueBack: Retention[];
  retentionSays: string;
  defects: Defect[];
  openDefects: Defect[];
  carried: Defect[];
  defectsSays: string;
  /** One line per job whose defects period has ended. Drafted, never sent. */
  closing: string[];
}

export async function claimsFor(tenantId: string, at: Date = new Date()): Promise<ClaimsView> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);

  const setup: SopaSetup = tenant
    ? {
      territory: (tenant.sopaTerritory as Territory | null) ?? null,
      actName: tenant.sopaActName,
      scheduleWithinDays: tenant.sopaScheduleWithinDays,
      payWithinDays: tenant.sopaPayWithinDays,
      requiredWording: tenant.sopaRequiredWording,
    }
    : NO_SOPA;

  const jobs = await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, client: schema.jobs.client })
    .from(schema.jobs)
    .where(eq(schema.jobs.tenantId, tenantId));
  const jobById = new Map(jobs.map(j => [j.id, j]));

  const billRows = await db.select()
    .from(schema.jobBills)
    .where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.kind, 'claim')));

  const claims: Claim[] = billRows.map(b => {
    const job = jobById.get(b.jobId);
    return {
      id: b.id,
      jobId: b.jobId,
      jobRef: job?.ref ?? '',
      client: job?.client ?? 'the client',
      /*
        Claims are referenced by NUMBER by clients and adjudicators alike. A claim with no number
        stored falls back to 1 rather than 0 — there is no claim zero, and printing one would make
        every reference to it wrong in a document that may end up in front of an adjudicator.
      */
      number: b.claimNumber ?? 1,
      amountCents: b.amountCents,
      retentionCents: b.retentionCents,
      servedAt: b.servedAt,
      scheduledAt: b.scheduledAt,
      scheduledCents: b.scheduledCents,
      paidAt: b.paidAt,
    };
  });

  const retentionRows = await db.select()
    .from(schema.retentions)
    .where(eq(schema.retentions.tenantId, tenantId));

  const retentions: Retention[] = retentionRows.map(r => {
    const job = jobById.get(r.jobId);
    return {
      jobId: r.jobId,
      jobRef: job?.ref ?? '',
      client: job?.client ?? 'the client',
      heldCents: r.heldCents,
      releaseTerms: r.releaseTerms,
      defectsEndAt: r.defectsEndAt,
      requestedAt: r.requestedAt,
      releasedAt: r.releasedAt,
    };
  });

  const defects = await defectsFor(tenantId, jobById);

  return {
    setup,
    setUp: isSetUp(setup),
    claims: claims.map(c => claimWatch(c, setup, at)),
    attention: needsAttention(claims, setup, at),
    claimsSays: claimsLine(claims.map(c => claimWatch(c, setup, at)), setup),
    retentions,
    dueBack: goAndGetIt(retentions, at),
    retentionSays: retentionLine(retentions, at),
    defects,
    openDefects: openDefects(defects),
    carried: carriedBy(openDefects(defects)),
    defectsSays: defectsLine(defects),
    closing: retentions
      .map(r => closingOut(r, defects, at))
      .filter((s): s is string => s !== null),
  };
}

/**
 * Defects, which are callbacks seen from the client's side.
 *
 * `freeToUs` comes from whether the callback was PAID — the rule `lib/rework` already holds. A
 * callback the client paid for is a continuation of the job; one they did not is work the business
 * is carrying, and inside a defects period that is exactly what a defect is.
 */
async function defectsFor(
  tenantId: string,
  jobById: Map<string, { id: string; ref: string }>,
): Promise<Defect[]> {
  try {
    const rows = await db.select()
      .from(schema.callbacks)
      .where(eq(schema.callbacks.tenantId, tenantId));

    return rows.map(c => ({
      id: c.id,
      jobId: c.jobId,
      jobRef: jobById.get(c.jobId)?.ref ?? '',
      what: c.what,
      raisedAt: c.createdAt,
      /*
        Free to us when nothing was recovered, which is the rule lib/rework already holds: a return
        trip the client paid for is a continuation of the job, and one they did not is work the
        business is carrying. Inside a defects period, that is exactly what a defect is.
      */
      freeToUs: c.recoveredCents === 0,
      /*
        The status is what says closed; the date is only there if somebody recorded one. A defect
        closed before SPEC kept the date reads as closed with no date, which is true, rather than
        borrowing the date it was raised.
      */
      /*
        Closed is the status; the date is only there if somebody recorded one. A defect closed
        before SPEC kept the date is closed with no date — true — rather than borrowing the date it
        was raised, and it still counts as closed, which is what `closed` is for.
      */
      closed: c.status === 'closed',
      closedAt: c.closedAt,
      productSerial: null,
    }));
  } catch {
    return [];
  }
}

/** Retention held on a job, from what the claims against it withheld. Never invented. */
export async function retentionFromClaims(tenantId: string, jobId: string): Promise<number> {
  const rows = await db.select({ retentionCents: schema.jobBills.retentionCents })
    .from(schema.jobBills)
    .where(and(
      eq(schema.jobBills.tenantId, tenantId),
      eq(schema.jobBills.jobId, jobId),
      inArray(schema.jobBills.kind, ['claim', 'invoice']),
    ));
  return rows.reduce((a, r) => a + (r.retentionCents ?? 0), 0);
}

export { retentionState };
