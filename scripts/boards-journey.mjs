// Boards — can a team actually make one, find it, and argue on it?
//
// Kris, 16 September: "no build these boards (artifacts) now - this is a key component of running
// the business properly". Design export 3.
//
// The unit tests hold the rules. This walks the thing a customer does: look around and find the two
// worked boards, open one, read the working behind the number, say something, and — the part that
// matters most — see that a board whose feeds are not connected does NOT claim to be live.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/boards-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition || !detail ? '' : `  — ${detail}`}`);
  if (!condition) failed++;
};

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await b.newContext({ viewport: { width: 1280, height: 1200 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });

const text = () => page.evaluate(() => document.body.innerText);

// ── A visitor walks in ───────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.click('text=Have a look inside');
await page.waitForLoadState('networkidle');

if (page.url().includes('busy=1')) {
  console.log('  --   the look-around is being throttled — SPEC protecting itself, not a fault.');
  await b.close();
  // Even on an early exit, the business this run made does not stay behind.
  await tidyUp(null, { lookSince: RUN_STARTED });
  process.exit(0);
}

await page.goto(`${BASE}/mirrors`, { waitUntil: 'networkidle' });
let body = await text();

check('Boards opens, and says what a board is for', /pins, builds on and discusses/i.test(body));
check('THE WORKED EXAMPLES ARE THERE', body.includes('Rate Board') && body.includes('King of the Mountain'), body.slice(0, 120));
check('and every type can be filtered on', (await page.locator('a[href^="/mirrors?type="]').count()) >= 6);

// ── A board that cannot be live must not say it is ───────────────────────────────────────────────
//
// The look-around has no real connections, so the Rate Board names Simpro and Xero and is NOT live.
// This is the check worth having: "partly current" reads as "current" on a screen, and this is the
// screen where somebody decides to drop a sell rate by ten dollars an hour.
check(
  'A BOARD WHOSE FEEDS ARE NOT CONNECTED NEVER CLAIMS TO BE LIVE',
  !body.includes('Updating now'),
  body.split('\n').find(l => l.includes('Updating now')) ?? '',
);

// By href, not by text: the card's title, its summary and a filter chip all contain words like
// "rate", and a selector that matches three things is a selector that clicks the wrong one.
const openBoard = async words => {
  const card = page.locator('a[href^="/mirrors?board="]', { hasText: words }).first();
  await card.click();
  await page.waitForURL('**/mirrors?board=*', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
};
await openBoard('Rate Board');
body = await text();

check('opening it shows the working, not just the answer', body.includes('Base hourly cost') && body.includes('Effective sell rate'));
check('each input says which system it came from', body.includes('Simpro') && body.includes('Xero'));
check('and the decision it turned on', body.includes('$115/hr') && body.includes('$105/hr'));
check(
  'it names the feeds that are not running rather than going quiet',
  /not connected and working/i.test(body),
  body.split('\n').find(l => /live/i.test(l)) ?? '',
);
check('the discussion sits next to the numbers', body.includes('Discussion') && body.includes('Xero actuals confirm'));
// Case-insensitive: it is a label-caps heading, and innerText reports what is RENDERED.
check('and it says who is in the room, honestly', /editing now/i.test(body));

// ── The plan board ───────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/mirrors`, { waitUntil: 'networkidle' });
await openBoard('King of the Mountain');
body = await text();
check('a plan shows who owns each step', body.includes('Permitting') && body.includes('Anthony'));
check('and where each one has got to, without scoring it', /Stuck|Being done now|Not started/.test(body));
check('no percentage anywhere on a plan', !/\d+%/.test(body), body.match(/\d+%/)?.[0] ?? '');

// ── A visitor still writes nothing ───────────────────────────────────────────────────────────────
const say = page.locator('form:has(textarea[name="text"])').first();
if (await say.count()) {
  await say.locator('textarea').fill('a visitor should not be able to say this');
  await say.locator('button').click();
  await page.waitForTimeout(2500);
  const after = await text();
  check(
    'A VISITOR CANNOT POST ON A BOARD, and is told why',
    after.includes('That was not saved, because this is a look around'),
    after.split('\n').find(l => /not saved|went wrong/i.test(l)) ?? '',
  );
  check('and never shown an error page for it', !after.includes('Something went wrong on our end'));
} else {
  check('there is somewhere to say something on a board', false, 'no discussion form');
}

// ── Conversation boards survived ─────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/mirrors/conversations`, { waitUntil: 'networkidle' });
body = await text();
check(
  'CONVERSATION BOARDS STILL EXIST, and are still a mirror',
  /mirror, not a dashboard/i.test(body),
  body.slice(0, 100),
);

check('no console errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(null, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
