/**
 * Closing a month, driven end to end in a browser.
 *
 * ── Why this did not exist until now ─────────────────────────────────────────────────────────────
 *
 * Twenty-one journeys, and not one of them had ever taken a month from open to signed. The single
 * thing SPEC is FOR — a business scores its roles, hands the month up, and somebody accepts it —
 * was covered by unit tests on the pieces and by nothing at all end to end.
 *
 * It showed. Kris, 19 September, asked what the sign-off felt like: *"having to visit three
 * screens"*, and what he actually wanted to do in one sitting: *"just sign off what others have
 * marked"*. Approvals printed a card reading **Sign off September scoring** whose only action was a
 * link to a different page — it told him a thing was waiting on him and then sent him elsewhere to
 * do it. Every test passed, because each screen was correct on its own and nothing asked whether
 * the JOB could be done.
 *
 * So this is the job, not the screens: set the KPIs, mark them, submit, and then sign it off from
 * Approvals without going anywhere else. The last check is the one that matters — it fails on any
 * build where the signature lives on another page.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/signoff-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `signoff-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Signoff Test ${stamp}`;

const failures = [];
const skipped = [];
const skip = (label, why) => { console.log(` skip  ${label} — ${why}`); skipped.push(label); };
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => browser, business: BUSINESS, since: RUN_STARTED });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();

const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 160)));

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

// ── A real business, signed up the way anybody does ──────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});

// A throttled sign-up is SPEC protecting itself, not a fault. Leave loudly rather than reporting red.
if (page.url().includes('error=busy')) await stop(0, 'sign-up is being throttled (error=busy) — not a fault.');
if (!/\/(my-page|welcome|setup)/.test(page.url())) await stop(1, `could not sign up (landed on ${page.url()})`);

/* ─────────────────────────────────────────────────────────────────────────────
 * The founder puts themselves on their own chart
 * ───────────────────────────────────────────────────────────────────────────── */

/*
  Signing is never delegable — `signPeriod` refuses anybody who is not the top of the chart, and
  `isTopOfChart` starts by asking which role the account holds. A founder on their first morning
  holds none: SPEC works out what somebody may do by walking DOWN from their own role, and a person
  who is not on the chart has nothing to walk down from.

  So the first thing a real owner does is put themselves in the top role, and this run found that
  out the way a customer would — the month reached `submitted` and then no Sign button appeared
  anywhere, because the guard was right and the person was not placed.
*/
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
/*
  The TOP card, not the first one in the document.

  Cards are absolutely positioned, so document order is layout order and "first" is whatever the
  walk happened to place first — which on this run was a leaf. The account landed at the bottom of
  the chart, scope walked DOWN from there and found one role, and the month went from four roles to
  one. Exactly the fault Kris hit in September when a drag moved him out of the GM seat.
*/
const topCard = page.locator('[data-org-canvas] [data-role-card]')
  .filter({ hasText: /General Manager/i }).first();
const pickCard = (await topCard.count()) ? topCard : page.locator('[data-org-canvas] [data-role-card]').first();
await pickCard.click().catch(() => {});
await page.waitForTimeout(400);
const claim = page.getByRole('button', { name: /This role is me/i }).first();
if (await claim.count()) {
  await claim.click();
  await page.waitForLoadState('networkidle').catch(() => {});
}
const placed = await page.evaluate(() => /\(you\)/.test(document.body.innerText));
check('THE FOUNDER CAN PUT THEIR OWN ACCOUNT IN THE TOP ROLE', placed,
      'without this nobody can sign the month, because signing is not delegable');

/* ─────────────────────────────────────────────────────────────────────────────
 * The month has to have something in it before anybody can sign it
 * ───────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/scoring`, { waitUntil: 'networkidle' });
const scoringText = await page.evaluate(() => document.body.innerText);
check('THE SCORING SCREEN OPENS on a brand new business', !/went wrong/i.test(scoringText),
      scoringText.slice(0, 160).replace(/\n/g, ' '));

/*
  Mark the month, role by role, the way a manager does.

  Each criterion is a `<select>` and each role has its own **Save** — roles are opened one at a
  time, so the marks have to be set and saved per role rather than in one sweep of the page. The
  first real option is chosen on every criterion; what is being checked here is not the arithmetic
  (lib/scoring owns that and is tested) but whether a month can be moved from open to signed at all
  by pressing things on a screen.
*/
let marked = 0;
/*
  By INDEX, not by "the first one that still looks unmarked".

  The first version re-found the opener each round with a text pattern, which after a save still
  matched the role it had just finished — so it opened the General Manager eight times and the
  other three roles never got marked at all. The run then reported two SKIPS where the two checks
  that matter should have been, and a skip reads green.

  Roles are a fixed list on this page. Walk it.
*/
/*
  Pick the first role that is NOT yet fully marked, each time round.

  By index was the second wrong answer: every save re-renders the list and a role's label goes from
  "0/8" to "8/8", so `nth(i)` stops pointing at the role it pointed at a moment ago. Two of four got
  marked and the run reported SKIP where its two most important checks should have been.

  The honest selector is the state, not the position: find whatever still says it is short, open
  that, and stop when nothing does. `(\d+)/(\d+)` with the two numbers equal is "finished".
*/
const unmarkedLabel = () => page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/(\d+)\s*\/\s*(\d+)$/);
    if (m && m[1] !== m[2]) return t;
  }
  return null;
});

const roleCount = await page.evaluate(() => [...document.querySelectorAll('button')]
  .filter(b => /(\d+)\s*\/\s*(\d+)$/.test((b.textContent || '').replace(/\s+/g, ' ').trim())).length);

