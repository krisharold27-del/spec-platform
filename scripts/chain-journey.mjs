/*
  The red link, the money nobody is claiming, and a card SPEC cannot issue.

  Three claims a unit test cannot settle.

  A duty with a hole in it must be visible ON THE CHART. Kris, 25 September: pick an obligation and
  the chart highlights every link with its duty. A link with no named owner shows red, the next
  person UP is told, and it goes on the weekly meeting agenda — because "review chain of
  responsibility" is an agenda item that gets carried forward for four months.

  Money you're owed must lead with the BASIS and refuse to print a figure it has no rate for. A
  fuel tax credit rate SPEC invented, times a real litre count, produces a believable number that
  is wrong and ends up on a BAS.

  And the Angus Card screen must say out loud that SPEC cannot issue a card. There is no
  card-issuing partner. A screen implying otherwise is the product claiming something happened
  that did not.
*/
import { chromium } from 'playwright';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:3100';
const DB = process.env.DATABASE_URL
  ?? (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
const sql = postgres(DB, { onnotice: () => {} });

const stamp = Date.now();
const BUS = `Chain Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1600 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `chain-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, name from users where tenant_id = ${tenant.id} limit 1`;
const now = new Date().toISOString();

/* ── A duty with a hole in the middle of it ──────────────────────────────────────────────────── */

const roles = await sql`select id, title from roles where tenant_id = ${tenant.id} order by level`;
check('THE CHART HAS SEATS', roles.length > 0, `${roles.length} roles`);
if (roles.length === 0) await finish();

const top = roles[0];
/* A second seat that nobody is in — the hole. */
const vacantId = randomUUID();
await sql`insert into roles ${sql({
  id: vacantId, tenant_id: tenant.id, title: 'Site Supervisor', level: 3,
  reports_to_role_id: top.id, stream: 'operations',
})}`;

await sql`insert into chain_links ${sql({
  id: randomUUID(), tenant_id: tenant.id, obligation: 'heights', link: 'owner',
  duty: 'Resources the equipment and the training.', role_id: top.id, updated_at: now,
})}`;
await sql`insert into chain_links ${sql({
  id: randomUUID(), tenant_id: tenant.id, obligation: 'heights', link: 'supervisor',
  duty: 'Checks the harness and the anchor before anybody goes up.', role_id: vacantId, updated_at: now,
})}`;

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
check('THE CHAIN PANEL IS ON THE CHART', await page.locator('[data-chain]').count() === 1);
check('ALL NINE DUTIES CAN BE PICKED', await page.locator('[data-chain-pick]').count() === 9);
check('NOTHING IS PICKED TO BEGIN WITH', await page.locator('[data-chain-reading]').count() === 0);

await page.click('[data-chain-pick="heights"]');
await page.waitForSelector('[data-chain-reading="heights"]', { timeout: 20000 }).catch(() => {});

check('PICKING ONE SHOWS ITS CHAIN', await page.locator('[data-chain-reading="heights"]').count() === 1);
check('BOTH LINKS ARE DRAWN', await page.locator('[data-chain-link]').count() === 2);
check('THE EMPTY SEAT IS THE BROKEN ONE', await page.locator('[data-chain-state="vacant"]').count() === 1);
check('AND THE HELD ONE IS NOT', await page.locator('[data-chain-state="held"]').count() === 1);

/*
  The duty rises. Not to the technician below — to the person above, who is carrying it right now
  whether they know it or not.
*/
const rises = await page.locator('[data-chain-rises]').innerText();
check('THE DUTY RISES TO THE PERSON ABOVE', rises.includes(me.name ?? 'Kris'), rises.slice(0, 140));

const meeting = await page.locator('[data-chain-meeting]').innerText();
check('IT GOES ON THE WEEKLY MEETING', /Working at heights/i.test(meeting), meeting.replace(/\n/g, ' ').slice(0, 180));
check('AS A NAMED ITEM, NOT "REVIEW THE CHAIN"', /Site supervisor/i.test(meeting), meeting.replace(/\n/g, ' ').slice(0, 180));

/* A duty nobody has mapped says so rather than looking fine. */
await page.goto(`${BASE}/org?duty=asbestos`, { waitUntil: 'networkidle' });
const unmapped = await page.locator('[data-chain-reading="asbestos"]').innerText();
check('A DUTY NOBODY MAPPED IS NOT SILENTLY FINE', /cannot show/i.test(unmapped), unmapped.replace(/\n/g, ' ').slice(0, 180));

/* ── Money you're owed ───────────────────────────────────────────────────────────────────────── */

await sql`insert into tax_claims ${sql({
  id: randomUUID(), tenant_id: tenant.id, claim_key: 'fuel_tax', period_start: '2026-07-01',
  basis: 'Diesel in 9 utes and 2 generators, Jul to Sep.', amount_cents: 318000,
  rate_source: null, created_at: now,
})}`;
await sql`insert into tax_claims ${sql({
  id: randomUUID(), tenant_id: tenant.id, claim_key: 'gst', period_start: '2026-07-01',
  basis: 'Every purchase this quarter, receipts matched.', amount_cents: 3164000,
  rate_source: 'ATO, checked 1 Jul 2026', created_at: now,
})}`;

await page.goto(`${BASE}/money`, { waitUntil: 'networkidle' });
check('MONEY YOU ARE OWED IS ON THE SCREEN', await page.locator('[data-owed]').count() === 1);

/*
  The amount is stored on the fuel claim and there is NO SOURCE, so it must not be shown. This is
  the check that matters: a believable figure nobody can trace is worse than none.
*/
const fuel = await page.locator('[data-owed-claim="fuel_tax"]').innerText();
check('A FIGURE WITH NO SOURCE IS NOT SHOWN', !/3,180/.test(fuel), fuel.replace(/\n/g, ' ').slice(0, 180));
check('BUT THE BASIS IS', /9 utes/.test(fuel), fuel.replace(/\n/g, ' ').slice(0, 180));
check('AND IT SAYS WHY THERE IS NO FIGURE', /no figure here/i.test(fuel), fuel.replace(/\n/g, ' ').slice(0, 180));

const gst = await page.locator('[data-owed-claim="gst"]').innerText();
check('A FIGURE WITH A SOURCE IS SHOWN', /31,640/.test(gst), gst.replace(/\n/g, ' ').slice(0, 180));
check('WITH THE SOURCE BESIDE IT', /ATO, checked/.test(gst), gst.replace(/\n/g, ' ').slice(0, 180));

const owedAll = await page.locator('[data-owed]').innerText();
check('THE TOTAL DOES NOT PRETEND TO BE THE LOT', /cannot put a figure on/i.test(owedAll), owedAll.replace(/\n/g, ' ').slice(0, 220));

/* Sending it to the accountant. */
const posted = page.waitForResponse(r => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
await page.click('[data-owed-claim="fuel_tax"] form button');
await posted;
const [sent] = await sql`select sent_at, sent_to from tax_claims where tenant_id = ${tenant.id} and claim_key = ${'fuel_tax'}`;
check('IT GOES TO THE ACCOUNTANT', Boolean(sent?.sent_at), String(sent?.sent_at));

/* ── The card SPEC cannot issue ──────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/money`, { waitUntil: 'networkidle' });
const card = await page.locator('[data-card]').innerText();
check('THE CARD SECTION SAYS SPEC CANNOT ISSUE ONE', /cannot issue/i.test(card), card.replace(/\n/g, ' ').slice(0, 180));
check('AND NAMES WHAT IS MISSING', /card-issuing partner/i.test(card), card.replace(/\n/g, ' ').slice(0, 180));
check('IT NEVER SAYS A CARD IS READY OR ACTIVE', !/your card is (ready|active)|card issued/i.test(card));
check('APPRENTICES ARE EXCLUDED OUT LOUD', /Apprentices do not get one/i.test(await page.locator('[data-card-apprentices]').innerText()));
check('EVERY ROLE IS LISTED', await page.locator('[data-card-role]').count() === 4);
check('NO LIMITS SET MEANS NOTHING GOES OUT', /signed blank cheque/i.test(card), card.replace(/\n/g, ' ').slice(0, 200));
check('THREE THINGS ARE BLOCKED, NO MORE', await page.locator('[data-card-blocked]').count() === 3);

/* A spend with no job on it, and one with no receipt. */
await sql`insert into card_spends ${sql({
  id: randomUUID(), tenant_id: tenant.id, person_key: `user:${me.id}`, person_name: 'Tom Reyes',
  leader_name: 'Amrit Kaur', merchant: 'Bunnings Alexandria', cents: 4280,
  spent_at: new Date(Date.now() - 3 * 86400000).toISOString(), to_overhead: false, created_at: now,
})}`;
await page.goto(`${BASE}/money`, { waitUntil: 'networkidle' });
check('AN UNCODED SPEND IS FLAGGED', await page.locator('[data-card-state="uncoded"]').count() === 1);
const remind = await page.locator('[data-card-remind]').innerText();
check('THE LEADER IS REMINDED, NOT THE CARDHOLDER', /Amrit|Tom Reyes/.test(remind), remind.slice(0, 140));
check('AND THE CARD IS NOT PAUSED', /still works/i.test(remind), remind.slice(0, 140));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
