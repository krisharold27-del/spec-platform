/*
  Whatever you've got is enough — an owner with a phone number and no email address.

  Kris, 26 September: *"the system accepts an invite by either email or phone number — whatever
  you've got is enough, never both required… Getting them into the system matters more than
  complete details, because the alternative is the owner parks it, means to come back, and never
  does — and now that person isn't in the system at all."*

  ── Why this has to be a browser check ─────────────────────────────────────────────────────────

  The block was in TWO places, and only one of them is reachable from a unit test. The server
  refused with "That does not look like an email address"; the input was `type="email"`, so the
  browser refused first and SPEC was never asked at all. A source test proving the server is now
  generous would have passed all week while a red outline stopped every owner in the country.

  So this types a phone number into the real box, presses the real button, and then asks Postgres
  three things: that the number was kept, that a link exists to send, and that NOTHING was charged —
  because the seat starts when the person finishes their half, not when the owner gives up.
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
const BUS = `Reach Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1400 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `reach-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

/*
  Somebody pencilled onto a card: a name and a role, and no way to email them. This is the ordinary
  state of two thirds of a trade business's list on the first morning.
*/
const [role] = await sql`
  select id from roles where tenant_id = ${tenant.id} and reports_to_role_id is not null limit 1`;
const [anyRole] = role ? [role] : await sql`select id from roles where tenant_id = ${tenant.id} limit 1`;
check('THERE IS A ROLE TO PUT SOMEBODY ON', Boolean(anyRole?.id));
if (!anyRole?.id) await finish();

const staffId = randomUUID();
const now = new Date().toISOString();
await sql`insert into staff ${sql({
  id: staffId, tenant_id: tenant.id, name: 'Hemi Walker', created_at: now,
})}`;
await sql`insert into role_assignments ${sql({
  id: randomUUID(), role_id: anyRole.id, staff_id: staffId, from_date: now.slice(0, 10),
})}`;

/* ── The box itself ──────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
const card = page.locator('[data-org-canvas] [data-role-card]').filter({ hasText: 'Hemi Walker' }).first();
await card.scrollIntoViewIfNeeded().catch(() => {});
await card.click().catch(() => {});

const box = page.locator('#org-invite');
check('THE INVITE BOX IS ON THE CARD', await box.count() === 1);
if (await box.count() !== 1) await finish();

/*
  The browser's own refusal, which is the half a source test cannot see. `type="email"` here meant
  a phone number never left the page.
*/
check('IT DOES NOT REFUSE A NUMBER BEFORE SPEC IS ASKED',
  (await box.getAttribute('type')) !== 'email', `type is ${await box.getAttribute('type')}`);
check('AND SAYS EITHER WILL DO, SO NOBODY HAS TO DISCOVER IT',
  /do not need both/i.test(await page.locator('[data-invite-either]').innerText()));

const PHONE = '0412 345 678';
await box.fill(PHONE);
await page.getByRole('button', { name: /^Invite / }).click();
await page.waitForURL(/texted=/, { timeout: 20000 }).catch(() => {});

/* ── What the owner gets back ────────────────────────────────────────────────────────────────── */

check('A PHONE NUMBER IS NOT A REFUSAL', await page.locator('[data-texted]').count() === 1,
  (await page.locator('body').innerText()).replace(/\n/g, ' ').slice(0, 200));

const said = await page.locator('[data-texted]').innerText().catch(() => '');
check('IT NAMES THE PERSON AND THE NUMBER', /Hemi Walker/.test(said) && said.includes(PHONE),
  said.replace(/\n/g, ' ').slice(0, 200));

/*
  The message itself, ready to send. An owner handed a token and left to build a URL gets one of
  thirty-eight wrong, and that person never finishes.
*/
const message = await page.locator('[data-texted] textarea').inputValue().catch(() => '');
check('THE MESSAGE TO SEND IS THERE, BUILT', /\/join\//.test(message), message.slice(0, 160));
check('AND IT CARRIES THE BUSINESS NAME, SO A TEXT FROM AN UNKNOWN NUMBER IS NOT A SCAM',
  message.includes(BUS), message.slice(0, 160));

/* ── What it did to the database ─────────────────────────────────────────────────────────────── */

const [saved] = await sql`select phone, setup_token, user_id from staff where id = ${staffId}`;
check('THE NUMBER WAS KEPT', saved?.phone === PHONE, String(saved?.phone));
check('AND A LINK WAS ISSUED', Boolean(saved?.setup_token));

/*
  The bill is decided before it is charged. Nothing has been created, so nothing is owed — the seat
  starts when the person finishes their half.
*/
check('NO ACCOUNT WAS CREATED', saved?.user_id === null, String(saved?.user_id));
const [seats] = await sql`select count(*)::int as n from users where tenant_id = ${tenant.id}`;
check('AND NO SECOND SEAT IS BEING CHARGED', seats.n === 1, `${seats.n} accounts`);

/* ── The link works ──────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/join/${saved.setup_token}`, { waitUntil: 'networkidle' });
const join = await page.locator('body').innerText();
check('THE LINK OPENS THEIR OWN PAGE', /Hemi/.test(join), join.replace(/\n/g, ' ').slice(0, 160));
check('AND ASKS FOR THE EMAIL SPEC DID NOT HAVE',
  await page.locator('input[name="email"]').count() >= 1);
check('WITHOUT DEMANDING IT',
  await page.locator('input[name="email"][required]').count() === 0);

/* ── Something that is neither ───────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
const card2 = page.locator('[data-org-canvas] [data-role-card]').filter({ hasText: 'Hemi Walker' }).first();
await card2.scrollIntoViewIfNeeded().catch(() => {});
await card2.click().catch(() => {});
await page.locator('#org-invite').fill('Hemi Walker');
await page.getByRole('button', { name: /^Invite / }).click();
await page.waitForURL(/cannot=/, { timeout: 20000 }).catch(() => {});

const refused = await page.locator('body').innerText();
check('A TYPO IS ASKED ABOUT RATHER THAN GUESSED AT', /not an email address or a phone number/i.test(refused),
  refused.replace(/\n/g, ' ').slice(0, 200));
/* The expensive message: it must not teach the owner that a number is no good. */
check('AND THE REFUSAL STILL NAMES BOTH ROUTES', /whichever you have/i.test(refused),
  refused.replace(/\n/g, ' ').slice(0, 200));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
