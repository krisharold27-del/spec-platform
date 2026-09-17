/**
 * Help, walked the way somebody stuck would walk it.
 *
 * Kris, 17 September: *"lets make an issue register expected from users… go through the full list
 * and lets make sure we have simple answers for them all"*.
 *
 * `tests/help.test.ts` holds every answer to the real routes and the real button labels. What it
 * cannot do is prove the page WORKS: that it opens for somebody who is not signed in, that the
 * search finds the answer when they type it in their own words, and that following an answer
 * genuinely lands them in front of the button it named.
 *
 * So this signs nobody in. That is the whole point — the person who most needs help is the one who
 * cannot get in, and a help page behind the sign-in answers everybody except them.
 *
 *   npm start &
 *   node scripts/help-journey.mjs
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
// A stranger: no cookies, no session, nothing.
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

const text = () => page.evaluate(() => document.body.innerText);

// ── It opens for somebody who cannot sign in ─────────────────────────────────────────────────────
await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
let body = await text();

check('HELP OPENS WITHOUT SIGNING IN', !page.url().includes('/signin'), page.url());
check('and answers the first thing anybody asks', body.includes('I cannot sign in'));
check('and the second', body.includes('I forgot my password'));
check('and the ones Kris named', body.includes('How do I add a person?') && body.includes('How do I delete a KPI?'));

// ── The words it must not lose ───────────────────────────────────────────────────────────────────
//
// Three answers are refusals. The one about access is the one people will hunt hardest for, and
// sending them looking for a switch that has never existed is the cruellest thing a help page can
// do. It has to say "no button, and here is why" on the page, not just in the data.
check(
  'IT SAYS PLAINLY WHERE THERE IS NO BUTTON',
  /There is no button for this, and that is deliberate/i.test(body),
  body.split('\n').find(l => /access|permission/i.test(l)) ?? '',
);
check('and explains what to do instead', /move them to a different role/i.test(body));

// The one that catches everybody.
check('the KPI answer says how a KPI actually goes', /Clear its text and save/i.test(body));

// ── Searching in their words, not ours ───────────────────────────────────────────────────────────
await page.goto(`${BASE}/help?q=cant+login`, { waitUntil: 'networkidle' });
body = await text();
check('SEARCHING IN THEIR OWN WORDS FINDS THE ANSWER', body.includes('I cannot sign in'), body.slice(0, 160));

await page.goto(`${BASE}/help?q=remove+kpi`, { waitUntil: 'networkidle' });
body = await text();
check('and "remove kpi" finds the one about deleting one', body.includes('How do I delete a KPI?'));

// A search that finds nothing must never be a dead end — it is the moment somebody gives up.
await page.goto(`${BASE}/help?q=zzzznothing`, { waitUntil: 'networkidle' });
body = await text();
check('NOTHING FOUND IS NEVER A DEAD END', /write to us/i.test(body), body.slice(0, 160));
check('and everything is still on the page underneath', body.includes('I cannot sign in'));

// ── Following an answer gets you to the button ───────────────────────────────────────────────────
//
// The promise the whole register makes. Signed out, /reset is one of the few an answer can be
// followed all the way through — so it is the one walked end to end.
await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
await Promise.all([
  page.waitForURL('**/reset**', { timeout: 15000 }).catch(() => {}),
  page.locator('a[href="/reset"]').first().click(),
]);
await page.waitForLoadState('networkidle');
check('FOLLOWING AN ANSWER LANDS ON THE RIGHT PAGE', page.url().includes('/reset'), page.url());
/*
  A BUTTON, not the words.

  The first version of this asked whether the body text contained "Email me a link" — and it passed
  while the browser was still sitting on /help, because the help page QUOTES that label. A check
  that passes on the page it was meant to navigate away from is not a check. So: a real button
  element, on the page the answer sent us to.
*/
check(
  'AND THE BUTTON IT NAMED IS REALLY THERE',
  page.url().includes('/reset')
    && (await page.locator('button:has-text("Email me a link"), input[value="Email me a link"]').count()) > 0,
  (await text()).split('\n').find(l => /email/i.test(l)) ?? '',
);

// ── It is reachable from the bottom of any page ──────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const helpLink = await page.locator('footer a[href="/help"]').count();
check('GET HELP IS IN THE FOOTER OF EVERY PAGE', helpLink > 0);
// It used to be a mailto, which made one person the help desk.
check(
  'and is a page rather than an email to one person',
  (await page.locator('footer a[href^="mailto:"]').count()) === 0,
);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
