/*
  The page a person opens on their own phone.

  Driven at 390×844 — an iPhone held in one hand in a driveway — because this is the one screen in
  SPEC whose whole reason for existing is that it is NOT used at a desk. A layout that only works at
  1400px wide is a layout that fails the only test that matters here.
*/
import { chromium } from 'playwright';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:3100';
const DB = process.env.DATABASE_URL
  ?? (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
const sql = postgres(DB, { onnotice: () => {} });

const stamp = Date.now();
const BUS = `Join Test ${stamp}`;
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

/*
  Two contexts, because there are two people and they are not on the same device.

  The office half is done at a desk — that is who sets a business up. The person's half is done at
  390x844 with touch, which is an iPhone held in one hand in a driveway, and is the only size that
  proves anything about this page. Separate contexts also mean the person carries no cookie from
  the office, which is the point: they have no account at all.
*/
const office = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await office.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

const finish = async () => {
  await browser.close();
  await tidyUp(BUS);
  await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

// ── Set a business up with somebody in it, the way the office does ──────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `join-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
/* Agreeing to the terms is required, so the browser blocks the form without it. */
await page.check('input[name="consent"]').catch(() => {});
/* The signed timestamp holds a form filled in faster than a person can fill it in. */
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
/*
  Two people, not one. The last check tries to reach the SECOND of them through the first one's
  link, which is the actual risk a page with no sign-in carries — and with only one person in the
  business there is nobody to fail to reach, so the check would pass having proved nothing.
*/
await page.fill('textarea[name="text"]',
  'Electrician, Jamie Rivers, General Manager\nSite Supervisor, Dana Ward, General Manager');
await Promise.all([
  page.waitForLoadState('networkidle'),
  page.locator('form:has(textarea[name="text"]) button[type="submit"]').first().click(),
]);
await page.waitForTimeout(1200);

// The office sends the link.
await page.goto(`${BASE}/people?mode=setup`, { waitUntil: 'networkidle' });
const send = page.locator('section:has-text("Rivers") button:has-text("Send them a link")').first();
check('THE OFFICE CAN SEND A LINK', await send.count() > 0);
if (await send.count()) {
  await Promise.all([page.waitForLoadState('networkidle'), send.click()]);
  await page.waitForTimeout(900);
}

/*
  The link the ADMIN is actually given, read off the screen rather than built here. Assembling the
  URL in the journey would prove the token exists and nothing about whether a person working down
  thirty-eight rows can send one — which is the only question that matters on Monday.
*/
const invite = await page.locator('section:has-text("Rivers") textarea[readonly]').first().inputValue().catch(() => '');
check('THE OFFICE IS GIVEN THE MESSAGE TO SEND', /\/join\/[0-9a-f]{32}/.test(invite), invite.slice(0, 90));
check('  and it names the business and the person', invite.includes(BUS) && /Jamie/.test(invite), invite.slice(0, 90));

const [me] = await sql`select id, setup_token from staff where tenant_id = ${tenant.id} and name like '%Rivers%'`;
check('A TOKEN IS ISSUED', Boolean(me?.setup_token), me?.setup_token ? '' : 'no token on the row');
if (!me?.setup_token) await finish();

// ── Now the person, on their phone, with no account ─────────────────────────────────────────────
const them = await phone.newPage();
const theirErrs = [];
them.on('pageerror', e => theirErrs.push(String(e).slice(0, 200)));
them.on('console', m => { if (m.type() === 'error') theirErrs.push(m.text().slice(0, 200)); });

/* Open exactly the link the admin was handed, not one this script built. */
const fromScreen = (invite.match(/https?:\/\/\S+|\/join\/[0-9a-f]{32}/) ?? [])[0] ?? `${BASE}/join/${me.setup_token}`;
const theirLink = fromScreen.startsWith('http') ? fromScreen : `${BASE}${fromScreen}`;
check('THE LINK ON SCREEN IS THIS PERSON\u2019S', theirLink.includes(me.setup_token), theirLink);
const r = await them.goto(theirLink, { waitUntil: 'networkidle' });
const txt = await them.evaluate(() => document.body.innerText);
check('THE LINK OPENS WITH NO SIGN-IN', new URL(them.url()).pathname.startsWith('/join') && (r?.status() ?? 0) < 400,
  `landed on ${new URL(them.url()).pathname}`);
check('  and it greets them by name', /Jamie/.test(txt), txt.slice(0, 120).replace(/\n/g, ' '));
check('  and says which business sent it', txt.includes(BUS), txt.slice(0, 120).replace(/\n/g, ' '));
check('  and says how much is left', /0 of 3 done/.test(txt), txt.slice(0, 200).replace(/\n/g, ' '));

// It fits a phone. No sideways scrolling, ever.
const overflow = await them.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('IT FITS A PHONE — nothing runs off the side', overflow <= 1, `${overflow}px of sideways scroll`);

// Every target is big enough to hit with a thumb.
const small = await them.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, input, a')) {
    const b = el.getBoundingClientRect();
    if (b.width > 0 && b.height > 0 && b.height < 40) out.push(`${el.tagName}:${(el.textContent || el.getAttribute('name') || '').trim().slice(0, 24)} ${Math.round(b.height)}px`);
  }
  return out;
});
check('EVERY TARGET IS THUMB-SIZED', small.length === 0, small.slice(0, 3).join(', '));

