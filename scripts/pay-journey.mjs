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
  // The words the product actually uses. This looked for "Free — nothing to pay yet", which is a
  // sentence SPEC has never said, so it read false for every business including the free ones —
  // and the invariant below was passing on its other half alone.
  free: (document.body.textContent ?? '').includes('Free —'),
  /*
    The label of a business that IS being charged, in full.

    A loose /A\$\d+ a month/ was not good enough once the first seat became free: the free label
    itself says "A$26 a month for each person you add", so a business paying nothing reported a
    cost. Matching the whole charged sentence is the difference between "this number appears
    somewhere on the page" and "this business is being billed".
  */
  cost: (document.body.textContent ?? '')
    .match(/A\$[\d,]+ a month · \d+ (?:person|people), first seat free/)?.[0] ?? null,
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

// ── The first seat is free ───────────────────────────────────────────────────────────────────────
// Kris, 16 September: "yes do the first seat free". At this point the business contains exactly one
// person — the owner who just signed up — and they have a way in, so countSeats counts them. Before
// this decision they were charged A$26 while the page promised that building was free.
check(
  'A BUSINESS OF ONE PAYS NOTHING',
  b1.free && b1.cost === null,
  `free=${b1.free} cost=${b1.cost}`,
);
check(
  'and is not sent to a checkout for nothing',
  b1.startPaying.length === 0,
  b1.startPaying.join(', '),
);

// ── Now put somebody in it, which is what starts the meter ───────────────────────────────────────
const [{ id: tenantId }] = await sql`select id from tenants where name = ${BUSINESS}`;
await sql`
  insert into users (id, tenant_id, email, name, access, invited_at)
  values (${`u-${stamp}`}, ${tenantId}, ${`mate-${stamp}@example.test`}, 'A Mate', 'readonly', now())`;

await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle' });
const b2 = await buttons();

check('a business with people in it is shown what it costs', b2.cost !== null, String(b2.cost));
// Two people, one seat charged for. The number is the whole decision: A$52 here would mean the free
// seat exists in the label and nowhere else.
check(
  'AND THE SECOND PERSON IS THE FIRST ONE CHARGED FOR',
  b2.cost === 'A$26 a month · 2 people, first seat free',
  `two people, and the page says ${b2.cost}`,
);
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

// ── And it sends them back to the address they came in on ────────────────────────────────────────
//
// The first real test payment worked and finished on the wrong website. The customer signed up on
// www.specbizhq.com; Checkout returned them to app.specbizhq.com, because every link back was built
// from APP_URL, one fixed address. A browser keeps its sign-in per address, so they landed inside a
// different business, under a banner saying their payment had gone through.
//
// Two addresses are needed to catch that, and one is not enough — with a single host, a route that
// ignores the request entirely looks identical to one that reads it. So the same signed-in request
// is made twice, on two names for this machine, and the answer has to follow the request rather than
// APP_URL. Asked from the browser this is unreadable (a manual redirect is opaque to page script),
// so the cookies are carried over and the two requests are made from here, where Location is plain.
const jar = (await page.context().cookies())
  .map(c => `${c.name}=${c.value}`).join('; ');
const alt = new URL(BASE);
alt.hostname = alt.hostname === 'localhost' ? '127.0.0.1' : 'localhost';

const startsOn = async origin => {
  const res = await fetch(`${origin}/api/stripe/checkout`, {
    method: 'POST', redirect: 'manual', headers: { cookie: jar },
  });
  return res.headers.get('location');
};
const [fromBase, fromAlt] = await Promise.all([startsOn(BASE), startsOn(alt.origin)]);

check(
  'a checkout started on one address comes back to THAT address',
  fromBase?.startsWith(BASE) === true,
  `started on ${BASE}, sent back to ${fromBase}`,
);
check(
  'AND A CHECKOUT STARTED ON THE OTHER ADDRESS DOES NOT COME BACK TO THE FIRST',
  fromAlt?.startsWith(alt.origin) === true,
  `started on ${alt.origin}, sent back to ${fromAlt}`,
);

