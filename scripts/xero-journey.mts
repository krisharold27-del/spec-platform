// Xero — can a business actually link its accounts, and is the ledger really guarded?
//
// Kris, 19 September: "now do the xero oauth", after "be very careful with connectors especially
// xero and financials - how are we controlling this - not everyone should be able to connect Xero".
//
// ── What this proves, and what it cannot ─────────────────────────────────────────────────────────
//
// This environment's egress proxy denies every Xero host, so nothing here has spoken to Xero.
// `scripts/fake-xero.mjs` answers Xero's published contract — consent, code exchange, refresh-token
// ROTATION, /connections, a nested Profit and Loss — and this walks SPEC's two ends against it in a
// real browser.
//
// So it proves the wiring, the refusals and the rotation. It proves NOTHING about whether Xero
// agrees, and the first real call still has to happen somewhere the network is allowed. That
// distinction is the whole of docs/MISTAKES.md and it is not softened here.
//
//   node scripts/fake-auth.mjs 54321 &
//   node scripts/fake-xero.mjs 5055 &
//   XERO_FAKE_BASE=http://localhost:5055 XERO_CLIENT_ID=id XERO_CLIENT_SECRET=s \
//     TOKEN_ENCRYPTION_KEY=$(head -c48 /dev/urandom | base64) npm start &
//   node scripts/xero-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const stamp = Date.now();
const BUSINESS = `Xero Test ${stamp}`;

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition || !detail ? '' : `  — ${detail}`}`);
  if (!condition) failed++;
};

let browser = null;
reportCrashes({ browser: () => browser, business: BUSINESS, since: RUN_STARTED });

browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1200 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });

const text = () => page.evaluate(() => document.body.innerText);

// ── A business signs up, so there is an administrator and a top of the chart ─────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', `xero-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});

if (page.url().includes('error=busy')) {
  console.log('  --   sign-up is being throttled — not a fault.');
  await browser.close();
  await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
  process.exit(0);
}

/*
  ── The AI layer on, the way a customer who connects Xero has it ────────────────────────────────

  Since 23 September a live connection needs the AI layer (`aiActive` in lib/plan): going live is
  not worth the key SPEC would hold until something is reading across it. This journey was written
  before that gate and never turned the layer on, so "Connect to Xero" never appeared — a failure
  nobody saw, because an earlier CI step stopped every run first. The business goes on `beta`, the
  plan SPEC switches on deliberately and for free, which is exactly what it is for.
*/
if (process.env.DATABASE_URL) {
  const { default: postgres } = await import('postgres');
  const db = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
  await db`update tenants set plan = 'beta' where name = ${BUSINESS}`;
  await db.end();
}

/*
  ── Is there a connector on the app being driven at all? ────────────────────────────────────────

  The app needs SPEC's Xero client id, a key to seal tokens with, and the offline server to talk to.
  Without them this journey cannot prove anything — and the one thing it must not do is finish
  quietly, because a connector nobody exercised looks exactly like a connector that works.

  So it names the missing part and leaves with the word `skip`, not a green run.
*/
const offlineXero = await fetch(process.env.XERO_FAKE_BASE ?? 'http://localhost:5055')
  .then(() => true).catch(() => false);
const missing = [
  !process.env.XERO_CLIENT_ID && 'XERO_CLIENT_ID',
  !process.env.TOKEN_ENCRYPTION_KEY && 'TOKEN_ENCRYPTION_KEY',
  !offlineXero && 'scripts/fake-xero.mjs running',
].filter(Boolean);
if (missing.length) {
  /*
    ── Skipping is fine on a laptop and is a FAILURE in CI ─────────────────────────────────────

    CI sets all three and starts the offline server, so a missing one there means the wiring broke
    — and a journey that exits 0 for that reason is the exact shape this codebase keeps finding: a
    check whose failure mode is silence. It went in green, and I could not tell from outside
    whether it had run at all, because the log host is not reachable from here.

    `JOURNEY_XERO_REQUIRED` is set in the workflow and nowhere else. Somebody running this on their
    own machine without a Xero client id still gets a skip and a plain sentence.
  */
  const required = process.env.JOURNEY_XERO_REQUIRED === '1';
  const said = `THE XERO LINK WAS NOT EXERCISED — this run has no ${missing.join(', ')}.`;
  console.log(required ? `FAIL ${said}` : ` skip  ${said}`);
  console.log('  --   nothing here passed. A connector nobody walked is a connector nobody has proven.');
  await browser.close();
  await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
  process.exit(required ? 1 : 0);
}