// 1 — their details.
await them.fill('input[name="phone"]', '0412 345 678');
await them.fill('input[name="email"]', 'jamie@jbielectrical.com.au');
await Promise.all([them.waitForLoadState('networkidle'), them.locator('button:has-text("Save my details")').click()]);
await them.waitForTimeout(900);
const [saved] = await sql`select phone, email from staff where id = ${me.id}`;
check('THEY CAN SAVE THEIR OWN DETAILS', saved?.email === 'jamie@jbielectrical.com.au' && /0412/.test(saved?.phone ?? ''),
  JSON.stringify(saved));
check('  and the page counts it', /1 of 3 done/.test(await them.evaluate(() => document.body.innerText)));

// A personal address is warned about, and still saved.
await them.fill('input[name="email"]', 'jamie@gmail.com');
await Promise.all([them.waitForLoadState('networkidle'), them.locator('button:has-text("Save my details")').click()]);
await them.waitForTimeout(900);
const after = await them.evaluate(() => document.body.innerText);
check('A PERSONAL ADDRESS IS WARNED ABOUT', /personal address/i.test(after), after.slice(0, 200).replace(/\n/g, ' '));
const [stillSaved] = await sql`select email from staff where id = ${me.id}`;
check('  and saved anyway, never refused', stillSaved?.email === 'jamie@gmail.com', stillSaved?.email);

// 2 — a licence with its expiry.
await them.fill('input[name="what"]', 'A-grade electrical licence');
await them.fill('input[name="expiresAt"]', '2027-06-30');
await Promise.all([them.waitForLoadState('networkidle'), them.locator('button:has-text("Add it")').click()]);
await them.waitForTimeout(900);
const lics = await sql`select what, expires_at from obligations where staff_id = ${me.id}`;
check('THEY CAN ADD A LICENCE WITH ITS EXPIRY',
  lics.length === 1 && lics[0].expires_at === '2027-06-30', JSON.stringify(lics));
check('  and it shows on the page', /A-grade electrical licence/.test(await them.evaluate(() => document.body.innerText)));

// 3 — the induction, read but NOT signed off.
await Promise.all([them.waitForLoadState('networkidle'), them.locator('button:has-text("I have read the induction")').click()]);
await them.waitForTimeout(900);
const [ind] = await sql`select induction_read_at, inducted_at from staff where id = ${me.id}`;
check('THEY CAN SAY THEY HAVE READ THE INDUCTION', Boolean(ind?.induction_read_at));
check('  BUT CANNOT INDUCT THEMSELVES — that stays the business’s mark', ind?.inducted_at === null,
  `inducted_at is ${ind?.inducted_at}`);
check('  and the page says the office still has to sign it off',
  /office will sign it off/i.test(await them.evaluate(() => document.body.innerText)));
check('  and all three are done', /All done/.test(await them.evaluate(() => document.body.innerText)));

// ── The fence ───────────────────────────────────────────────────────────────────────────────────
const other = await phone.newPage();
const bad = await other.goto(`${BASE}/join/${'f'.repeat(32)}`, { waitUntil: 'domcontentloaded' });
check('A TOKEN THAT IS NOT REAL GOES NOWHERE', (bad?.status() ?? 0) === 404, `status ${bad?.status()}`);

const junk = await other.goto(`${BASE}/join/not-a-token`, { waitUntil: 'domcontentloaded' });
check('SO DOES A MALFORMED ONE', (junk?.status() ?? 0) === 404, `status ${junk?.status()}`);

/*
  The one that matters. The page has no sign-in, so a forwarded link is the attack: it must never
  be possible to reach anybody else through it, and the actions must ignore any id the page is
  given. Proved by handing the form somebody else's staff id and checking nothing moved.
*/
const [gm] = await sql`select id, name, phone from staff where tenant_id = ${tenant.id} and name like '%Ward%' limit 1`;
/*
  If there is no second person the injection check cannot run, and a check that quietly does not
  run is worse than no check — it banks a pass nobody earned. So say so, loudly, and fail.
*/
check('THERE IS SOMEBODY ELSE TO TRY TO REACH', Boolean(gm), 'nobody to attempt the injection against');
if (gm) {
  await other.goto(`${BASE}/join/${me.setup_token}`, { waitUntil: 'networkidle' });
  await other.evaluate(id => {
    const f = document.querySelector('form:has(input[name="phone"])');
    const inject = document.createElement('input');
    inject.type = 'hidden'; inject.name = 'staffId'; inject.value = id;
    f.appendChild(inject);
    f.querySelector('input[name="phone"]').value = '0400 000 000';
  }, gm.id);
  await Promise.all([other.waitForLoadState('networkidle'), other.locator('button:has-text("Save my details")').click()]);
  await other.waitForTimeout(900);
  const [untouched] = await sql`select phone from staff where id = ${gm.id}`;
  check('A STAFF ID IN THE FORM CHANGES NOBODY ELSE', (untouched?.phone ?? null) === (gm.phone ?? null),
    `${gm.phone} became ${untouched?.phone}`);
}

const real = [...errs, ...theirErrs].filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');

await them.screenshot({ path: '/tmp/claude-0/join-phone.png', fullPage: true });
await finish();
