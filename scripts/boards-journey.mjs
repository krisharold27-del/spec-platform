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
/*
  ── Scoped to the plan, because the rule is about the plan ──────────────────────────────────────

  A plan says where each step has got to in words — Stuck, Being done now, Not started — and never
  as a percentage, because a plan with a number on it becomes a number people manage.

  This scanned the WHOLE PAGE, and went red the day mirrors learned to carry the business's real
  KPIs: one of them is called "Department 100% staffed", and its name appeared in the add-a-measure
  picker. Nothing was scoring the plan. The rule was right and the check was looking in the wrong
  place — so it now reads the plan's own section, and the detail says where a match was found
  rather than printing the number on its own.
*/
const planText = await page.locator('[data-plan-steps]').first().innerText().catch(() => '');
check('a plan is drawn at all', planText.length > 0);

/*
  ── A plan you can move, in the meeting you are moving it in ────────────────────────────────────

  Kris, 19 September: *"so the King of the Mountain mirror must be interactive"*.

  It was a printed list: the states were on the screen in words and the only way to change one was
  to edit a row of JSON, so the thing a team looks at together could not be changed together.

  This is the look-around, which writes nothing by design — so what is asked here is that the
  CONTROLS are on the plan at all. That the move really lands is asked further down, on a business
  that can write.
*/
check('A PLAN OFFERS ITS STATES AS SOMETHING YOU CAN PRESS',
      (await page.locator('[data-plan-steps] button').count()) >= 4,
      `${await page.locator('[data-plan-steps] button').count()} controls on the plan`);
check('  and a way to add a step, because a plan nobody can add to goes stale',
      (await page.locator('#plan-step').count()) === 1);
check('no percentage anywhere on a plan', !/\d+%/.test(planText),
      planText.match(/.{0,70}\d+%.{0,70}/s)?.[0]?.replace(/\n/g, ' ') ?? '');

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

