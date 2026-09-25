import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getStripe } from './stripe';
import { claimGuarantee, type ClaimOutcome, type CreditStore, type CreditRow } from './guarantee';

/** `guarantee_credits`, as lib/guarantee's store. The unique (tenant, month) index does the claiming. */
export const dbCreditStore: CreditStore = {
  async claim(tenantId, month, reportedBy) {
    const now = new Date().toISOString();
    const rows = await db.insert(schema.guaranteeCredits)
      .values({ id: randomUUID(), tenantId, month, status: 'pending', reportedBy, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: schema.guaranteeCredits.id });
    return rows.length > 0;
  },
  async find(tenantId, month) {
    const [row] = await db.select().from(schema.guaranteeCredits)
      .where(and(eq(schema.guaranteeCredits.tenantId, tenantId), eq(schema.guaranteeCredits.month, month)));
    return row ? (row as CreditRow) : null;
  },
  async settle(tenantId, month, set) {
    await db.update(schema.guaranteeCredits)
      .set({ ...set, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.guaranteeCredits.tenantId, tenantId), eq(schema.guaranteeCredits.month, month)));
  },
};

/** Take this month off the business's bill, once. Never throws: a failure is recorded and retried. */
export async function applyGuarantee(tenantId: string, month: string, reportedBy: string, resumePending = false): Promise<ClaimOutcome> {
  try {
    const [t] = await db.select({
      customerId: schema.tenants.stripeCustomerId, subscriptionId: schema.tenants.stripeSubscriptionId,
    }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    const outcome = await claimGuarantee({
      store: dbCreditStore, stripe: getStripe(), tenantId, month, reportedBy, resumePending,
      billing: { customerId: t?.customerId ?? null, subscriptionId: t?.subscriptionId ?? null },
    });
    console.log(`[guarantee] ${tenantId} ${month}: ${outcome}`);
    return outcome;
  } catch (e) {
    console.error(`[guarantee] ${tenantId} ${month}: failed before Stripe`, e);
    return 'failed';
  }
}