// ── The ledger is named, and goes to the board ───────────────────────────────────────────────────
await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Xero');
/*
  Filed as "Something else" ON PURPOSE.

  This is the hole `fileUnder` closed on 19 September: `guessCategory` has always known Xero is
  financials, but the category came straight off this dropdown — so typing Xero and choosing
  anything lighter connected the ledger on one person's say-so. The journey types it the wrong way
  round every time, because the right way round would never have caught it.
*/
await page.selectOption('select[name="category"]', 'other').catch(() => {});
await page.getByRole('button', { name: 'Add it' }).click();
await page.waitForTimeout(2000);
let body = await text();

check('XERO IS FILED AS FINANCIALS WHATEVER THE DROPDOWN SAID', /Financials/.test(body),
      body.split('\n').find(l => /Xero/.test(l)) ?? body.slice(0, 160));
check('  and it goes to the board rather than switching on', /Waiting on the board/i.test(body),
      body.split('\n').find(l => /board/i.test(l)) ?? '');

// ── And cannot be linked before the board has decided ────────────────────────────────────────────
//
// The check that matters most on this screen. Completing consent means SPEC is HOLDING a key to the
// accounts — so the decision has to happen before anybody is sent to Xero, not after they are back.
const connectNow = page.getByRole('button', { name: /Connect to Xero/i });
check('THE BOARD DECIDES BEFORE ANYBODY CAN EVEN START', (await connectNow.count()) === 0,
      `${await connectNow.count()} ways to link it with no decision made`);

// ── The board approves it, with the read-only scope written on the request ───────────────────────
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
body = await text();
check('the board is asked in plain words what it is allowing',
      /Invoices, gross profit and the profit and loss\. Read only\./i.test(body),
      body.split('\n').find(l => /read only/i.test(l)) ?? body.slice(0, 200));

await page.getByRole('button', { name: 'Approve' }).first().click();
await page.waitForTimeout(2500);

// ── Now it can be linked ─────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
body = await text();
check('APPROVED, AND ONLY THEN IS THERE A WAY TO LINK IT',
      (await page.getByRole('button', { name: /Connect to Xero/i }).count()) === 1,
      body.split('\n').find(l => /board/i.test(l)) ?? '');
/*
  And the manual button is NOT offered beside it. Two buttons that look alike and mean completely
  different things is how somebody marks a ledger live that nothing is reading.
*/
check('  and "Mark it live" is not offered beside it',
      (await page.getByRole('button', { name: 'Mark it live' }).count()) === 0);

await page.getByRole('button', { name: /Connect to Xero/i }).click();
// Waited for the ANSWER, not for the address.
//
// The first version waited on a glob for the connections page — which is the page it was already
// standing on, so it matched instantly, read the body before the round trip had even started, and
// reported the connector broken while the connector was working. A wait that is already satisfied
// is not a wait, and it fails in the direction that wastes the most time: it blames the product.
await page.waitForURL(/[?&](linked|choose|cannot)=/, { timeout: 30000 }).catch(() => {});
await page.waitForLoadState('networkidle');
body = await text();

check('A BUSINESS CAN LINK ITS ACCOUNTS, END TO END', /Xero is connected to/i.test(body),
      body.split('\n').find(l => /xero/i.test(l)) ?? page.url());
check('  and the screen names the books it is reading', /JBI Electrical Pty Ltd/.test(body),
      body.split('\n').find(l => /linked to/i.test(l)) ?? '');
check('  and says the access is read-only and stored encrypted',
      /read-only/i.test(body) && /encrypted/i.test(body),
      body.split('\n').find(l => /read-only|encrypted/i.test(l)) ?? '');
/*
  Nothing has been READ. A link is not a number, and this is the screen where claiming otherwise
  would be worst — tests/no-false-feed.test.ts exists because four screens once did.
*/
check('  AND STILL DOES NOT CLAIM A NUMBER HAS ARRIVED',
      !/arriving automatically|numbers arriving/i.test(body),
      body.split('\n').find(l => /arriving/i.test(l)) ?? '');