/*
  ── A mirror that reads the numbers instead of remembering them ──────────────────────────────────

  Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — *"live and interactive,
  not a report"* — and *"align to key kpi's in the business"*.

  Every figure on a mirror was JSON, stored when somebody made it, under a badge reading Live. The
  badge was true about whether the named systems are CONNECTED and said nothing about the numbers,
  which had never been recalculated once.

  ── Why this signs a business up, when the rest of this file does not ───────────────────────────

  Everything above walks the LOOK-AROUND, which is read-only on purpose — a visitor writes nothing,
  and one of the checks above exists to prove it. So the first version of this ran as that visitor,
  correctly changed nothing, and reported the product broken for obeying its own rule. Putting a
  measure on a mirror is a write, so it needs somebody who can write.
*/
const stamp = Date.now();
const BUSINESS = `Mirror Test ${stamp}`;
{
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'Kris Harold');
  await page.fill('input[name="business"]', BUSINESS);
  await page.fill('input[name="email"]', `mirror-${stamp}@journey.test`);
  await page.fill('input[name="password"]', 'a-good-password-123');
  await page.check('input[name="consent"]').catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});

  if (page.url().includes('error=busy')) {
    console.log('  --   sign-up is being throttled — not a fault.');
  } else {
    await page.goto(`${BASE}/mirrors`, { waitUntil: 'networkidle' });
    await page.fill('input[name="title"]', 'Where the quotes go');
    // Made as a PLAN, so the plan half of a mirror is exercised too.
    await page.selectOption('select[name="kind"]', 'plans').catch(() => {});
    await page.getByRole('button', { name: /Start (a )?mirror|Create|Add/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);

    if (!page.url().includes('board=')) {
      const made = page.locator('a[href^="/mirrors?board="]').first();
      if (await made.count()) {
        await made.click();
        await page.waitForURL('**/mirrors?board=*', { timeout: 15000 }).catch(() => {});
      }
    }

    const picker = page.locator('#mirror-kpi');
    check('A NEW BUSINESS CAN START A MIRROR', page.url().includes('board='), page.url());

    if (await picker.count()) {
      const chose = await picker.locator('option').first().innerText();
      const measure = chose.split('\u2014').pop().trim();
      await page.getByRole('button', { name: 'Put it on the mirror' }).click();
      await page.waitForTimeout(2500);

      /*
        Read the LINES, not the page.

        The picker below lists every measure by name, so a check scanning the whole document cannot
        tell a line that is drawn from an option in a dropdown — it would have passed on a mirror
        that showed nothing at all. Same mistake as the plan rule one screen up, found the same way.
      */
      const lines = await page.locator('[data-mirror-lines]').innerText().catch(() => '');
      check('A MIRROR CAN CARRY ONE OF THE BUSINESS’S REAL KPIs', lines.includes(measure),
            lines ? lines.slice(0, 200).replace(/\n/g, ' ') : 'no live lines are drawn at all');
      // Case-insensitive, for the same reason the heading check above it is: the standing is drawn
      // as a label-caps chip, and innerText reports what is RENDERED, not what the code wrote.
      check('  and says where it stands rather than only naming it',
            /not marked yet|met|not met|on track|confirmed|watch|pending|not tracked/i.test(lines),
            lines.slice(0, 200).replace(/\n/g, ' '));
      check('  and puts it against the agreed target, which is what the conversation is about',
            /agreed target|no target agreed/i.test(lines),
            lines.slice(0, 200).replace(/\n/g, ' '));

      /*
        The month control is what makes it live. A brand-new business has one month, so there is
        nothing to change to — said out loud rather than passing on a check that never ran.
      */
      const months = await page.locator('#mirror-period option').count();
      if (months >= 2) {
        const second = await page.locator('#mirror-period option').nth(1).getAttribute('value');
        await page.selectOption('#mirror-period', second);
        await page.getByRole('button', { name: 'Show that month' }).click();
        await page.waitForTimeout(1500);
        check('  AND THE MONTH CAN BE CHANGED, which is what makes it live',
              page.url().includes('period='), page.url());
      } else {
        console.log(` skip  AND THE MONTH CAN BE CHANGED — a new business has only ${months} month to look at`);
      }
    }

    /*
      And the plan, moved for real — by somebody who can write.

      Pressing a state and then reading it back from the page is the whole question: a control that
      looks pressable and changes nothing is worse than no control, because the team walks out of
      the meeting believing the plan says something it does not.
    */
    await page.goto(`${BASE}/mirrors`, { waitUntil: 'networkidle' });
    const planBoard = page.locator('a[href^="/mirrors?board="]').first();
    if (await planBoard.count()) {
      await planBoard.click();
      await page.waitForURL('**/mirrors?board=*', { timeout: 15000 }).catch(() => {});
      if (await page.locator('#plan-step').count()) {
        const step = `Check the stock against the schedule ${stamp}`;
        await page.fill('#plan-step', step);
        await page.fill('#plan-owner', 'Pat Nguyen');
        await page.getByRole('button', { name: 'Add it' }).click();
        await page.waitForTimeout(2000);

        let plan = await page.locator('[data-plan-steps]').first().innerText().catch(() => '');
        check('A STEP CAN BE ADDED TO A PLAN, and it is really there',
              plan.includes(step), plan.slice(0, 200).replace(/\n/g, ' '));
        check('  and it starts Not started, because claiming work is not doing it',
              /not started/i.test(plan), plan.slice(0, 200).replace(/\n/g, ' '));

        const row = page.locator('[data-plan-steps] li', { hasText: step }).first();
        await row.getByRole('button', { name: 'Stuck' }).click();
        await page.waitForTimeout(2000);
        plan = await page.locator('[data-plan-steps]').first().innerText().catch(() => '');
        const moved = plan.split('\n').find(l => l.includes('Pat Nguyen')) ?? '';
        check('  AND A STATE CAN BE MOVED, which is the whole point of it being interactive',
              /stuck/i.test(moved), moved || plan.slice(0, 200).replace(/\n/g, ' '));

        check('  and the plan is still never scored with a number',
              !/\d+%/.test(plan), plan.match(/.{0,60}\d+%.{0,60}/s)?.[0] ?? '');
      }
    } else {
      check('A MIRROR CAN CARRY ONE OF THE BUSINESS’S REAL KPIs', false,
            'no measure picker on the mirror, so nothing can be put on one');
    }
  }
}

await b.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