for (let round = 0; round < roleCount + 4; round += 1) {
  const label = await unmarkedLabel();
  if (!label) break;

  const opener = page.getByRole('button', { name: label, exact: true }).first();
  if (!(await opener.count())) break;
  await opener.scrollIntoViewIfNeeded().catch(() => {});
  await opener.click().catch(() => {});
  await page.waitForTimeout(400);

  const set = await page.evaluate(() => {
    let n = 0;
    for (const sel of document.querySelectorAll('select')) {
      if (sel.disabled) continue;
      const pick = [...sel.options].find(o => o.value && o.value !== '');
      if (!pick) continue;
      sel.value = pick.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      n += 1;
    }
    return n;
  });
  marked += set;

  const save = page.getByRole('button', { name: /^Save (?!the gates)/ }).first();
  if (await save.count()) {
    await save.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
  } else {
    break;
  }
}

check('  and it offers marks to press', marked > 0, `${marked} criteria marked across ${roleCount} roles`);

/*
  And they really landed. A `change` event dispatched from script can be swallowed by a controlled
  input, and "I clicked Save" is not the same claim as "the month moved" — which is the whole
  lesson of this file.
*/
await page.goto(`${BASE}/scoring`, { waitUntil: 'networkidle' });
const scoredNow = await page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s+of\s+(\d+)\s+roles scored/i);
  return m ? `${m[1]}/${m[2]}` : 'not stated';
});
check('  AND THE MARKS REALLY LANDED, rather than the click merely happening',
      /^([1-9]\d*)\/\1$/.test(scoredNow), `the page says ${scoredNow} roles scored`);

/* ─────────────────────────────────────────────────────────────────────────────
 * The pass: everything waiting on you, in one place, with the action on it
 * ───────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });

const pass = page.locator('[data-month-pass]');
check('APPROVALS SHOWS THE MONTH ITSELF, not just a card pointing at another screen',
      await pass.count() > 0,
      (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' '));

if (await pass.count()) {
  /*
    The roles, by name, with what each is at. A signer deciding whether to accept a month needs to
    see what they are accepting — a count of how many are done says nothing about whether any of it
    is right.
  */
  const roleRows = await page.locator('[data-month-pass] [data-month-role]').count();
  check('  and names every role, so there is something to actually review', roleRows > 0,
        `${roleRows} roles listed`);

  const passText = await pass.innerText();
  check('  and says what is outstanding and who it waits on', /to mark|marked|waiting|signed/i.test(passText),
        passText.slice(0, 200).replace(/\n/g, ' '));

  /*
    ── THE ONE THAT MATTERS ──────────────────────────────────────────────────────────────────

    The month is submitted and then SIGNED without leaving this page. On any build where the
    signature lives on /scoring, this fails — which is the state Kris was given.
  */
  const submit = page.getByRole('button', { name: /Submit .* for sign-off/i });
  if (await submit.count()) {
    await submit.click();
    /*
      Wait for the STATE, not for the network.

      A server action that does not redirect re-renders the page in place, so
      `waitForLoadState('networkidle')` returns while the button is still showing "Submitting…" —
      and the run then looked for a Sign button that had not been drawn yet and reported the month
      had never submitted. Three runs said that, and it was never true.

      Poll the thing being claimed instead. Same lesson, and the same fix, as `chartSays` in the
      org journey.
    */
    await page.waitForFunction(() => {
      const block = document.querySelector('[data-month-pass]');
      return block ? !/Submitting…/.test(block.innerText) : false;
    }, null, { timeout: 20000 }).catch(() => {});
  } else {
    skip('  submitting from Approvals', 'the month was not ready to submit (roles still unmarked)');
  }

  const sign = page.getByRole('button', { name: /Sign off/i });
  if (await sign.count()) {
    await sign.click();
    /*
      Polled, for the same reason the submit above is: an action that re-renders in place finishes
      after `networkidle` returns.

      And the post-condition is "Signed by <name>", not the word "signed" anywhere on the page —
      `signPeriod` records the signature without locking the month, so the status stays `submitted`
      and only the signature itself proves the press did anything. The first version of this block
      never said so: you pressed Sign and the page came back identical, which is the exact fault
      this journey keeps finding.
    */
    const signed = await page.waitForFunction(() => {
      const block = document.querySelector('[data-month-pass]');
      return block ? /Signed by /.test(block.innerText) : false;
    }, null, { timeout: 20000 }).then(() => true).catch(() => false);
    check('  AND THE MONTH IS SIGNED OFF WITHOUT LEAVING APPROVALS', signed,
          (await pass.innerText()).replace(/\n/g, ' / ').slice(-240));
  } else {
    /*
      A skip has to say enough to act on. "No Sign button" was true and useless three runs running:
      it could mean the month never submitted, or that it did and the screen did not notice, or
      that the person is not allowed to sign. Those are three different faults and the message has
      to separate them.
    */
    check('  AND THE MONTH IS SIGNED OFF WITHOUT LEAVING APPROVALS', false,
          `no Sign button. The month block ends: ${(await pass.innerText()).replace(/\n/g, ' / ').slice(-320)}`);
  }

  /*
    And a Sign button is never shown to somebody who could not use it. `signPeriod` refuses anybody
    who is not the top of the chart, and a control the server is going to refuse is how "I still
    cant" happens with nothing on screen to explain it.
  */
  const offersSign = await page.locator('[data-month-pass]').getByRole('button', { name: /Sign off/i }).count();
  const saysWaiting = /Waiting on|never delegable/i.test(await pass.innerText());
  check('  and never offers a signature to somebody who cannot sign',
        offersSign === 0 ? true : !saysWaiting);
}

check('no page threw', faults.length === 0, faults.join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
if (skipped.length) console.log(`${skipped.length} skipped: ${skipped.join(', ')}`);
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