// ── The "payment received" banner has to agree with the page under it ────────────────────────────
//
// `?upgraded=1` is a word in an address bar. It says a checkout finished SOMEWHERE — never that this
// business paid. Shown to the wrong business it reads "Payment received" directly above "Nothing has
// been charged yet", which is what the first real test payment actually produced.
await page.goto(`${BASE}/journey?upgraded=1`, { waitUntil: 'networkidle' });
const unpaid = await page.evaluate(() => document.body.innerText);
check(
  'a business that has NOT paid is never told its payment came through',
  !unpaid.includes('Payment received'),
  unpaid.split('\n').find(l => l.includes('Payment received')) ?? '',
);
check(
  'and is told plainly that the payment was not against it',
  unpaid.includes('nothing is recorded against'),
);

// ── Once subscribed, the start button goes and the portal appears ────────────────────────────────
await sql`update tenants set stripe_subscription_id = 'sub_test', stripe_customer_id = 'cus_test', plan = 'basic' where id = ${tenantId}`;
await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle' });
const b3 = await buttons();
check('ONCE SUBSCRIBED THE START BUTTON GOES AWAY', b3.startPaying.length === 0, b3.startPaying.join(', '));
check('and the billing portal takes over', b3.billing.length > 0, b3.billing.join(', '));

// And the cheerful banner is not withheld from a business that really did pay.
await page.goto(`${BASE}/journey?upgraded=1`, { waitUntil: 'networkidle' });
const paid = await page.evaluate(() => document.body.innerText);
check('a business that HAS paid is told so', paid.includes('Payment received'));

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

// ── And when the payment fails, the customer is told THAT — not that SPEC is broken ──────────────
//
// Kris walked this on 16 September, minutes after cancelling the test subscription. Setup rendered
// fully editable — no banner, live fields, live Add buttons. He typed a name into Head of Commercial
// and clicked Add. The write was correctly refused, and what he was shown was the generic failure
// page: "This page did not load — Something went wrong on our end, not yours", reference ID
// 1007727349.
//
// Both halves of that sentence are untrue, and it is said to somebody whose card has just expired —
// the one moment they most need to hear that their work is safe and this takes two minutes to fix.
await sql`update tenants set plan = 'lapsed' where id = ${tenantId}`;
await page.goto(`${BASE}/setup/business`, { waitUntil: 'networkidle' });

const onArrival = await page.evaluate(() => document.body.innerText);
check(
  'a read-only business is told so BEFORE it types anything',
  onArrival.includes('Read-only until the payment is sorted'),
);
check(
  'and is given the way out on the same line',
  await page.locator('a[href="/journey"]', { hasText: 'Fix payment' }).count() > 0,
);

// Now do exactly what he did.
const naming = page.locator('form:has(input[name="name"])').first();
await naming.locator('input[name="name"]').fill('Head of Commercial');
await naming.locator('button').click();
await page.waitForTimeout(2500);

const afterSaving = await page.evaluate(() => document.body.innerText);
check(
  'A REFUSED SAVE IS NEVER SHOWN AS A FAULT IN SPEC',
  !afterSaving.includes('Something went wrong on our end'),
  afterSaving.split('\n').find(l => l.includes('went wrong')) ?? '',
);
check(
  'and never as a reference number to quote back at us',
  // The wording the error page actually uses. The first version of this check looked for the words
  // "reference ID" — which is what the screen is CALLED, not what it says — so it passed while the
  // error page was on screen. A check that cannot fail is worse than no check.
  !afterSaving.includes('we can find exactly what happened'),
);
check(
  'it says the change was not saved, and why',
  afterSaving.includes('was not saved') && afterSaving.includes('payment'),
);
check(
  'it says nothing has been lost',
  afterSaving.includes('Nothing has been deleted'),
);
check(
  'and leaves them on the page they were working on',
  new URL(page.url()).pathname === '/setup/business',
  page.url(),
);

// The refusal still has to be a refusal. A kind message over a write that went through would be
// worse than the error page.
const [{ n }] = await sql`
  select count(*)::int as n from staff where tenant_id = ${tenantId} and name = 'Head of Commercial'`;
check('AND THE WRITE REALLY WAS BLOCKED', n === 0, `${n} found`);

check('no console errors', errors.length === 0, errors.join(' | '));

await sql.end();
await b.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
