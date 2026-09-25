/**
 * The Simple Guarantee credit, against REAL Stripe test mode.
 *
 * `tests/guarantee.test.ts` proves the claim against a stand-in for Stripe's API, because Stripe
 * could not be reached from where it was written. This runs the same `claimGuarantee` against the
 * real thing, in TEST mode only:
 *
 *   STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/guarantee-stripe-check.mts
 *
 * It makes a throwaway customer on a monthly subscription (invoiced, so no card is needed), claims
 * the guarantee three ways — once, again, and again with SPEC's own record forgotten — and checks
 * Stripe holds exactly ONE credit, worth exactly one month. Then it deletes what it made.
 * It refuses a live key outright: nothing here may ever touch a real customer.
 */
import Stripe from 'stripe';
import { claimGuarantee, type CreditStore, type CreditRow } from '../src/lib/guarantee';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_')) {
  console.error('Refusing: STRIPE_SECRET_KEY must be a TEST key (sk_test_…). This never runs against live.');
  process.exit(1);
}
const stripe = new Stripe(key);

function memoryStore(): CreditStore {
  const rows: CreditRow[] = [];
  const find = (t: string, m: string) => rows.find(r => r.tenantId === t && r.month === m) ?? null;
  return {
    async claim(tenantId, month) {
      if (find(tenantId, month)) return false;
      rows.push({ tenantId, month, status: 'pending', amount: 0, currency: null, stripeTransactionId: null, error: null });
      return true;
    },
    async find(t, m) { return find(t, m); },
    async settle(t, m, set) { Object.assign(find(t, m)!, set); },
  };
}

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const tenantId = `guarantee-check-${Date.now()}`;
const month = new Date().toISOString().slice(0, 7);
const customer = await stripe.customers.create({ name: 'Simple Guarantee check (test)', metadata: { tenantId } });
let subscriptionId = '';
try {
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 30,
    items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: 13400, recurring: { interval: 'month' }, product_data: { name: 'Guarantee check seat' } } }],
  });
  subscriptionId = sub.id;
  const billing = { customerId: customer.id, subscriptionId };
  const store = memoryStore();

  check('first claim credits the month', (await claimGuarantee({ store, stripe, billing, tenantId, month, reportedBy: 'check' })) === 'applied');
  check('second claim is recognised', (await claimGuarantee({ store, stripe, billing, tenantId, month, reportedBy: 'check' })) === 'already');
  check('a claim with SPEC’s record lost is still recognised',
    (await claimGuarantee({ store: memoryStore(), stripe, billing, tenantId, month, reportedBy: 'check' })) === 'already');

  const txns = (await stripe.customers.listBalanceTransactions(customer.id, { limit: 100 })).data
    .filter(t => t.metadata?.kind === 'simple_guarantee');
  check('Stripe holds exactly one credit', txns.length === 1, `${txns.length}`);
  check('worth exactly one month', txns[0]?.amount === -13400, `${txns[0]?.amount}`);
  const after = await stripe.customers.retrieve(customer.id);
  check('the customer’s balance carries it to the next invoice', !('deleted' in after) && after.balance === -13400, `${'balance' in after ? after.balance : '?'}`);
} finally {
  if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch(() => {});
  await stripe.customers.del(customer.id).catch(() => {});
}

console.log(failures.length ? `\n${failures.length} failed` : '\nAll checks passed against Stripe test mode.');
process.exit(failures.length ? 1 : 0);
