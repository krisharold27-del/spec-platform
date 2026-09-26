/*
  The GM home and Angus Shield, driven the way an owner drives them.

  Design 19, 25 September. Two claims are being tested and they are the two that a unit test cannot
  reach, because both are about what a real page does rather than what a function returns:

    The Money screen exists, is reachable from the GM home, and refuses to invent a figure. The
    shields on a brand-new business have nothing behind them, and the honest answer is "not known
    yet" plus what to set — NOT a zero, which reads as a business with no cash.

    Angus Shield turns on as a SETTING. One click, no key, no consent screen, no organisation to
    pick — and the page comes back saying the figures are live because there is nothing to sync.
    That is the whole architectural claim of Design 19, and the only way to prove it is to press
    the button and see what the next render says.

  It also proves the thing that would be easiest to get wrong and hardest to notice: that the
  six-month switch is NOT offered to a business with no history. A brand-new business being asked
  to move its ledger would be the offer arriving at the one moment it cannot be true.
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
const BUS = `Money Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1400 } })).newPage();
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
await page.fill('input[name="email"]', `money-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

/* ── The Money screen answers at all ─────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/money`, { waitUntil: 'networkidle' });
check('MONEY IS A REAL PAGE, NOT A REDIRECT', new URL(page.url()).pathname === '/money', page.url());

const shields = await page.locator('[data-shield]').count();
check('ALL FOUR SHIELDS ARE DRAWN', shields === 4, `found ${shields}`);

/*
  The refusal to invent. A new business has no weekly running cost set, so SPEC cannot turn a bank
  balance into weeks of cover — and the wrong answer here is not a wrong number, it is ANY number.
*/
const cash = await page.locator('[data-shield="cash"]').innerText();
check('CASH COVER IS NOT INVENTED', /not known yet/i.test(cash) || /week costs you/i.test(cash), cash.replace(/\n/g, ' ').slice(0, 160));
check('AND IT IS NOT DRESSED UP AS A ZERO', !/^\s*\$0\b/m.test(cash), cash.replace(/\n/g, ' ').slice(0, 120));

const margin = await page.locator('[data-shield="margin"]').innerText();
check('MARGIN IS NOT JUDGED WITHOUT A BENCHMARK', /not known yet|will not tell you whether/i.test(margin), margin.replace(/\n/g, ' ').slice(0, 160));

/* ── A review with nothing to say says that, not "no issues" ─────────────────────────────────── */

const reviews = await page.locator('[data-review]').count();
check('THE EIGHT REVIEWS ARE ALL THERE', reviews === 8, `found ${reviews}`);

const pl = await page.locator('[data-review="pl"]').innerText();
check('AN UNWRITEABLE REVIEW SAYS SO', /could not be written/i.test(pl), pl.replace(/\n/g, ' ').slice(0, 160));
check('AND NEVER CLAIMS A CLEAN BILL OF HEALTH', !/no issues/i.test(pl), pl.replace(/\n/g, ' ').slice(0, 120));
check('AN UNWRITEABLE REVIEW CANNOT BE SIGNED', await page.locator('[data-review="pl"] button').count() === 0);

/* ── The switch is not offered to a business with no history ─────────────────────────────────── */

const switchPanel = await page.locator('[data-money-switch]').innerText();
check('NO SWITCH IS OFFERED ON DAY ONE', !/Switch to Angus Shield/.test(switchPanel), switchPanel.replace(/\n/g, ' ').slice(0, 140));
check('AND IT SAYS HOW LONG IS LEFT', /months/i.test(switchPanel), switchPanel.replace(/\n/g, ' ').slice(0, 140));

/* ── Turning Angus Shield on is a setting ────────────────────────────────────────────────────── */

await page.click('[data-money-source] button[value="angus"]');
/*
  Waiting for EVIDENCE rather than for a URL. The action redirects back to /money, so the page was
  already at the address it was going to end up at — a waitForURL here resolves instantly, reads the
  old render, and reports a working feature as broken. Three journeys have now been caught by this
  exact shape; the rule is to wait for the thing the action was supposed to change.
*/
await page.waitForFunction(
  () => /Nothing to sync/i.test(document.querySelector('[data-money-source]')?.textContent ?? ''),
  null, { timeout: 20000 },
).catch(() => {});

