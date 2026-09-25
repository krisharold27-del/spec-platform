import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import {
  claimGuarantee, monthlyCharge, guaranteeKey, guaranteeMessage, creditLabel, monthName, isClaimOutcome,
  type CreditStore, type CreditRow,
} from '../src/lib/guarantee';

/**
 * The Simple Guarantee, paid automatically (Kris, 25 September): a business says something was not
 * simple, and that month's subscription comes off the bill — once per business per month.
 *
 * Stripe's API cannot be reached from where this was written, and the only account the Stripe
 * connector exposes is LIVE, so the credit is proven here against a stand-in for Stripe's own HTTP
 * API, driven by the real `stripe` library — the same requests, idempotency headers and all, that
 * production sends. `scripts/guarantee-stripe-check.mts` runs the same claim against a real Stripe
 * TEST key (it refuses a live one).
 */

type Txn = { id: string; object: 'customer_balance_transaction'; amount: number; currency: string; description: string; metadata: Record<string, string>; customer: string };

const fake = {
  txns: [] as Txn[],
  posts: [] as { path: string; idempotencyKey: string | undefined; body: URLSearchParams }[],
  idem: new Map<string, Txn>(),
  failNext: 0,
  subscription: {
    id: 'sub_test', object: 'subscription', currency: 'aud', customer: 'cus_test',
    items: { object: 'list', data: [
      { id: 'si_lead', quantity: 1, price: { id: 'price_lead', unit_amount: 13400, recurring: { interval: 'month', interval_count: 1 } } },
      { id: 'si_team', quantity: 3, price: { id: 'price_team', unit_amount: 1700, recurring: { interval: 'month', interval_count: 1 } } },
    ] },
  },
  reset() { this.txns = []; this.posts = []; this.idem.clear(); this.failNext = 0; },
};

let server: Server;
let stripe: Stripe;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const url = new URL(req.url ?? '/', 'http://x');
      const bal = url.pathname.match(/^\/v1\/customers\/([^/]+)\/balance_transactions$/);
      if (fake.failNext > 0) { fake.failNext--; return send(400, { error: { type: 'invalid_request_error', message: 'Stripe said no' } }); }
      if (bal && req.method === 'GET') {
        return send(200, { object: 'list', has_more: false, url: url.pathname, data: fake.txns.filter(t => t.customer === bal[1]).reverse() });
      }
      if (bal && req.method === 'POST') {
        const body = new URLSearchParams(raw);
        const key = req.headers['idempotency-key'] as string | undefined;
        fake.posts.push({ path: url.pathname, idempotencyKey: key, body });
        if (key && fake.idem.has(key)) return send(200, fake.idem.get(key));
        const metadata: Record<string, string> = {};
        for (const [k, v] of body) { const m = k.match(/^metadata\[(.+)\]$/); if (m) metadata[m[1]] = v; }
        const txn: Txn = {
          id: `cbtxn_${fake.txns.length + 1}`, object: 'customer_balance_transaction', customer: bal[1],
          amount: Number(body.get('amount')), currency: String(body.get('currency')),
          description: String(body.get('description')), metadata,
        };
        fake.txns.push(txn);
        if (key) fake.idem.set(key, txn);
        return send(200, txn);
      }
      if (url.pathname === `/v1/subscriptions/${fake.subscription.id}` && req.method === 'GET') return send(200, fake.subscription);
      send(404, { error: { type: 'invalid_request_error', message: `No route ${req.method} ${url.pathname}` } });
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  stripe = new Stripe('sk_test_offline', { host: '127.0.0.1', port, protocol: 'http', maxNetworkRetries: 0 });
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

/** The unique (tenant, month) index, in memory. */
function memoryStore(): CreditStore & { rows: CreditRow[] } {
  const rows: CreditRow[] = [];
  const find = (t: string, m: string) => rows.find(r => r.tenantId === t && r.month === m) ?? null;
  return {
    rows,
    async claim(tenantId, month) {
      if (find(tenantId, month)) return false;
      rows.push({ tenantId, month, status: 'pending', amount: 0, currency: null, stripeTransactionId: null, error: null });
      return true;
    },
    async find(t, m) { return find(t, m); },
    async settle(t, m, set) { Object.assign(find(t, m)!, set); },
  };
}

