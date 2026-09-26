/*
  A subcontractor doing their own paperwork on their phone — the promise, kept.

  ── What this is about ─────────────────────────────────────────────────────────────────────────

  The Subcontractors screen said "They set themselves up on their phone in about ten minutes" and
  required a mobile number because "a mobile is how they get the link to set themselves up". There
  was no link. No token was ever issued, no message was ever offered, no route accepted a subbie,
  and the office typed in all six checks by hand.

  So: a required field, justified by a capability that did not exist, in front of a promise nothing
  kept. Three faults, one screen, and every one of them invisible to a unit test — which is why this
  is driven at 390x844 with touch, an iPhone in one hand, the only size that proves anything about a
  page filled in standing next to a ute.

  The four things it has to show:

    A subbie with an EMAIL and no mobile can be added at all.
    The office is handed a message to send, built, not a token to assemble.
    The subbie can record what is theirs, and the DATE is what makes it count.
    They cannot tick the two that are the business's — checked by posting, not by looking.
*/
import { chromium } from 'playwright';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.env.APP_URL ?? process.argv[2] ?? 'http://localhost:3100';
const DB = process.env.DATABASE_URL
  ?? (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
const sql = postgres(DB, { onnotice: () => {} });

const stamp = Date.now();
const BUS = `Subbie Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
/* The office, at a desk. */
const desk = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
/* The subbie, on a phone in one hand. */
const hand = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
});
const office = await desk.newPage();
const phone = await hand.newPage();
const errs = [];
for (const p of [office, phone]) p.on('pageerror', e => errs.push(String(e).slice(0, 200)));

const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await office.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await office.fill('input[name="name"]', 'Kris Harold');
await office.fill('input[name="business"]', BUS);
await office.fill('input[name="email"]', `subbie-${stamp}@journey.test`);
await office.fill('input[name="password"]', 'a-good-password-123');
await office.check('input[name="consent"]').catch(() => {});
await office.waitForTimeout(3000);
await office.click('button[type="submit"]');
await office.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

/* ── An email and no mobile ──────────────────────────────────────────────────────────────────── */

await office.goto(`${BASE}/people?mode=subbies`, { waitUntil: 'networkidle' });
check('THE SUBBIE INVITE SAYS EITHER WILL DO',
  /do not need both/i.test(await office.locator('[data-subbie-either]').innerText()));

const reach = office.locator('input[name="reach"]');
check('THERE IS ONE BOX FOR EITHER', await reach.count() === 1);
check('AND IT IS NOT A MOBILE-ONLY FIELD', await office.locator('input[name="mobile"][required]').count() === 0);

await office.fill('input[name="business"]', 'Walker Electrical');
await office.fill('input[name="contact"]', 'Hemi Walker');
await reach.fill('hemi@walkerelectrical.com.au');
await office.getByRole('button', { name: /^Invite/ }).click();
await office.waitForFunction(() => document.body.innerText.includes('Walker Electrical'), null, { timeout: 20000 })
  .catch(() => {});

const [subbie] = await sql`select id, email, mobile, setup_token from subcontractors where tenant_id = ${tenant.id}`;
check('A SUBBIE WITH ONLY AN EMAIL CAN BE ADDED', Boolean(subbie), 'no subcontractor row');
if (!subbie) await finish();
check('THE ADDRESS IS KEPT', subbie.email === 'hemi@walkerelectrical.com.au', String(subbie.email));
check('AND A LINK IS ISSUED, WHICH IS WHAT THE MOBILE WAS BEING DEMANDED FOR', Boolean(subbie.setup_token));

/* ── The office is handed the message, not the token ─────────────────────────────────────────── */

const message = await office.locator('[data-subbie-link] textarea').first().inputValue().catch(() => '');
check('THE MESSAGE TO SEND IS BUILT', /\/subbie\//.test(message), message.slice(0, 160));
check('AND CARRIES THE BUSINESS NAME, SO A MESSAGE FROM A STRANGER IS NOT A SCAM',
  message.includes(BUS), message.slice(0, 160));

/* ── Their phone ─────────────────────────────────────────────────────────────────────────────── */

await phone.goto(`${BASE}/subbie/${subbie.setup_token}`, { waitUntil: 'networkidle' });
const theirs = await phone.locator('body').innerText();
check('THE LINK OPENS THEIR OWN PAGE', /Walker Electrical/.test(theirs), theirs.replace(/\n/g, ' ').slice(0, 160));
check('IT IS FOUR THINGS, NOT SIX', await phone.locator('[data-subbie-check]').count() === 4);
check('AND IT SAYS WHICH TWO ARE THE OFFICE’S',
  /not holding anything up/i.test(await phone.locator('[data-subbie-not-yours]').innerText()));

/* No horizontal scroll on a phone: a form you have to drag sideways is a form nobody finishes. */
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('IT FITS THE PHONE', overflow <= 1, `${overflow}px of sideways scroll`);

/* The liability certificate, with the date off it — the date is what makes the row worth having. */
const liability = phone.locator('[data-subbie-check="liability"]');
await liability.locator('input[name="expiresAt"]').fill('2027-03-31');
await liability.locator('input[name="note"]').fill('PL-99841');
await liability.getByRole('button', { name: /Send it through|Update it/ }).click();
await phone.waitForFunction(() => document.body.innerText.includes('2027-03-31'), null, { timeout: 20000 })
  .catch(() => {});

const [saved] = await sql`
  select expires_at, state from subbie_checks
  where tenant_id = ${tenant.id} and subbie_id = ${subbie.id} and kind = 'liability'`;
check('WHAT THEY RECORD IS THEIRS, AND IT STICKS', saved?.expires_at === '2027-03-31', String(saved?.expires_at));
check('AND IT COUNTS', saved?.state === 'current', String(saved?.state));

/* ── An ABN that does not add up ─────────────────────────────────────────────────────────────── */

const abn = phone.locator('[data-subbie-check="abn"]');
await abn.locator('input[name="note"]').fill('12345678901');
await abn.getByRole('button', { name: /Send it through|Update it/ }).click();
await phone.waitForFunction(() => document.querySelector('[data-subbie-abn-wrong]') !== null, null, { timeout: 20000 })
  .catch(() => {});

const [abnRow] = await sql`
  select note, state from subbie_checks
  where tenant_id = ${tenant.id} and subbie_id = ${subbie.id} and kind = 'abn'`;
check('A WRONG ABN IS CAUGHT BY ARITHMETIC, NOT BY ASKING THE ATO',
  await phone.locator('[data-subbie-abn-wrong]').count() === 1);
check('  IT IS KEPT, BECAUSE SOMEBODY REFUSED OUTRIGHT JUST STOPS', abnRow?.note === '12345678901');
check('  AND IT DOES NOT COUNT', abnRow?.state === 'missing', String(abnRow?.state));

/* ── The fence ───────────────────────────────────────────────────────────────────────────────── */

check('THERE IS NO BOX FOR THE INDUCTION', await phone.locator('[data-subbie-check="induction"]').count() === 0);
check('NOR FOR THE SUBCONTRACT', await phone.locator('[data-subbie-check="subcontract"]').count() === 0);

/*
  And posting one anyway does not work. The markup not drawing a button is not a rule — a form is a
  thing anybody can post to, and this is the one that puts somebody on a site uninducted.
*/
const posted = await phone.evaluate(async token => {
  const body = new FormData();
  body.set('token', token);
  body.set('kind', 'induction');
  const res = await fetch(location.href, { method: 'POST', body });
  return res.status;
}, subbie.setup_token);

const [sneaked] = await sql`
  select count(*)::int as n from subbie_checks
  where tenant_id = ${tenant.id} and subbie_id = ${subbie.id} and kind = 'induction'`;
check('AND POSTING ONE ANYWAY CHANGES NOTHING', sneaked.n === 0, `${sneaked.n} rows, HTTP ${posted}`);

/* Still not bookable — four of six, which is exactly the point of "all six or none". */
const [status] = await sql`select status from subcontractors where id = ${subbie.id}`;
check('FOUR OF SIX IS NOT CLEAR TO WORK', status.status !== 'active', String(status.status));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
