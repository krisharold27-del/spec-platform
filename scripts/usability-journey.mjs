/**
 * How simple, intuitive and responsive SPEC actually is — measured, not asserted.
 *
 * Kris, 17 September: *"consider all possible ways people will not use this properly - then lets
 * test ourselves on how simple and beautiful the system is - how intutive and responsive"*.
 *
 * ── Why this is not a design review ──────────────────────────────────────────────────────────────
 *
 * "Beautiful" and "intuitive" are the two words most likely to be agreed with and then never
 * checked. So this takes the parts of them that CAN be measured on a real screen, and measures them
 * every time:
 *
 *   How long a door takes to open, from the press to the words being there.
 *   Whether the page fits a phone held in one hand, without sliding sideways.
 *   Whether anything on it is too small to hit with a thumb.
 *   Whether every page says where you are.
 *   Whether anywhere at all shows a fault instead of a sentence.
 *   How many presses the furthest thing is.
 *
 * What it deliberately does NOT do is score taste. Nothing here says a colour is right. It says
 * that a supervisor on a site, on a phone, at seven in the morning, can get where they are going.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/usability-journey.mjs
 */

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `usability-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Usability Test ${stamp}`;

/**
 * The budget a door has to open in.
 *
 * Two and a half seconds, and the number is arguable — what is not arguable is having one. Without
 * a budget, "it feels a bit slow" is a conversation instead of a failing check, and pages get
 * slower one render at a time because no single change ever made it slow.
 */
const BUDGET_MS = 2500;

/**
 * Two floors, and both are somebody else's number rather than mine.
 *
 * 24px is WCAG 2.5.8 — the published minimum for anything you are meant to hit. 40px is what a
 * button gets, because a button is a deliberate action and 2.5.5 asks for 44 where it can be had.
 *
 * Having two is the point. One number meant either failing every quiet text link in the product or
 * lowering the bar until the real buttons passed too, and a threshold tuned until everything passes
 * is not a check, it is a decoration.
 */
const PRESSABLE_PX = 24;
const BUTTON_PX = 40;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};
const note = line => console.log(`       ${line}`);

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => browser, business: BUSINESS, since: RUN_STARTED });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 120)));

const text = () => page.evaluate(() => document.body.innerText);

// ── Get a real business in, so the measuring happens on real pages ───────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
/*
  Up to eight seconds, because sign-up can legitimately take three of them: a form filled in
  instantly is HELD for the rest of the three-second bot window rather than being refused, so a
  browser driving it at machine speed always pays the full wait. See `waitOutMs`.
*/
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});

/*
  A throttled sign-up is SPEC protecting itself, not a fault. Exits clean and says so, rather than
  reporting eight red measurements for a product that is working perfectly.
*/
if (page.url().includes('error=busy')) {
  console.log('  --   sign-up is being throttled (error=busy) — SPEC protecting itself, not a fault.');
  await browser.close();
  await tidyUp(null, { lookSince: RUN_STARTED });
  process.exit(0);
}

if (!page.url().includes('/my-page') && !page.url().includes('/welcome') && !page.url().includes('/setup')) {
  console.log(`  --   could not sign up (landed on ${page.url()}) — nothing to measure.`);
  await browser.close();
  await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
  process.exit(1);
}

// ── Every door, from My Page, pressed rather than typed ──────────────────────────────────────────
//
// Typing the address would measure the same pages and prove nothing about reaching them. The whole
// claim of this product's shape — "the logo goes home, and everything else is a door on My Page" —
// is a claim about PRESSING, so the doors are read off the page and pressed.
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const doors = await page.evaluate(() =>
  [...document.querySelectorAll('a[href^="/"]')]
    .map(a => ({ href: a.getAttribute('href'), label: a.innerText.trim().split('\n')[0] }))
    .filter(d => d.href && !d.href.startsWith('/#') && d.label),
);
const seen = new Map();
for (const d of doors) if (!seen.has(d.href)) seen.set(d.href, d.label);

check('MY PAGE IS THE WAY IN — every screen hangs off it', seen.size >= 12, `${seen.size} doors`);

const slow = [];
const nameless = [];
const sideways = [];
const errored = [];

for (const [href, label] of seen) {
  if (href.startsWith('/signout')) continue;

  const started = Date.now();
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const took = Date.now() - started;
  if (took > BUDGET_MS) slow.push(`${label} ${(took / 1000).toFixed(1)}s`);

  const body = await text();
  if (/Something went wrong on our end/i.test(body)) errored.push(label);

  // Does the page say where you are, without scrolling?
  const heading = await page.evaluate(() => {
    const h = document.querySelector('h1, h2');
    return h ? h.innerText.trim() : '';
  });
  if (!heading) nameless.push(label);
}