const paying = { customerId: 'cus_test', subscriptionId: 'sub_test' };
const claim = (store: CreditStore, month = '2026-09', over: Partial<Parameters<typeof claimGuarantee>[0]> = {}) =>
  claimGuarantee({ store, stripe, billing: paying, tenantId: 't1', month, reportedBy: 'Dana', ...over });

beforeEach(() => fake.reset());

describe('what a month is worth', () => {
  it('is what the subscription charges each month — one leadership seat and three team seats', () => {
    expect(monthlyCharge(fake.subscription as never)).toEqual({ amount: 13400 + 3 * 1700, currency: 'aud' });
  });

  it('counts monthly prices only, and nothing at all is nothing to credit', () => {
    const yearly = { currency: 'aud', items: { data: [{ quantity: 1, price: { unit_amount: 99900, recurring: { interval: 'year', interval_count: 1 } } }] } };
    expect(monthlyCharge(yearly as never)).toBeNull();
    expect(monthlyCharge({ currency: 'aud', items: { data: [] } } as never)).toBeNull();
  });
});

describe('the month comes off the bill', () => {
  it('as a credit on the customer’s balance for one month, tagged with the business and the month', async () => {
    const store = memoryStore();
    expect(await claim(store)).toBe('applied');

    expect(fake.txns).toHaveLength(1);
    const [txn] = fake.txns;
    expect(txn.amount).toBe(-(13400 + 3 * 1700));
    expect(txn.currency).toBe('aud');
    expect(txn.metadata).toEqual({ kind: 'simple_guarantee', tenantId: 't1', month: '2026-09' });
    expect(txn.description).toBe('Simple Guarantee — 2026-09 on us');

    expect(fake.posts[0].idempotencyKey).toBe(guaranteeKey('t1', '2026-09'));
    expect(store.rows[0]).toMatchObject({ status: 'applied', amount: 18500, currency: 'aud', stripeTransactionId: txn.id, error: null });
  });

  it('never twice in a month: the second claim is recognised and Stripe is not asked again', async () => {
    const store = memoryStore();
    await claim(store);
    expect(await claim(store)).toBe('already');
    expect(await claim(store)).toBe('already');
    expect(fake.txns).toHaveLength(1);
    expect(fake.posts).toHaveLength(1);
  });

  it('never twice even when two people press it at the same moment', async () => {
    const store = memoryStore();
    const outcomes = await Promise.all([claim(store), claim(store), claim(store)]);
    expect(outcomes.filter(o => o === 'applied')).toHaveLength(1);
    expect(fake.txns).toHaveLength(1);
  });

  it('never twice even if SPEC’s own record were lost: Stripe’s balance already says this month is done', async () => {
    await claim(memoryStore());
    const forgetful = memoryStore();
    expect(await claim(forgetful)).toBe('already');
    expect(fake.txns).toHaveLength(1);
    expect(forgetful.rows[0]).toMatchObject({ status: 'applied', stripeTransactionId: fake.txns[0].id });
  });

  it('never twice through a retried request: the idempotency key returns the first credit', async () => {
    const one = await stripe.customers.createBalanceTransaction('cus_test', { amount: -100, currency: 'aud' }, { idempotencyKey: guaranteeKey('t9', '2026-09') });
    const two = await stripe.customers.createBalanceTransaction('cus_test', { amount: -100, currency: 'aud' }, { idempotencyKey: guaranteeKey('t9', '2026-09') });
    expect(two.id).toBe(one.id);
    expect(fake.txns).toHaveLength(1);
  });

  it('but a new month is a new claim', async () => {
    const store = memoryStore();
    await claim(store, '2026-09');
    expect(await claim(store, '2026-10')).toBe('applied');
    expect(fake.txns.map(t => t.metadata.month)).toEqual(['2026-09', '2026-10']);
  });

  it('and another business is its own claim', async () => {
    const store = memoryStore();
    await claim(store);
    expect(await claim(store, '2026-09', { tenantId: 't2' })).toBe('applied');
    expect(fake.txns).toHaveLength(2);
  });
});