// ── The credential really is held, and really is sealed ──────────────────────────────────────────
//
// Read from the database rather than believed from the screen: "linked" on a page is a claim, and a
// claim nobody checks is how this product's worst faults have all started.
const { db, schema } = await import('../src/db/index.ts');
const { eq } = await import('drizzle-orm');
const rows = await db.select().from(schema.connectionCredentials);
/*
  This run's row, not every row that looks like it.

  The first version matched on the organisation NAME — which the offline server gives to every run
  — so a credential left behind by anything earlier on the same database made this fail, and then
  made the three checks after it read the wrong row and fail for a reason that was not true. One
  loose filter produced four wrong answers, none of them about the product.
*/
const mine = rows.filter(r => (r.createdAt ?? '') >= RUN_STARTED);
check('THE CREDENTIAL IS STORED, SEALED, AND NEVER IN THE CLEAR',
      mine.length === 1 && /^v1\./.test(mine[0]?.refreshTokenSealed ?? ''),
      mine.length ? (mine[0].refreshTokenSealed ?? '').slice(0, 24) : 'no credential row at all');
check('  and it knows which organisation, so a read is possible at all',
      mine[0]?.xeroOrgId === 'org-jbi', String(mine[0]?.xeroOrgId));
check('  and it recorded what Xero actually granted, not what SPEC asked for',
      /offline_access/.test(mine[0]?.scope ?? ''), mine[0]?.scope ?? '');

// ── Rotation: the fault that would be invisible until a customer lost their connection ───────────
//
// Xero retires a refresh token the moment it is spent. Reading twice is the only way to find out
// whether SPEC stores the new one — a connector that forgets works for one request and is dead
// afterwards, and nothing on any screen would say so.
const before = mine[0]?.refreshTokenSealed;
const { accessTokenFor } = await import('../src/lib/xero-link.ts');
const connectionId = mine[0]?.connectionId;
const tenantId = mine[0]?.tenantId;

const first = await accessTokenFor(tenantId, connectionId);
check('A READ REFRESHES THE LINK RATHER THAN HOLDING A TOKEN AT REST', first.ok === true,
      first.ok ? '' : first.reason);

const [afterFirst] = await db.select().from(schema.connectionCredentials)
  .where(eq(schema.connectionCredentials.connectionId, connectionId));
check('  AND THE ROTATED TOKEN IS STORED, not the spent one',
      afterFirst?.refreshTokenSealed !== before,
      'the stored credential did not change, so the next read would fail');

const second = await accessTokenFor(tenantId, connectionId);
check('  AND A SECOND READ STILL WORKS, which is what rotation breaks when it is wrong',
      second.ok === true, second.ok ? '' : second.reason);

// ── And the number it is all for ─────────────────────────────────────────────────────────────────
if (second.ok) {
  const { profitAndLoss } = await import('../src/lib/xero-net.ts');
  const report = await profitAndLoss({
    accessToken: second.accessToken,
    xeroOrgId: second.xeroOrgId,
    toDate: '2026-09-30',
    months: 3,
  });
  check('GROSS PROFIT COMES BACK, FOUND BY NAME AND NOT BY POSITION', report.ok === true,
        report.ok ? '' : report.reason);
  if (report.ok) {
    check('  and a month with no figure is left out rather than drawn as zero',
          report.points.length === 2 && report.points.every(p => p.amount !== 0),
          JSON.stringify(report.points));
    check('  and the currency is only reported when it really is one',
          report.currencyHint === 'AUD', String(report.currencyHint));
  }
}

// ── Disconnecting takes the key with it ──────────────────────────────────────────────────────────
await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Disconnect' }).first().click();
await page.waitForTimeout(2500);
const left = await db.select().from(schema.connectionCredentials)
  .where(eq(schema.connectionCredentials.connectionId, connectionId));
check('DISCONNECTING DELETES THE CREDENTIAL, not just a status',
      left.length === 0,
      `${left.length} sealed token(s) still sitting on a connection the business turned off`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
console.log('  --   none of this spoke to Xero. See the note at the top of this file.');
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failed ? 1 : 0);
