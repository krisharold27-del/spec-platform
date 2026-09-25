import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The live error log, 25 September: six `checkout.session.completed` deliveries naming a tenant the
 * production database has never had (a checkout started from another environment on the same
 * Stripe account). Opening its first period failed on the tenant reference, the webhook answered
 * 500, and Stripe went on retrying. A first period is opened only for a business the update found.
 */
describe('a checkout for a business this database does not have', () => {
  const handler = readFileSync('src/app/api/stripe/webhook/route.ts', 'utf8');
  const checkout = handler.slice(handler.indexOf("case 'checkout.session.completed'"), handler.indexOf("case 'invoice.payment_failed'"));

  it('reads back which business the update actually found', () => {
    expect(checkout).toMatch(/\.returning\(\{ id: schema\.tenants\.id \}\)/);
  });

  it('opens a first period only when it found one', () => {
    expect(checkout).toMatch(/if \(updated\.length\) await openFirstPeriod\(tenantId\)/);
    expect(checkout.match(/openFirstPeriod\(/g)).toHaveLength(1);
  });
});
