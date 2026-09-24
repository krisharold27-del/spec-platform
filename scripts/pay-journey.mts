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
import { SEAT_PRICES } from '../src/lib/pricing';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();
import postgres from 'postgres';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const stamp = Date.now();
const EMAIL = `pay-${stamp}@example.test`;
const BUSINESS = `Pay Test ${stamp}`;

/*
  ── The price is read from the product, never typed here ─────────────────────────────────────────

  This journey carried `A$26` for a team seat. That was right on 19 September and wrong from 22
  September, when every price was matched to what the live Stripe account actually charges and the
  team seat became A$17. Nothing failed at the time, because the copy in this file kept agreeing
  with itself — the journey went on asserting a price SPEC had stopped charging.

  A test that holds its own copy of a number is a test that stops checking the number. So the seat
  price is imported from `lib/pricing` — the same table the product bills from. Change the price
  there and this follows; change it in only one of the two and this is what says so.
*/
const TEAM_SEAT_AUD = SEAT_PRICES.aud.team;

/*
  ── And the page it is decided on ────────────────────────────────────────────────────────────────

  This walked `/journey`, which is where the price and the checkout both used to live. On 22
  September Kris said of what it costs: *"put under pricing"*, and everything that decides the bill
  — seats, Start paying, Stripe's own portal — moved to `/billing`. This file kept opening the old
  page, found no checkout button there, and reported that a paying business had no way to pay.

  That is the same failure in reverse: the journey naming a page the decision has left. It walks
  `/billing` now, because that is where a customer is sent.
*/
const PAY_PAGE = '/billing';

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => b, business: BUSINESS, since: RUN_STARTED });
const page = await (await b.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

/**
 * Is the sign-in stand-in actually answering?
 *
 * Asked only once sign-up has already failed, to tell two very different things apart: SPEC is
 * broken, or the thing SPEC signs people in through is not running. On 16 September those looked
 * identical — five failing checks and a screen reading "That didn't work" — and an hour went on the
 * wrong one. A harness that is not up is not a fault in the product, and reporting it as one is how
 * a verdict stops being trusted.
 *
 * Any answer at all counts as up. It replies 401 to this route, which is correct, and is also why
 * `curl -f` could never be used to wait for it.
 */
async function authStandInUp() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  try {
    await fetch(`${base}/auth/v1/user`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

const HARNESS_DOWN = ' [THE SIGN-IN STAND-IN IS NOT ANSWERING — this is the harness, not SPEC]';

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
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3500);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
const inside = !page.url().includes('/signup');
check(
  'signed up and landed inside',
  inside,
  `${page.url()}${inside || (await authStandInUp()) ? '' : HARNESS_DOWN}`,
);

await page.goto(`${BASE}${PAY_PAGE}`, { waitUntil: 'networkidle' });
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

await page.goto(`${BASE}${PAY_PAGE}`, { waitUntil: 'networkidle' });
const b2 = await buttons();

check('a business with people in it is shown what it costs', b2.cost !== null, String(b2.cost));
// Two people, one seat charged for. The number is the whole decision: twice the seat price here
// would mean the free seat exists in the label and nowhere else. The seat price comes from
// lib/pricing rather than from this file — see the note at the top.
check(
  'AND THE SECOND PERSON IS THE FIRST ONE CHARGED FOR',
  b2.cost === `A$${TEAM_SEAT_AUD} a month · 2 people, first seat free`,
  `two people, and the page says ${b2.cost} — one seat is A$${TEAM_SEAT_AUD}`,
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

// ── The A$44 seat: frontline leaders only, and it has to actually give them something ────────────
//
// Until 16 September the A$44 was a number on three screens with nothing behind it: a column on the
// business, printed on the pricing page, charged by nothing and gating nothing. A business put on it
// paid A$26 and received exactly what every other business received.
//
// Three things have to be true together, and the whole point is that they cannot drift apart: the
// person is billed at the higher rate, the material exists in the business, and it is on the path
// for the role they hold. Billing without the other two is charging A$44 for the A$26 page.
const supervisorId = `sup-${stamp}`;
const supervisorRole = `role-sup-${stamp}`;
const [{ id: gmRoleId }] = await sql`
  select id from roles where tenant_id = ${tenantId} and level = 'gm' limit 1`;

await sql`
  insert into users (id, tenant_id, email, name, access, invited_at)
  values (${supervisorId}, ${tenantId}, ${`sup-${stamp}@example.test`}, 'A Supervisor', 'full', now())`;
await sql`
  insert into roles (id, tenant_id, title, stream, level, default_access, reports_to_role_id, sort_order, active)
  values (${supervisorRole}, ${tenantId}, 'Site Supervisor', 'operations', 'supervisor', 'full', ${gmRoleId}, 9, true)`;
await sql`
  insert into role_assignments (id, role_id, user_id, from_date)
  values (${`ra-${stamp}`}, ${supervisorRole}, ${supervisorId}, now())`;

/*
  ── Eligibility is a pure rule, so it is asked directly ─────────────────────────────────────────

  This block asked `isFrontlineLeader('supervisor')` and asserted `TRAINING_SEAT_ON_SALE === false`.
  Neither survives: on 22 September Kris was asked whether the seat turns on business-wide or per
  person and said *"per-person... on now"*, and the rule was broadened at the same time from a role
  LEVEL string to the chart itself — `eligibleForTrainingSeat`, the same leadership question billing
  resolves from. The control moved off Settings and onto `/training`, beside the material it
  unlocks.

  None of that was caught, because the import above this line could not resolve under plain node and
  the journey crashed here every run. `check.mjs` reported the two checks before the crash and this
  half simply never executed — a journey that stops early looks a lot like a journey that passed.
  It runs through tsx now, which is why the staleness is visible at all.
*/
const { eligibleForTrainingSeat, TRAINING_SEAT_ON_SALE } = await import('../src/lib/pricing');
const asRole = (title: string, hasDirectReports: boolean) => ({ title, hasDirectReports });

check(
  'SOMEBODY WHO LEADS NOBODY IS NEVER OFFERED THE TRAINING SEAT',
  eligibleForTrainingSeat(asRole('Electrician', false)) === false
  && eligibleForTrainingSeat(asRole('Apprentice', false)) === false,
);
check(
  'and somebody who leads people is',
  eligibleForTrainingSeat(asRole('Site Supervisor', true)) === true,
);
/*
  An administrator's override beats the chart, in both directions — because eligibility must never
  disagree with what the person is actually billed as.
*/
check(
  'AN OVERRIDE ONTO THE TEAM SEAT TAKES THE OFFER AWAY, however the chart reads',
  eligibleForTrainingSeat(asRole('Site Supervisor', true), 'team') === false,
);
check(
  'and an override onto the leadership seat grants it',
  eligibleForTrainingSeat(asRole('Electrician', false), 'leadership') === true,
);

/*
  ── And it is on sale, per person, where the material is ───────────────────────────────────────

  The version of this check that ran in September asserted the opposite — that nobody could be put
  on the seat while the supervisor pack was unfinished. That was Kris's 16 September decision and it
  was reversed on the 22nd. What matters now is that an administrator can actually do it, on the
  page that holds the training itself.
*/
check('THE TRAINING SEAT IS ON SALE', TRAINING_SEAT_ON_SALE === true);

await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
const training = await page.evaluate(() => document.body.innerText);
check(
  'the administrator is shown what a training seat costs, per person',
  /Leadership training seats/i.test(training) && /a person a month/i.test(training),
  training.slice(0, 200).replace(/\n/g, ' '),
);
check(
  'AND THERE IS A WAY TO PUT A REAL PERSON ON IT',
  (await page.locator('form:has(input[name="userId"]) button:has-text("Put on training")').count()) > 0,
  'the supervisor inserted above holds a leadership seat, so the control has somebody to offer',
);
/*
  ── Putting somebody on it changes the bill, on the page where it becomes money ─────────────────

  Asked of the PAGE rather than of the column, because a column somebody set is not a charge. The
  earlier version of this check asserted the opposite — that a person on a training seat was NOT
  billed for it — which was right while the supervisor pack was held back and wrong from the moment
  Kris turned it on per person. It never ran again after that to disagree.

  Three people, one free. The supervisor inserted above leads people, so they are on a LEADERSHIP
  seat, and the mate is on a team seat. Putting the supervisor on training must REPLACE the
  leadership rate with the training rate, never stack on top of it — so the bill goes from
  leadership + team to leadershipWithTraining + team, and comes back when they are taken off.
  Every number comes from lib/pricing rather than being written down here, for the reason at the
  top of this file: the version that said "A$70" was checking a price SPEC had stopped charging.
*/
await sql`update users set training_seat = true where id = ${supervisorId}`;
await page.goto(`${BASE}${PAY_PAGE}`, { waitUntil: 'networkidle' });
const withTraining = await page.evaluate(() => document.body.innerText);
const trainingBill = `A$${TEAM_SEAT_AUD + SEAT_PRICES.aud.leadershipWithTraining} a month · 3 people, first seat free`;
check(
  'AND SOMEBODY PUT ON ONE IS ACTUALLY BILLED FOR IT',
  withTraining.includes(trainingBill),
  `${withTraining.match(/A\$[\d,]+ a month · \d+ (?:person|people), first seat free/)?.[0] ?? 'no cost line'} — expected ${trainingBill}`,
);

// And taking them off puts the bill back. A charge that cannot be stopped is the one people notice.
await sql`update users set training_seat = false where id = ${supervisorId}`;
await page.goto(`${BASE}${PAY_PAGE}`, { waitUntil: 'networkidle' });
const withoutTraining = await page.evaluate(() => document.body.innerText);
const plainBill = `A$${TEAM_SEAT_AUD + SEAT_PRICES.aud.leadership} a month · 3 people, first seat free`;
check(
  'AND TAKING THEM BACK OFF PUTS THE BILL BACK',
  withoutTraining.includes(plainBill),
  `${withoutTraining.match(/A\$[\d,]+ a month · \d+ (?:person|people), first seat free/)?.[0] ?? 'no cost line'} — expected ${plainBill}`,
);

// ── The "payment received" banner has to agree with the page under it ────────────────────────────
//
// `?upgraded=1` is a word in an address bar. It says a checkout finished SOMEWHERE — never that this
// business paid. Shown to the wrong business it reads "Payment received" directly above "Nothing has
// been charged yet", which is what the first real test payment actually produced.
await page.goto(`${BASE}${PAY_PAGE}?upgraded=1`, { waitUntil: 'networkidle' });
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
await page.goto(`${BASE}${PAY_PAGE}`, { waitUntil: 'networkidle' });
const b3 = await buttons();
check('ONCE SUBSCRIBED THE START BUTTON GOES AWAY', b3.startPaying.length === 0, b3.startPaying.join(', '));
check('and the billing portal takes over', b3.billing.length > 0, b3.billing.join(', '));

// And the cheerful banner is not withheld from a business that really did pay.
await page.goto(`${BASE}${PAY_PAGE}?upgraded=1`, { waitUntil: 'networkidle' });
const paid = await page.evaluate(() => document.body.innerText);
check('a business that HAS paid is told so', paid.includes('Payment received'));

// ── And the portal never bounces somebody back in silence ────────────────────────────────────────
// Reaching the portal with no Stripe customer used to reload the same page with nothing said, which
// is how a leader ends up clicking the same button over and over.
await sql`update tenants set stripe_customer_id = null where id = ${tenantId}`;
await page.goto(`${BASE}${PAY_PAGE}?no_subscription=1`, { waitUntil: 'networkidle' });
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
// Pointed at PAY_PAGE, not at a written-down address: this link moved with everything else that
// decides the bill, and a banner whose way out leads to the old page is a dead end at the worst
// possible moment.
check(
  'and is given the way out on the same line',
  await page.locator(`a[href="${PAY_PAGE}"]`, { hasText: 'Fix payment' }).count() > 0,
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
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
