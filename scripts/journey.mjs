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
import { tidyUp } from './test-cleanup.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

// Argument first, then APP_URL, matching the other four journeys. One of them reading only an
// argument while the rest read only an environment variable is how a run quietly drives at the
// wrong app and reports on something nobody asked about.
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const stamp = Date.now();
const EMAIL = `owner-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Journey Electrical ${stamp}`;

const failures = [];
const at = p => (p.url().replace(BASE, '') || '/').split('?')[0];

/**
 * Is the sign-in stand-in actually answering?
 *
 * Asked only once sign-up has already failed, to tell two very different things apart: SPEC is
 * broken, or the thing SPEC signs people in through is not running. On 16 September those looked
 * identical — five failing checks and a screen reading "That didn't work" — and an hour went on the
 * wrong one. A harness that is not up is not a fault in the product, and reporting it as one is how
 * a verdict stops being trusted.
 *
 * Any answer at all counts as up. It replies 401 to this route, which is correct, and is also why
 * `curl -f` could never be used to wait for it.
 */
async function authStandInUp() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  try {
    await fetch(`${base}/auth/v1/user`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

const HARNESS_DOWN = ' [THE SIGN-IN STAND-IN IS NOT ANSWERING — this is the harness, not SPEC]';

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

// The browser to drive. Hardcoding one machine's path meant this journey — the one every customer
// takes — could only run on that machine; CHROME_PATH is what scripts/check.mjs works out and hands
// down, and falling back to Playwright's own copy keeps it working anywhere else.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 120)));

try {
  // ── 1. A stranger walks in and looks around, asked for nothing ────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('front door loads', at(page) === '/');

  await page.click('text=Have a look inside');
  await page.waitForLoadState('networkidle');

  /*
    The look-around is rate-limited too — five an hour per address, which several runs of this
    journey will use up. Same rule as the sign-up throttle below: a safeguard doing its job is not
    a broken product, and reporting it as one is how a verdict stops being trusted.
  */
  if (page.url().includes('busy=1')) {
    console.log('  --   the look-around is being throttled (error=busy) — SPEC protecting itself, not a fault. Wait an hour, or run the other journeys.');
    await browser.close();
    // Even on an early exit, the business this run made does not stay behind.
    await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
    process.exit(0);
  }

  check('one press puts a stranger inside a real business', at(page) === '/org', at(page));
  check('and it says plainly that it is a look around', await page.locator('text=having a look around').count() > 0);

  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  check('a visitor can read Today', at(page) === '/my-page', at(page));

  /*
    The other half of the beautifully simple start.

    A brand-new business holds back the week, the training path, the mail block and what changed —
    all true, all empty, and all of it landing on somebody who came here because they already have
    more than they can hold (Kris, 16 September). scripts/register-journey checks they are ABSENT on
    day one. This checks they come BACK, because a section held back on an empty page and a section
    quietly deleted look identical from the empty page.

    The look-around business is the one with real history in it, which is exactly what makes it the
    right place to ask.
  */
  const lived = await page.evaluate(() => document.body.innerText);
  for (const [label, words] of [
    ['the week', 'My week'],
    ['the training path', 'My training'],
    ['what changed under them', 'Changes you should know about'],
  ]) {
    check(`a business with history still shows ${label}`, lived.includes(words));
  }
  check('and My week still says it is not a diary', /not your diary/i.test(lived));

  /*
    ── A visitor can never write, and finding that out is not frightening ──────────────────────────

    READINESS has claimed for a fortnight that "a visitor can never write — the look-around journey
    checks it". It did not. It checked that a visitor could READ, and never once tried to save
    anything, so the claim rested on reading the code rather than on doing it.

    What actually happened when you tried was the generic failure page: "Something went wrong on our
    end, not yours", with a reference number. To a stranger three minutes into evaluating SPEC, that
    is the product falling over in the shop window. It was found on the lapsed path on 16 September;
    the visitor had the same fault all along and nobody had walked into it.
  */
  await page.goto(`${BASE}/setup/business`, { waitUntil: 'networkidle' });
  /*
    Find something to submit, whatever shape the demo business happens to be in.

    The first version looked only for the "add a role by hand" form, which exists only when that
    stream has no template proposal waiting — so whether this check could run at all depended on the
    seeded chart. It passed here and failed in CI, which is the least useful way for a check to
    behave. Three shapes are tried, and only if none of them is on the page is that a failure, with
    the page named.
  */
  const adding = await (async () => {
    for (const sel of ['form:has(input[name="title"])', 'form:has(input[name="name"])', 'form:has(input[name="template"])']) {
      const f = page.locator(sel).first();
      if (await f.count()) return f;
    }
    return null;
  })();
  if (adding) {
    const box = adding.locator('input[name="title"], input[name="name"]').first();
    if (await box.count()) await box.fill('Role A Visitor Added');
    await adding.locator('button').first().click();
    await page.waitForTimeout(2500);
    const said = await page.evaluate(() => document.body.innerText);
    check('A VISITOR WHO TRIES TO SAVE IS NEVER SHOWN AN ERROR PAGE',
      !said.includes('Something went wrong on our end'),
      said.split('\n').find(l => l.includes('went wrong')) ?? '');
    /*
      Looking for the words of the NOTICE, not for "look around".

      The first version of these two checked for the phrase "look around" and for a link to
      /look/decide — both of which the look-around bar puts at the top of every page anyway. They
      would have passed with no message on the screen at all. A check that cannot tell the difference
      between the thing working and the thing missing is not a check.
    */
    check('and is told plainly that it was not saved, and why',
      said.includes('That was not saved, because this is a look around'));
    check('and is offered the way to keep what they have been doing',
      await page.locator('a', { hasText: 'Set up my business' }).count() > 0);
  } else {
    check('a visitor reaches a page with something to save on it', false,
      `nothing to submit on ${at(page)} — ${await page.locator('form').count()} forms`);
  }

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
  // Agreement is required at sign-up — unticked by default, and refused on the server too.
  await page.check('input[name="consent"]').catch(() => {});
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
  /*
    A tripped throttle is not a broken sign-up.

    Every journey here creates an account, so several runs close together hit SPEC's own protection
    against a flood of accounts from one address. `at()` drops the query string, so the reason was
    invisible and this reported a broken product instead of a safeguard doing its job — said out
    loud here so scripts/check.mjs can skip rather than cry wolf.
  */
  if (page.url().includes('error=busy')) {
    console.log('  --   sign-up is being throttled (error=busy) — SPEC protecting itself, not a fault. Wait a few minutes.');
    await browser.close();
    // Even on an early exit, the business this run made does not stay behind.
    await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
    process.exit(0);
  }

  /*
    When sign-up fails, say WHY — not just where it ended up.

    In CI this reported `/signup` and nothing else, and every check after it fell over, and the only
    place the reason existed was a log served from a host that is not always reachable. `at()` drops
    the query string, so even the error code the page was carrying went missing. A check that can
    only say "not the page I expected" makes the next person guess, and guessing is what cost three
    rounds here.
  */
  const landed = at(page) === '/my-page';
  const why = landed ? '' : await (async () => {
    const url = page.url();
    const visible = (await page.evaluate(() => document.body.innerText))
      .split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6).join(' / ');
    return `${url} :: ${visible.slice(0, 220)}${(await authStandInUp()) ? '' : HARNESS_DOWN}`;
  })();
  check('SIGN-UP SUCCEEDS and lands them on MY PAGE', landed, why || at(page));
  check('and My Page greets them rather than leaving them to work it out',
    (await page.content()).includes('This is your page'));

  // The whole promise of looking around first: what they saw is what they now own.
  check('and it KEPT the business they were looking at', (await page.content()).includes(BUSINESS));

  // ── 3. They come back the next morning ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  check('still signed in on Today', at(page) === '/my-page', at(page));

  // Typing the bare address is what somebody actually does every morning. It must be My Page, not
  // the executive summary — that is a monthly read for whoever runs the place, not a day's work.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('TYPING THE ADDRESS THE NEXT MORNING OPENS MY PAGE', at(page) === '/my-page', at(page));

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
  check('SIGN-IN SUCCEEDS and lands on Today', at(page) === '/my-page', at(page));

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
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failures.length ? 1 : 0);
