/**
 * The journey every customer takes, driven in a real browser against the real app.
 *
 * This exists because the happy path could previously only be verified by reading the code — the
 * one journey somebody takes before they have any reason to trust us was the one journey nothing
 * checked. It runs in CI against scripts/fake-auth, so it is proven on every change rather than
 * whenever somebody remembers.
 *
 *   node scripts/journey.mjs [baseUrl]
 *
 * Exits non-zero and says which step broke.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const stamp = Date.now();
const EMAIL = `owner-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Journey Electrical ${stamp}`;

const failures = [];
const at = p => (p.url().replace(BASE, '') || '/').split('?')[0];

function check(label, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

/** Sign out for real: it is a form, not a link. */
async function signOut() {
  await page.goto(`${BASE}/signout`, { waitUntil: 'networkidle' });
  await page.click('button[type="submit"], form button');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 120)));

try {
  // ── 1. A stranger walks in and looks around, asked for nothing ────────────────────────────────
  await page.goto(`${BASE}/welcome`, { waitUntil: 'networkidle' });
  check('front door loads', at(page) === '/welcome');

  await page.click('text=Have a look inside');
  await page.waitForLoadState('networkidle');
  check('one press puts a stranger inside a real business', at(page) === '/org', at(page));
  check('and it says plainly that it is a look around', await page.locator('text=having a look around').count() > 0);

  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  check('a visitor can read Today', at(page) === '/today', at(page));

  // ── 2. They decide they like it and sign up ───────────────────────────────────────────────────
  await page.goto(`${BASE}/look/decide`, { waitUntil: 'networkidle' });
  check('the decision is asked once, after they have seen it', await page.locator('text=Do you like what you see').count() > 0);

  // By href, not by text: a selector that depends on a curly apostrophe is a test that breaks on
  // a copy edit rather than on a regression.
  await Promise.all([
    page.waitForURL('**/signup**', { timeout: 15000 }).catch(() => {}),
    page.click('a[href="/signup?keep=1"]'),
  ]);
  await page.waitForLoadState('networkidle');
  check('yes goes to sign-up', at(page) === '/signup', at(page));

  await page.fill('input[name="name"]', 'Kris Harold');
  await page.fill('input[name="business"]', BUSINESS);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.waitForTimeout(3500);             // the form deliberately refuses a too-fast submission
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  /*
    Onto MY PAGE, which is where every day starts from here on.

    It used to land on the org chart, which broke the promise the front door makes in those exact
    words — "your page is waiting, with this problem already sitting in the middle of it" — and
    carried a ?welcome=1 that nothing anywhere read. The shape of the product is: landing page →
    My Page → everything else, and this is the check that keeps it that way.
  */
  check('SIGN-UP SUCCEEDS and lands them on MY PAGE', at(page) === '/today', at(page));
  check('and My Page greets them rather than leaving them to work it out',
    (await page.content()).includes('This is your page'));

  // The whole promise of looking around first: what they saw is what they now own.
  check('and it KEPT the business they were looking at', (await page.content()).includes(BUSINESS));

  // ── 3. They come back the next morning ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  check('still signed in on Today', at(page) === '/today', at(page));

  // Typing the bare address is what somebody actually does every morning. It must be My Page, not
  // the executive summary — that is a monthly read for whoever runs the place, not a day's work.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('TYPING THE ADDRESS THE NEXT MORNING OPENS MY PAGE', at(page) === '/today', at(page));

  await page.goto(`${BASE}/summary`, { waitUntil: 'networkidle' });
  check('and the executive summary still has a home of its own', at(page) === '/summary', at(page));

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  check('an already-signed-in person is never shown a sign-in form', at(page) !== '/signin', at(page));

  await signOut();
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  check('signing out really signs you out', at(page) === '/signin', at(page));
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  check('SIGN-IN SUCCEEDS and lands on Today', at(page) === '/today', at(page));

  // ── 4. Getting it wrong says the right thing ──────────────────────────────────────────────────
  await signOut();
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', 'not-the-right-one');
  // Wait for the redirect itself, not for the network to go quiet — a server action redirect can
  // land after networkidle resolves, which reads as "no error" when there plainly is one.
  await Promise.all([
    page.waitForURL('**/signin?*', { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('networkidle');
  const wrongUrl = new URL(page.url()).searchParams.get('error') ?? '(none)';
  const wrong = await page.content();
  check('a wrong password is told it is wrong', wrongUrl === 'wrong', `error=${wrongUrl}`);
  // The one that matters: never blame the customer's details for an outage of ours.
  check('and is never told the service is down', !wrong.includes('temporarily unavailable'));

  check('no page errors anywhere in the journey', consoleErrors.length === 0, consoleErrors[0] ?? '');
} catch (err) {
  check('journey ran to the end', false, String(err.message).slice(0, 160));
  await page.screenshot({ path: '/tmp/journey-failure.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} step(s) failed: ${failures.join(', ')}` : '\nEvery step passed.');
process.exit(failures.length ? 1 : 0);
