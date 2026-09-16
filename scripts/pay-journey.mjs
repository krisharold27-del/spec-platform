// Can a business that wants to pay actually start?
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// On 16 September, minutes before the first real payment, the product had NO WAY TO START PAYING.
//
// The journey page showed a business with seats its monthly cost and a "Billing" button. Billing
// opens Stripe's customer portal, which needs a Stripe customer, which only exists once a checkout
// has completed. A business that had never paid clicked it and was silently redirected back to the
// page it started on — no message, and no other button anywhere on the site.
//
// /api/stripe/checkout existed, worked, was covered by unit tests, and was reachable from exactly
// one place: a "Fix payment" button shown only when the plan is `lapsed` — a state only a FAILED
// subscription can produce. So the only way to reach the checkout was to have already paid once.
//
// Every test passed. They all tested the rooms; none tested whether you could get into the
// building. So this one walks in the front door like a customer and looks for the way to pay.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/pay-journey.mjs

import { chromium } from 'playwright';
import postgres from 'postgres';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const stamp = Date.now();
const EMAIL = `pay-${stamp}@example.test`;
const BUSINESS = `Pay Test ${stamp}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await b.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition || !detail ? '' : `  — ${detail}`}`);
  if (!condition) failed++;
};

/** What a customer can actually click, read off the rendered page rather than off its text. */
const buttons = () => page.evaluate(() => ({
  startPaying: [...document.querySelectorAll('form[action="/api/stripe/checkout"] button')]
    .map(el => (el.textContent ?? '').trim()),
  billing: [...document.querySelectorAll('form[action="/api/stripe/portal"] button')]
    .map(el => (el.textContent ?? '').trim()),
  free: (document.body.textContent ?? '').includes('Free — nothing to pay yet'),
  cost: (document.body.textContent ?? '').match(/A\$[\d,]+ a month/)?.[0] ?? null,
}));

// ── A real business ──────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.waitForTimeout(3500);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
check('signed up and landed inside', !page.url().includes('/signup'), page.url());

await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle' });
let b1 = await buttons();

// ── THE INVARIANT ────────────────────────────────────────────────────────────────────────────────
// A business is either free, or it has a way to pay. There is no third state, and the third state
// is precisely what shipped: billed, shown a price, and no reachable checkout anywhere.
check(
  'A BUSINESS IS EITHER FREE OR HAS A WAY TO PAY',
  b1.free || b1.startPaying.length > 0,
  `free=${b1.free} startPaying=${b1.startPaying.length} billing=${b1.billing.length} cost=${b1.cost}`,
);

// And it is never shown the portal before it has ever subscribed — the portal has nothing to open.
check(
  'and is never sent to a billing portal it has no subscription for',
  b1.billing.length === 0,
  `billing buttons: ${b1.billing.join(', ')}`,
);

// ── Now put somebody in it, which is what starts the meter ───────────────────────────────────────
const [{ id: tenantId }] = await sql`select id from tenants where name = ${BUSINESS}`;
await sql`
  insert into users (id, tenant_id, email, name, access, invited_at)
  values (${`u-${stamp}`}, ${tenantId}, ${`mate-${stamp}@example.test`}, 'A Mate', 'readonly', now())`;

await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle' });
const b2 = await buttons();

check('a business with people in it is shown what it costs', b2.cost !== null, String(b2.cost));
check(
  'AND IS GIVEN A WAY TO START PAYING',
  b2.startPaying.length > 0,
  `free=${b2.free} startPaying=${b2.startPaying.length} billing=${b2.billing.length}`,
);
check('the button says what it does', b2.startPaying.some(t => /start paying/i.test(t)), b2.startPaying.join(', '));
check('it still has no portal to send them to', b2.billing.length === 0);

// ── The button actually reaches Stripe ───────────────────────────────────────────────────────────
// Not "a form exists" — the server has to accept the post and try to open a checkout. Without a
// Stripe key configured it redirects with a reason, which is the honest failure and still proves
// the route was reached.
const after = await page.evaluate(async () => {
  const res = await fetch('/api/stripe/checkout', { method: 'POST', redirect: 'manual' });
  return { status: res.status, type: res.type };
});
check('the checkout route answers the button', after.status !== 404 && after.status !== 405, JSON.stringify(after));

// ── Once subscribed, the start button goes and the portal appears ────────────────────────────────
await sql`update tenants set stripe_subscription_id = 'sub_test', stripe_customer_id = 'cus_test', plan = 'basic' where id = ${tenantId}`;
await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle' });
const b3 = await buttons();
check('ONCE SUBSCRIBED THE START BUTTON GOES AWAY', b3.startPaying.length === 0, b3.startPaying.join(', '));
check('and the billing portal takes over', b3.billing.length > 0, b3.billing.join(', '));

// ── And the portal never bounces somebody back in silence ────────────────────────────────────────
// Reaching the portal with no Stripe customer used to reload the same page with nothing said, which
// is how a leader ends up clicking the same button over and over.
await sql`update tenants set stripe_customer_id = null where id = ${tenantId}`;
await page.goto(`${BASE}/journey?no_subscription=1`, { waitUntil: 'networkidle' });
const said = await page.textContent('body');
check(
  'a portal with nothing to show SAYS SO rather than reloading the page',
  (said ?? '').includes('no subscription to manage yet'),
);

check('no console errors', errors.length === 0, errors.join(' | '));

await sql.end();
await b.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