const [after] = await sql`select finance_source from tenants where id = ${tenant.id}`;
check('THE SOURCE IS A COLUMN, NOT A CREDENTIAL', after?.finance_source === 'angus', String(after?.finance_source));

const creds = await sql`select count(*)::int as n from connection_credentials where tenant_id = ${tenant.id}`;
check('NOTHING WAS STORED THAT COULD EXPIRE', creds[0].n === 0, `${creds[0].n} credentials`);

const source = await page.locator('[data-money-source]').innerText();
check('THE PAGE SAYS IT IS LIVE', /Nothing to sync/i.test(source), source.replace(/\n/g, ' ').slice(0, 160));
check('AND NAMES WHAT ANGUS SHIELD IS', /not a connector|same login/i.test(source), source.replace(/\n/g, ' ').slice(0, 200));

const payroll = await page.locator('[data-money-payroll]').innerText();
check('PAYROLL STILL STARTS IN SITEVIP', /runs in siteVIP/i.test(payroll), payroll.replace(/\n/g, ' ').slice(0, 140));

/* ── The GM home ─────────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/virtual-gm`, { waitUntil: 'networkidle' });
const onGm = new URL(page.url()).pathname === '/virtual-gm';
check('THE GM HOME OPENS', onGm, page.url());

if (onGm) {
  const movement = await page.locator('[data-gm-movement]').innerText();
  check('IT ASKS WHETHER THE METER GOT BETTER', /Has the power meter got better/i.test(movement));
  /*
    Week one. There is genuinely nothing to compare against, and the honest answer is to say so
    rather than to manufacture a baseline that would make the first week's movement meaningless.
  */
  check('AND ADMITS THERE IS NO LAST WEEK YET', /nothing to compare/i.test(movement), movement.replace(/\n/g, ' ').slice(0, 160));

  const snaps = await sql`select count(*)::int as n from power_snapshots where tenant_id = ${tenant.id}`;
  check('THE WEEK WAS WRITTEN DOWN SO NEXT WEEK CAN COMPARE', snaps[0].n === 1, `${snaps[0].n} snapshots`);

  const questions = await page.locator('[data-gm-question]').count();
  check('THE FOUR QUESTIONS ARE ASKED', questions === 4, `found ${questions}`);

  const tiles = await page.locator('[data-gm-tile]').count();
  check('ALL NINE AREAS ARE TILED', tiles === 9, `found ${tiles}`);

  const pay = await page.locator('[data-gm-tile="pay"]').innerText();
  check('PAY IS RUNNING HERE FROM DAY ONE', !/In another system|Run it in siteVIP/i.test(pay), pay.replace(/\n/g, ' ').slice(0, 140));

  const money = await page.locator('[data-gm-tile="money"]').getAttribute('href');
  check('THE MONEY TILE OPENS THE MONEY SCREEN', money === '/money', String(money));

  const count = await page.locator('[data-gm-adoption-count]').innerText();
  /*
    Case-insensitive: the label is upper-cased by CSS, so a case-sensitive check reports a failure
    against working code. That has now happened in two journeys — the rule is that a check reads
    what a person sees, and a person cannot see the difference.
  */
  check('THE HEADER COUNTS WHAT IS RUNNING HERE', /of 9 running in sitevip/i.test(count), count);
  /* One, on day one: Pay is the only area that is never staged. */
  check('AND IT IS ONE, BECAUSE PAY IS THE ONLY ALWAYS-ON AREA', /^1 of 9/i.test(count.trim()), count);

  const away = await page.locator('[data-gm-away]').innerText();
  check('ONLY AN INJURY REACHES AN OWNER WHO IS AWAY', /hurt/i.test(away), away.replace(/\n/g, ' ').slice(0, 140));
  check('SAVED-YOU DOES NOT PRINT A ZERO', !/\$0\b/.test(away), away.replace(/\n/g, ' ').slice(0, 140));
}

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