describe('when there is nothing to take off, or Stripe cannot do it', () => {
  it('a business not paying yet is recorded as on us, and Stripe is never called', async () => {
    const store = memoryStore();
    expect(await claim(store, '2026-09', { billing: { customerId: null, subscriptionId: null } })).toBe('free');
    expect(fake.posts).toHaveLength(0);
    expect(store.rows[0].status).toBe('free');
    expect(await claim(store, '2026-09', { billing: { customerId: null, subscriptionId: null } })).toBe('already');
  });

  it('a Stripe failure is recorded as failed, and the next claim tries again and credits once', async () => {
    const store = memoryStore();
    fake.failNext = 1;
    expect(await claim(store)).toBe('failed');
    expect(store.rows[0]).toMatchObject({ status: 'failed', error: 'Stripe said no' });
    expect(fake.txns).toHaveLength(0);

    expect(await claim(store)).toBe('applied');
    expect(await claim(store)).toBe('already');
    expect(fake.txns).toHaveLength(1);
    expect(store.rows[0].status).toBe('applied');
  });

  it('no billing key on the deployment is a failure to retry, not a silent success', async () => {
    const store = memoryStore();
    expect(await claim(store, '2026-09', { stripe: null })).toBe('failed');
    expect(store.rows[0].error).toMatch(/not configured/);
  });

  it('a claim interrupted part-way is left alone by the business, and finished by /admin’s Try again', async () => {
    const store = memoryStore();
    await store.claim('t1', '2026-09', 'Dana'); // pending, and whoever held it never came back
    expect(await claim(store)).toBe('already');
    expect(fake.txns).toHaveLength(0);
    expect(await claim(store, '2026-09', { resumePending: true })).toBe('applied');
    expect(fake.txns).toHaveLength(1);
  });
});

describe('what the business is told', () => {
  it('in plain words, with the thanks', () => {
    expect(guaranteeMessage('applied', '2026-09')).toBe('That month’s on us — thanks for telling us.');
    expect(guaranteeMessage('free', '2026-09')).toBe('That month’s on us — thanks for telling us.');
    expect(guaranteeMessage('already', '2026-09')).toContain('September 2026 is already on us');
    expect(guaranteeMessage('failed', '2026-09')).toContain('September 2026 is on us');
  });

  it('reads only outcomes it knows from the address', () => {
    expect(['applied', 'free', 'already', 'failed'].every(isClaimOutcome)).toBe(true);
    expect(isClaimOutcome('1')).toBe(false);
    expect(isClaimOutcome(undefined)).toBe(false);
  });

  it('and /admin shows the credit in the business’s own currency', () => {
    expect(creditLabel(18500, 'aud')).toBe('A$185.00');
    expect(creditLabel(8800, 'gbp')).toBe('£88.00');
    expect(monthName('2026-09')).toBe('September 2026');
  });
});

describe('wired in', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('telling SPEC something was not easy applies the credit there and then', () => {
    const action = read('src/app/switch/actions.ts');
    const body = action.slice(action.indexOf('export async function reportFriction'));
    expect(body).toContain('applyGuarantee(user.tenantId, monthOf(), user.name)');
    expect(body).toContain('told=${outcome}');
    expect(read('src/app/switch/page.tsx')).toContain('guaranteeMessage(told, monthOf())');
  });

  it('the claim is open on every area’s page, not only once a switch has started', () => {
    // It lived inside the started-plan branch, so a business that had not begun switching had
    // nowhere to say something was not simple — while the front door promises exactly that.
    const page = read('src/app/switch/page.tsx');
    const planBranchEnds = page.indexOf('        </>\n      )}\n');
    expect(planBranchEnds).toBeGreaterThan(0);
    expect(page.indexOf('data-switch-guarantee')).toBeGreaterThan(planBranchEnds);
  });

  it('one row per business per month, under the tenant policy', () => {
    expect(read('src/db/schema.ts')).toMatch(/uniqueIndex\('guarantee_credits_tenant_month'\)\.on\(t\.tenantId, t\.month\)/);
    expect(read('drizzle/0001_rls.sql')).toContain("'guarantee_credits'");
  });

  it('every credit is on /admin, with a way to retry one that failed', () => {
    const admin = read('src/app/admin/page.tsx');
    expect(admin).toContain('schema.guaranteeCredits');
    expect(admin).toContain('retryGuarantee');
  });
});