check('EVERY DOOR OPENS INSIDE THE BUDGET', slow.length === 0, slow.join(', '));
check('and every page says where you are', nameless.length === 0, nameless.join(', '));
check('NOTHING SHOWS A FAULT INSTEAD OF A SENTENCE', errored.length === 0, errored.join(', '));

// ── The same pages, in one hand ──────────────────────────────────────────────────────────────────
//
// A supervisor is the person this product is for, and a supervisor is not at a desk. A page that
// slides sideways on a phone is not a small problem: it is the half of the screen nobody finds.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const small = await phone.newPage();
await small.context().addCookies(await context.cookies());

const tooSmall = [];
for (const [href, label] of seen) {
  if (href.startsWith('/signout')) continue;
  await small.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await small.waitForLoadState('networkidle').catch(() => {});

  /*
    Not just "this page is too wide" — WHICH ELEMENT is too wide. A measurement that reports a
    number leaves somebody to go and find the cause by hand, which is most of the work; the widest
    thing sticking out past the edge is almost always the answer.
  */
  const overflow = await small.evaluate(() => {
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (over <= 1) return null;
    const edge = document.documentElement.clientWidth;
    let worst = null;
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      // Either it sticks out past the edge, or it is simply wider than the screen.
      const out = Math.max(r.right - edge, r.width - edge);
      if (out <= 1) continue;
      if (!worst || out > worst.out) {
        const cls = String(el.className || '').split(' ').filter(Boolean).slice(0, 3).join('.');
        worst = { out: Math.round(out), what: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}` };
      }
    }
    return { over, worst };
  });
  if (overflow) sideways.push(`${label} +${overflow.over}px (${overflow.worst?.what ?? 'unknown'})`);

  /*
    Anything you are meant to PRESS has to be big enough to press. Two things are deliberately not
    held to that, and saying which — rather than quietly lowering the number until everything
    passes — is the difference between a check and a decoration:

      A link inside a sentence. Prose links are the height of the text around them, and forcing
      them to 40px would break the paragraph they live in. They are read, then followed; they are
      not aimed at.

      The org chart canvas. It is a drag-and-drop surface built for a desktop, and the boxes on it
      are sized by the chart, not by a thumb. SPEC has a separate field view for a phone. If that
      ever stops being true this exception is the thing to delete first.
  */
  const tiny = await small.evaluate(([floor, buttonFloor]) => {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button, input[type="submit"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;                  // not on screen
      if (getComputedStyle(el).display === 'inline') continue;        // a link inside a sentence
      if (el.closest('[data-org-canvas]')) continue;                  // the desktop chart surface
      /*
        A button is a thing STYLED as a button, not merely a <button> tag. A chip is a quiet
        suggestion — "try the example" — and holding it to 40px would turn every gentle offer in
        the product into a slab. It still has to clear the 24px floor like everything else.
      */
      const isButton = /\bbtn-/.test(String(el.className || ''));
      const want = isButton ? buttonFloor : floor;
      if (r.height >= want) continue;
      const words = (el.innerText || el.value || '').trim().split('\n')[0];
      if (words) out.push(`${words} ${Math.round(r.height)}px (wants ${want})`);
    }
    return out.slice(0, 4);
  }, [PRESSABLE_PX, BUTTON_PX]);
  if (tiny.length) tooSmall.push(`${label}: ${tiny.join(', ')}`);
}

check('IT FITS A PHONE — nothing slides sideways', sideways.length === 0, sideways.slice(0, 5).join(' | '));
check(`and nothing you press is under ${PRESSABLE_PX}px, nor a button under ${BUTTON_PX}px`, tooSmall.length === 0, tooSmall.slice(0, 4).join(' | '));

// ── Locked out, which is when people need it most ────────────────────────────────────────────────
//
// Every one of these pages will be opened by somebody who is signed out — a bookmark, a link in a
// message, a phone that forgot. None of them may answer with a fault.
const strangers = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const stranger = await strangers.newPage();
const badDoors = [];
for (const [href, label] of seen) {
  await stranger.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const body = await stranger.evaluate(() => document.body.innerText);
  const landedOnSignin = stranger.url().includes('/signin') || /sign in/i.test(body);
  if (/Something went wrong on our end/i.test(body) || (!landedOnSignin && body.trim().length < 40)) {
    badDoors.push(`${label} → ${stranger.url().replace(BASE, '')}`);
  }
}
check(
  'A SIGNED-OUT PERSON IS ALWAYS SENT TO SIGN IN, never to a fault',
  badDoors.length === 0,
  badDoors.slice(0, 5).join(' | '),
);

check('no page threw', faults.length === 0, faults.join(' | '));

note(`${seen.size} doors measured, budget ${BUDGET_MS}ms each`);

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
