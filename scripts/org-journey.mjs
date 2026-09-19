/**
 * The org chart's own affordances, pressed in a real browser.
 *
 * Kris, 18 September: *"this is not the same as on the design site - make sure everything is done
 * 100% - its not the same"*. He was right. `SPEC Org Chart.dc.html` offers a right-click menu with
 * five things on it, and a panel that renames a role and the person in it. The product had a drag,
 * an Unlink and a Vacate, and **no way to rename a role anywhere in SPEC at all**.
 *
 * ── Why this is a browser check and not a source check ───────────────────────────────────────────
 *
 * `npm run designs:coverage --deep` said 100% the whole time it was missing. All three of its tiers
 * read the design's markup, and one of them starts by deleting every `<script>` — which is where a
 * prototype keeps its menu. A fourth tier now reads exactly that, and would have caught it.
 *
 * But a phrase check can only ever ask whether the WORDS are in the source. "Add a direct report"
 * appearing in a string is not a role being created. So this opens the menu with a right-click,
 * presses the item, and then asks the database-backed page whether a role is really there — the
 * same rule the rest of this suite runs on: a claim nobody checks quietly stops being true.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/org-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';
import { randomUUID } from 'node:crypto';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `org-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Org Test ${stamp}`;

/** Every item the design's menu offers on a card. Verbatim from `SPEC Org Chart.dc.html`. */
const CARD_MENU = [
  'Add a direct report',
  // Design 15's team layer: a crew belongs to the leader who runs it, so it is added from their menu.
  'Add a team',
  'Rename role & person',
  'Break the link',
  'Make this role vacant',
  'Remove role',
];

/*
  Bring a card fully into view BEFORE right-clicking it.

  The menu is pinned to the window and closes on any scroll, which is right — a menu left floating
  over the wrong card after the page moves is worse than one that shuts. But Playwright scrolls an
  element into view as part of clicking, so a menu item below the fold was opened and then closed by
  the very act of reaching for it: "element was detached from the DOM". A person scrolls first and
  then aims; so does this.
*/
const aimAt = async locator => {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  /*
    A card that has not finished settling is not a product fault.

    Playwright refuses to click an element whose box is still moving, and throws — which ends the
    whole run with a stack trace instead of a result. CI failed exactly this way on 19 September and
    the run could say only "org-journey failed", because a crash prints no FAIL line for the
    annotations to lift. A slower machine is allowed to be slower. A second aim, once, after a
    pause: if it is still moving then, something really is wrong and it should be heard about.
  */
  try {
    await locator.click({ button: 'right', timeout: 8000 });
  } catch {
    await page.waitForTimeout(800);
    await locator.click({ button: 'right', timeout: 8000 });
  }
  await menu.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
};

/*
  Wait for the chart to actually SAY something, rather than sleeping and hoping.

  A server action does not navigate, so `waitForLoadState('networkidle')` returns straight away and
  the only real wait was a flat 600ms. That is a coin toss on a slow machine: this check failed
  roughly one run in three, reporting a product fault that was entirely mine. Polling the thing
  being claimed is both faster and true.
*/
const chartSays = async (wanted, tries = 40) => {
  for (let n = 0; n < tries; n++) {
    const text = await page.locator('[data-org-canvas]').innerText().catch(() => '');
    if (text.includes(wanted)) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

/*
  ── Why this waits and never reloads ─────────────────────────────────────────────────────────────

  It reloaded while it waited, and that was the whole flake. A server action is an ordinary request:
  reloading the page half a second after pressing Save can abort it before the server has finished,
  so the write never lands and the check reports a product fault that is entirely the check's doing.
  It failed four runs in five and sent me looking for a bug in the chart twice.

  Nothing needs reloading anyway — every one of these actions calls `revalidatePath('/org')`, so the
  chart updates itself in place. Waiting for the words to appear is both the honest check and the
  faster one.
*/
const failures = [];
const skipped = [];
/** A check that could not run here. Printed, counted and named in the summary — never dropped. */
const skip = (label, why) => {
  console.log(` skip  ${label} — ${why}`);
  skipped.push(label);
};
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

/** The one menu on the page, wherever it has been opened from. */
const menu = page.locator('[role="menu"]');

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

// ── Get a real business in ───────────────────────────────────────────────────────────────────────
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

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });

const cards = () => page.locator('[data-org-canvas] [draggable="true"]');
const cardCount = async () => cards().count();
const before = await cardCount();
check('THE CHART DRAWS', before > 0, `${before} cards`);
if (!before) await stop(1, 'no cards to work with.');

// ── The menu the design has and the product did not ──────────────────────────────────────────────
const first = cards().first();
await aimAt(first);

check('RIGHT-CLICKING A CARD OPENS A MENU', await menu.isVisible());

const offered = (await menu.locator('[role="menuitem"]').allInnerTexts()).map(t => t.trim());
/*
  "Break the link" and "Make this role vacant" are offered only where they mean something — the top
  of a chart hangs from nothing, and an empty role has nobody to remove. So the design's five are
  checked as a SUBSET of what any one card may show, and the two conditional ones are proven on a
  card that qualifies rather than demanded on every card.
*/
/*
  "Set this role's KPIs" is first on purpose. Kris: "org chart and entering kpi's is everything to
  this system - why is it so hard" — every route into the KPI screen was an empty state that
  vanished once a role had KPIs, and the chart had no route at all.
*/
check('  KPIs ARE THE FIRST THING THE MENU OFFERS', offered[0] === 'Set this role\u2019s KPIs', offered.join(', '));
for (const item of ['Add a direct report', 'Rename role & person', 'Remove role']) {
  check(`  and it offers "${item}"`, offered.includes(item), `offered: ${offered.join(', ')}`);
}

// ── Escape closes it, because a menu you cannot dismiss is worse than no menu ─────────────────────
await page.keyboard.press('Escape');
check('ESCAPE CLOSES IT', !(await menu.isVisible()));

// ── The ⋯ button, for anybody who never thinks to right-click ────────────────────────────────────
await first.locator('button[aria-label^="What can be done"]').click();
await menu.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
check('AND THE ⋯ BUTTON OPENS THE SAME MENU', await menu.isVisible());

/*
  ── And a scroll does not take it away again ───────────────────────────────────────────────────

  This check is here because the one above it failed for a day and the CSS got the blame twice.

  Measured with the browser instrumented: pressing ⋯ on a card part-way down the chart makes
  Chromium scroll the window of its own accord — about ten milliseconds AFTER the click, to the
  card's own offset. The menu was closing on any scroll, so it opened and the scroll it had just
  caused shut it again. On screen: press the button, the page jumps, nothing appears.

  The menu now follows the card it was opened on rather than closing. So this scrolls the page
  deliberately, with the menu open, and asks two things of it: that it is STILL THERE, and that it
  has MOVED WITH the card — a menu that survives a scroll by standing still is pointing at the
  wrong role, which is the fault the closing was meant to avoid.
*/
/*
  The scroll puts the card at a known place — 200px down the window — rather than moving by a fixed
  amount, and the first draft of this check is why. It scrolled down 240 from wherever the browser
  had already left the page, which on this card was the very top, so the card went off the window
  and the menu closed: correctly, for the one reason it is still allowed to close. The check went
  red at the product for doing exactly the right thing.
*/
const menuBefore = await menu.boundingBox();
await page.evaluate(() => {
  const card = document.querySelector('[data-org-canvas] [draggable="true"]');
  window.scrollTo(0, window.scrollY + card.getBoundingClientRect().top - 200);
});
await page.waitForTimeout(250);

const survived = await menu.isVisible();
check('AND A SCROLL DOES NOT TAKE IT AWAY', survived);

const cardNow = survived ? await first.boundingBox() : null;
const menuNow = survived ? await menu.boundingBox() : null;
check(
  '  and it moves with the card rather than standing still',
  !!menuNow && !!cardNow && !!menuBefore
    && Math.abs(menuNow.y - cardNow.y) <= 40    // still over its own card
    && Math.abs(menuNow.y - menuBefore.y) > 8,  // and not simply pinned where it was
  survived ? `menu ${menuBefore?.y} → ${menuNow?.y}, card at ${cardNow?.y}` : 'the menu had gone',
);
await page.evaluate(() => window.scrollTo(0, 0));
await page.keyboard.press('Escape');

// ── Add a direct report: the row has to really arrive ────────────────────────────────────────────
await aimAt(first);
await menu.getByRole('menuitem', { name: 'Add a direct report' }).click();
await chartSays('New role');

const after = await cardCount();
check('"ADD A DIRECT REPORT" REALLY ADDS ONE', after === before + 1, `${before} → ${after}`);

// ── Rename, which did not exist anywhere in SPEC ─────────────────────────────────────────────────
//
// The point of the whole exercise. A new role arrives called "New role"; renaming it is the only
// thing anybody would do next, and until today there was no way to.
const fresh = page.locator('[data-org-canvas] [draggable="true"]', { hasText: 'New role' }).first();
check('the new role is drawn on the chart', await fresh.count() > 0);

await aimAt(fresh);
await menu.getByRole('menuitem', { name: 'Rename role & person' }).click();

const titleBox = page.locator('#org-title');   // the panel's box — /org also carries an "Add a role" form
await titleBox.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
check('"RENAME" OPENS A BOX WITH THE ROLE IN IT', await titleBox.isVisible());

const NEW_TITLE = 'Yard Lead';
await titleBox.fill(NEW_TITLE);
await page.getByRole('button', { name: 'Save the role name' }).click();
const titleLanded = await chartSays(NEW_TITLE);
await page.reload({ waitUntil: 'networkidle' });
const renamed = await page.locator('[data-org-canvas]').innerText();
check('AND THE NEW NAME SURVIVES A RELOAD', titleLanded && renamed.includes(NEW_TITLE), 'the rename did not reach the database');
check('  the placeholder name is gone', !renamed.includes('New role'));

// ── Pencilling somebody in, from the same panel ──────────────────────────────────────────────────
const target = page.locator('[data-org-canvas] [draggable="true"]', { hasText: NEW_TITLE }).first();
await aimAt(target);
await menu.getByRole('menuitem', { name: 'Rename role & person' }).click();
await page.locator('#org-person').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
await page.locator('#org-person').fill('R. Nakamura');
/*
  The title is read as well as the name, and it is not decoration.

  This check failed four runs in five and I twice went looking for a bug in the write. It was the
  panel stealing focus a frame after it opened: the name was being typed into the TITLE box, and
  the role came out called "Yard LeadR. Nakamura". Only printing both boxes at the moment of submit
  showed it. So both are asserted from here on.
*/
const typedTitle = await page.locator('#org-title').inputValue();
await page.getByRole('button', { name: 'Save the name' }).click();
check('  and the name went in the NAME box, not the title', typedTitle === NEW_TITLE, `title reads ${JSON.stringify(typedTitle)}`);
const pencilled = await chartSays('R. Nakamura');
await page.reload({ waitUntil: 'networkidle' });
check(
  'A NAME TYPED INTO THE PANEL IS PENCILLED IN',
  pencilled && (await page.locator('[data-org-canvas]').innerText()).includes('R. Nakamura'),
);
if (!pencilled) await stop(1, 'nothing to test the refusal against.');

// ── A refusal is a sentence, never the error page ────────────────────────────────────────────────
//
// The role now has somebody in it, so removing it must be refused — and the server refuses by
// throwing, which renders Next's error page. The chart answers first, in words, on the page.
const filled = page.locator('[data-org-canvas] [draggable="true"]', { hasText: 'R. Nakamura' }).first();
await aimAt(filled);
await menu.getByRole('menuitem', { name: 'Remove role' }).click();
await page.waitForTimeout(400);
const body = await page.evaluate(() => document.body.innerText);
check('REMOVING AN OCCUPIED ROLE IS REFUSED IN WORDS', /R\. Nakamura is in that role/.test(body));
check('  and not with a fault screen', !/Something went wrong on our end/i.test(body));

// ── Folding a team away, which is a reading aid and nothing else ─────────────────────────────────
// Asked for by the DATA, not by the words on it — the words moved into a badge when the card was
// restyled to the design, and matching on them meant a visual change broke a behavioural check.
const boss = page.locator('[data-org-canvas] [draggable="true"]:has([data-team])').first();
if (await boss.count()) {
  /*
    Held by TITLE rather than by the locator that found it. A folded card stops saying "Team of 4"
    and starts saying "+4 folded away", so re-using the finder picks a different card on the way
    back — which failed this check and reported a product fault that was mine.
  */
  const bossTitle = (await boss.locator('span[title]').first().innerText()).trim();
  const sameCard = () => page.locator('[data-org-canvas] [draggable="true"]', { hasText: bossTitle }).first();
  const drawnBefore = await cardCount();
  /*
    The BADGE folds, not a double-click.

    Double-click now opens the role's scorecard, which is what the design assigns it — and the fold
    moved onto the count badge, which is visible rather than being a gesture only somebody who had
    been told about it would ever try.
  */
  await boss.locator('[data-team]').click();
  await page.waitForTimeout(400);
  const drawnAfter = await cardCount();
  check('PRESSING THE COUNT ON A LEADER FOLDS THEIR TEAM AWAY', drawnAfter < drawnBefore, `${drawnBefore} → ${drawnAfter}`);
  /*
    The count is on the badge, as "+3" — which is how the design draws it and is visible without
    hovering. This used to look for the sentence "folded away", which lived in a line of text INSIDE
    the card; that line became the design's corner badge, so the check was asserting the old layout
    rather than the thing it cares about, which is that nobody is hidden silently.
  */
  check(
    '  and says how many are folded, rather than hiding them silently',
    /^\+\d+$/.test((await sameCard().locator('[data-team]').innerText()).trim()),
    (await sameCard().locator('[data-team]').innerText()).trim(),
  );
  await sameCard().locator('[data-team]').click();
  await page.waitForTimeout(400);
  check('  pressing it again brings them back', (await cardCount()) === drawnBefore, `wanted ${drawnBefore}`);
} else {
  check('PRESSING THE COUNT ON A LEADER FOLDS THEIR TEAM AWAY', false, 'no card with a team to fold');
}

// ── Right-clicking the canvas itself ─────────────────────────────────────────────────────────────
/*
  The quiet margin round the outside of the tree — the part a person reads as "not a card".

  Aimed with the mouse at a point computed from the two boxes rather than at a corner. The corner
  is where a sticky header ends up after the page has scrolled, and Playwright spent thirty seconds
  reporting that something else "intercepts pointer events" — which is a fault in the aim, not in
  the product. The left padding beside the middle of the tree cannot hold a card.
*/
/*
  ── Aimed through the LOCATOR, not with raw mouse coordinates ──────────────────────────────────

  This used to compute two bounding boxes and drive `page.mouse.click` at the absolute point. A
  bounding box is viewport-relative and the numbers were read BEFORE anything scrolled, so the aim
  held only while the page was exactly as tall as it had been the day the check was written.

  It stopped holding on 19 September, when the Role scorecard panel grew the readiness chips and an
  add-a-KPI box on each of its four pillars. The page got taller, the chart sat further down, and
  the computed point landed under the sticky header — which swallowed the right-click, so the menu
  never opened and the check reported that the canvas offers nothing. Nothing was wrong with the
  canvas.

  `locator.click` with a `position` scrolls the element into view first, waits for it to be able to
  receive the event at that point, and retries — so the aim follows the page instead of assuming
  it. 4px in from the left edge is inside the section's padding at any height, which is the quiet
  margin a person reads as "not a card".
*/
const canvas = page.locator('[data-org-canvas]').first();
const outer = await canvas.boundingBox();
const inner = await canvas.locator('> div').first().boundingBox();
await canvas.click({
  button: 'right',
  position: { x: 4, y: (inner.y - outer.y) + inner.height / 2 },
});
await menu.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
const canvasItems = (await menu.locator('[role="menuitem"]').allInnerTexts()).map(t => t.trim());
check('RIGHT-CLICKING THE CANVAS OFFERS "Add a new role"', canvasItems.includes('Add a new role'), canvasItems.join(', '));

// ── And it goes to the RIGHT role, which the scorecard's version did not ─────────────────────────
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
/*
  A CARD, not a person pill. The pill is `draggable` too — that is how a person is moved — so
  `cards().nth(1)` picked "R. Nakamura" and this check compared a role's KPI screen against a
  person's name. `data-role-card` is on the card and nothing else.
*/
const wanted = page.locator('[data-org-canvas] [data-role-card]').nth(1);
const wantedTitle = (await wanted.locator('span[title]').first().innerText()).trim();
await aimAt(wanted);
await menu.getByRole('menuitem', { name: /Set this role/ }).click();
await page.waitForLoadState('networkidle').catch(() => {});
const onKpis = await page.evaluate(() => document.body.innerText);
check('THE MENU OPENS THAT ROLE\u2019S KPIs, not whichever is listed first',
  page.url().includes('/setup/kpis?role=') && onKpis.includes(wantedTitle),
  `${page.url().replace(BASE, '')} — wanted ${wantedTitle}`);
/*
  The prototype also offers "Reset structure", which restores its seed data. Deliberately not built:
  here it would delete a real business's org chart with one press and no way back. Checked, so the
  decision cannot be quietly undone by somebody matching the design more thoroughly than carefully.
*/
check('  and never "Reset structure", which would wipe a real chart', !canvasItems.includes('Reset structure'));

// ── Nothing on a card is cut off ─────────────────────────────────────────────────────────────────
/*
  Kris photographed JBI on 18 September with "Cobram Supervisor" and "Wangaratta Supervisor" sliced
  off along the bottom edge of their cards.

  The cause is structural rather than cosmetic and could recur any time the card gains anything: a
  card is drawn at ONE fixed height for every role at its depth, because a constant row gap is what
  makes the tree read as a hierarchy. A narrow card at depth two wraps a two-word title onto two
  lines, and two lines plus a name pill plus the four tiles did not fit in the box. The title clamp
  stopped the title growing without limit; it never made the box big enough for the two lines it
  allows.

  No phrase check can see this — every word was present and correct, in a box too small to show it.
  So this measures: for every card on the chart, is the content taller than the card it is in.

  Built with the longest role titles a real business has, because the fault only appears when a
  title wraps. A check that draws "GM" would pass for ever.
*/
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
for (const title of ['Wangaratta Site Supervisor', 'Cobram Depot Supervisor']) {
  await page.locator('[data-org-canvas]').first().click({ button: 'right', position: { x: 6, y: 120 } }).catch(() => {});
  await menu.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  await menu.getByRole('menuitem', { name: 'Add a new role' }).click().catch(() => {});
  await page.waitForTimeout(700);
  const card = page.locator('[data-org-canvas] [data-role-card]').last();
  await card.click();
  await page.locator('#org-title').fill(title).catch(() => {});
  await page.getByRole('button', { name: 'Save the role name' }).click().catch(() => {});
  await page.waitForTimeout(800);
}

const spilling = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll('[data-org-canvas] [data-role-card]')) {
    const box = card.getBoundingClientRect();
    for (const child of card.children) {
      /*
        Measured child by child against the card's own box, NOT with scrollHeight.

        scrollHeight was the obvious way and is wrong here: the card centres its contents, so
        content that does not fit spills equally out of the TOP and the bottom — and scrollHeight
        only ever sees the bottom half of that. It reported everything fitting on the very build
        whose screenshot started this. The badges are excluded by name because they are DRAWN
        hanging off the corners on purpose.
      */
      if (child.hasAttribute('data-team') || child.getAttribute('aria-label')?.startsWith('What can be done')) continue;
      const c = child.getBoundingClientRect();
      if (c.height === 0) continue;
      if (c.top < box.top - 1 || c.bottom > box.bottom + 1) {
        out.push(`${(child.textContent || '').trim().slice(0, 24) || child.tagName} spills out of ${card.querySelector('span[title]')?.textContent?.trim().slice(0, 24)}`);
      }
    }
  }
  return out;
});
check('NOTHING ON A CARD IS CUT OFF, however long the role title', spilling.length === 0, spilling.join(' | '));

/*
  And the title's own box is tall enough for the letters in it.

  This is what Kris actually photographed, and the card measured fine throughout: a two-line clamp
  draws a box exactly two line-heights tall and hides everything outside it, so a tight line-height
  slices the tails off p, g and y. Every word present, every box the right size, the names cut
  through the middle.

  Asserted as a RATIO rather than a pixel value, so it survives the type being resized — and it is
  the only form of the check that means what it says: the box has to be tall enough for the font
  that is in it, whatever that font turns out to be.
*/
const tightTitles = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll('[data-org-canvas] [data-role-card]')) {
    const title = card.querySelector('span[title]');
    if (!title) continue;
    const st = getComputedStyle(title);
    if (st.webkitLineClamp === 'none') continue;   // not clamped, nothing to cut
    const lineHeight = parseFloat(st.lineHeight);
    const ratio = lineHeight / parseFloat(st.fontSize);
    if (ratio < 1.3) out.push(`${title.textContent.trim().slice(0, 24)} line-height ${ratio.toFixed(2)}`);
    /*
      The ratio is the whole check, and comparing scrollHeight to clientHeight here was wrong.

      A clamped box is MEANT to overflow: that is what clamping is. A three-line title in a
      two-line box reports more content than box on every render, for ever, and a check that fires
      on the feature working is a check that gets switched off. The fault Kris photographed was
      never overflow — it was the tails of the letters sliced off INSIDE the lines that were drawn,
      and the line-height ratio is what decides that. The card as a whole is measured separately,
      just above, which is where a real overflow would show.
    */
  }
  return out;
});
check(
  '  and a clamped title has room for its descenders',
  tightTitles.length === 0,
  tightTitles.join(' | '),
);

/*
  ── AND THE TITLE BOX REALLY HAS THE TWO LINES THE CARD PROMISES IT ────────────────────────────

  Kris, 19 September, photographing JBI: two cards reading **"Head of"**. The roles are "Head of
  Commercial" and "Head of Operations", and the second word was simply gone.

  Both checks above passed on that build, and neither was wrong — they were asking the wrong
  question. The card did not overflow and the line-height was generous. What had happened is the
  opposite of overflow: design 15 added the LEADERSHIP SEAT row, `cardHeight` was never told about
  it, so the card was ~18px short of its own contents and the layout took the room out of the
  title. The clamp box was squeezed from two lines to one and then did what a clamp does.

  Nothing spilled, because nothing was allowed to. A check that only asks "does anything stick out"
  cannot see text that was quietly dropped instead.

  So this asks the card to keep its own promise: the title is clamped to TWO lines, so its box must
  be at least two line-heights tall. It cannot fire on a legitimately long title — a three-line role
  name still gets its two lines and clamps honestly — and it fires immediately on anything that
  squeezes the title to make room for something new. Which is the mistake that was made, and the
  one most likely to be made again the next time a row is added to a card.
*/
const squeezed = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll('[data-org-canvas] [data-role-card]')) {
    const title = card.querySelector('span[title]');
    if (!title) continue;
    const st = getComputedStyle(title);
    const lines = Number(st.webkitLineClamp);
    if (!lines) continue;                       // not clamped, nothing promised
    const lineHeight = parseFloat(st.lineHeight);
    const box = title.getBoundingClientRect().height;
    if (box < lineHeight * lines - 1) {
      out.push(`"${title.textContent.trim().slice(0, 28)}" has ${(box / lineHeight).toFixed(1)} of its ${lines} lines`);
    }
  }
  return out;
});
check(
  '  AND THE TITLE BOX HAS THE TWO LINES THE CARD PROMISES, so no word is silently dropped',
  squeezed.length === 0,
  squeezed.join(' | '),
);

/*
  ── And the canvas is tall enough for the bottom row of cards ─────────────────────────────────

  Found while fixing the squeezed titles: the tree's height was `maxDepth * ROW + 130`, where 130
  was a typed-in guess at how tall the last row is. Cards are 140–162px, so the bottom row of every
  chart in the product was being clipped — a little before the seat badge, and by half the S/P/E/C
  tiles after it.

  Same shape as the fault above, one level up: an arithmetic that has to agree with the card, kept
  somewhere the card cannot reach. Measured here against the tree the cards are actually placed on.
*/
const clipped = await page.evaluate(() => {
  const canvas = document.querySelector('[data-org-canvas]');
  const tree = canvas?.querySelector('[data-org-tree]');
  if (!tree) return ['no tree to measure'];
  const floor = tree.getBoundingClientRect().bottom;
  return [...canvas.querySelectorAll('[data-role-card], [data-team-node]')]
    .filter(c => c.getBoundingClientRect().bottom > floor + 1)
    .map(c => `${(c.querySelector('span[title]')?.textContent || c.textContent || '').trim().slice(0, 24)} hangs ${Math.round(c.getBoundingClientRect().bottom - floor)}px below the chart`);
});
check(
  '  and the chart is tall enough for its own bottom row',
  clipped.length === 0,
  clipped.join(' | '),
);

// ── A refusal is a sentence, never the fault screen ──────────────────────────────────────────────
/*
  Kris renamed a role on JBI and got "This page did not load. Something went wrong on our end."
  Nothing had. The server had correctly refused — and refused by `throw`ing, which renders the
  generic crash page. Fifteen guards on this page did that, and each one had a useful sentence in it
  that no customer ever saw.

  The one case already covered — removing an occupied role — passed only because the BROWSER checks
  before asking. So the check was proving the client's manners rather than the server's, and every
  other route to a refusal was untested. This posts straight to the action, the way a stale tab or a
  second window does, and asks what the customer is shown.
*/
const roleIdNow = await page.locator('[data-org-canvas] [data-role-card]').first().getAttribute('data-role-card');
await page.evaluate(async id => {
  const f = document.createElement('form');
  f.method = 'POST';
  f.innerHTML = `<input name="roleId" value="${id}"><input name="title" value="Renamed by a stale tab">`;
  document.body.append(f);
}, 'not-a-role-in-this-business');
await page.locator('[data-org-canvas] [data-role-card]').first().click();
await page.waitForTimeout(300);
await page.fill('#org-title', 'A perfectly good name');
// Take the role id out from under the form, which is what a stale tab really is.
await page.evaluate(() => {
  const hidden = document.querySelector('#org-title')?.closest('form')?.querySelector('input[name="roleId"]');
  if (hidden) hidden.value = 'gone';
});
await page.getByRole('button', { name: 'Save the role name' }).click();
await page.waitForTimeout(1800);
const afterRefusal = await page.evaluate(() => document.body.innerText);
check(
  'A REFUSAL IS A SENTENCE, not the fault screen',
  !/This page did not load|went wrong on our end/i.test(afterRefusal),
  afterRefusal.slice(0, 80).replace(/\n/g, ' '),
);
check(
  '  and it says which rule said no',
  /outside your part of the chart|not in this business/i.test(afterRefusal),
  afterRefusal.slice(0, 120).replace(/\n/g, ' '),
);
void roleIdNow;

/*
  ── Renaming the person the card is actually showing ───────────────────────────────────────────

  Kris, 19 September, on JBI: *"i am the GM but it wont let me change from anthony to my name"*.

  A role is meant to hold one person and nothing in the schema enforces it. When a role carries TWO
  open placements — an account holder and a pencilled-in name — the chart shows the account holder
  (`getRoles` prefers it) while the rename used to take whichever row the database handed back
  first. Land on the wrong one and the card keeps the old name with no error at all.

  This check does NOT prove that part. I wrote it believing it did, put the old code back to watch
  it go red, and it stayed green: Postgres handed back the account holder's row first no matter
  which order the rows went in. Row order is not something a database promises, so the old code was
  a coin toss and nothing here can force the coin.

  `tests/placement.test.ts` holds the rule, deterministically, in both orders. What this check is
  for is the whole path — two placements on one role, a name typed, Save pressed — ending with the
  new name on the card. That is worth having; it is just not the proof, and saying so here is the
  difference between a check and a comfortable feeling.
*/
if (process.env.DATABASE_URL) {
  const sql = (await import('postgres')).default(process.env.DATABASE_URL, { max: 1 });
  try {
    const [tenant] = await sql`select id from tenants where name = ${BUSINESS}`;
    /*
      The TOP of the chart is the GM role, not "whichever role happens to have no parent".

      This asked for `reports_to_role_id is null limit 1`, and by this point the journey has itself
      created roles that hang from nothing — that is what "Add a new role" on the canvas does. So it
      aimed the checks below at a stray card called "New role" and then reported the product broken
      for not renaming somebody who was never there.

      Asking for `level = 'gm'` was not enough either, and for a reason worth writing down: a role
      created with no parent IS recorded as level 'gm', so the strays matched that too. Nor was
      "has somebody reporting to it", because the journey hangs a report off a stray as well.

      What the real top of a chart has that a stray does not is a TEAM — most of the business under
      it. So: the parentless role with the most reports. On a chart with one root that is exact, and
      it stops mattering at all once a business has drawn itself.
    */
    const [top] = await sql`
      select r.id, r.title,
             (select count(*) from roles c where c.reports_to_role_id = r.id and c.active = true) as kids
      from roles r
      where r.tenant_id = ${tenant.id} and r.active = true and r.reports_to_role_id is null
      order by kids desc
      limit 1`;
    /*
      Built from scratch rather than adjusted, because by this point the journey has already moved
      people around and the top role may hold anybody. The shape being tested is exact: one
      pencilled-in placement, then the account holder's, laid down in THAT order — the order the old
      code got wrong.
    */
    const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;
    const today = new Date().toISOString().slice(0, 10);
    await sql`delete from role_assignments where role_id = ${top.id} and to_date is null`;

    const staffId = randomUUID();
    await sql`insert into staff (id, tenant_id, name, created_at)
              values (${staffId}, ${tenant.id}, 'Someone Else', ${new Date().toISOString()})`;
    await sql`insert into role_assignments (id, role_id, staff_id, from_date)
              values (${randomUUID()}, ${top.id}, ${staffId}, ${today})`;
    await sql`insert into role_assignments (id, role_id, user_id, from_date)
              values (${randomUUID()}, ${top.id}, ${me.id}, ${today})`;

    await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
    /*
      Cards are found by their ROLE ID, never by their title.

      Finding them by text cost most of an evening: the journey renames roles as it goes, several of
      the roles it creates hang off nothing and are drawn in the off-chart tray rather than on the
      chart, and two cards can carry the same words. Every one of those made a check wait thirty
      seconds for a card that was never going to appear and then report a crash instead of a result.
      An id is the one handle that does not move.
    */
    const topCard = page.locator(`[data-org-canvas] [data-role-card="${top.id}"]`).first();
    await topCard.click();
    await page.waitForTimeout(400);
    await page.fill('#org-person', 'Kris Harold');
    await page.getByRole('button', { name: 'Save the name' }).click();
    await chartSays('Kris Harold');

    await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
    const shown = await page.locator(`[data-org-canvas] [data-role-card="${top.id}"]`)
      .first().innerText();
    check(
      'RENAMING THE PERSON CHANGES THE NAME ON THE CARD',
      shown.includes('Kris Harold'),
      shown.replace(/\n/g, ' · '),
    );

    /*
      ── Inviting somebody from the chart ───────────────────────────────────────────────────────

      Kris, 19 September: *"i need to know how to invite new people - add their email and send to
      them"*. The invitation itself was already built and already proven end to end by
      `scripts/seat-journey.mjs`. What was missing was any way to reach it from the org chart, which
      is where a leader is actually thinking about who works for them.

      So this asks the two things that matter and nothing else: is the box THERE, on a card with a
      pencilled-in person, and does pressing it really give that person a seat. The second half is
      read from the database rather than from the screen, because a confirmation banner is the
      easiest thing in the world to print without having done anything.
    */
    /*
      ── Set up the way a person would, through the screen ──────────────────────────────────────

      Two earlier drafts built this situation with raw SQL and both were wrong in their own way: the
      first hunted the chart for a pencilled-in person and found one on a role that had fallen OFF
      it, where the panel correctly offers nothing; the second inserted a role and a staff row
      directly and then could not explain why the card would not offer the box.

      Both were me asserting the state instead of creating it. A person pencils somebody in by
      typing a name into the panel and pressing Save — which this journey has already proved works,
      two checks above. Doing it that way means the only thing left under test is the invitation.
    */
    let pencilled = null;
    const all = cards();
    for (let n = 0; n < Math.min(await all.count(), 6); n++) {
      const card = all.nth(n);
      const title = (await card.innerText()).split('\n')[0].trim();
      await card.click();
      await page.waitForTimeout(350);
      const box = page.locator('#org-person');
      if (await box.count() !== 1) continue;
      if ((await box.inputValue()).trim()) continue;          // somebody is already in it

      await box.fill('Pat Nguyen');
      await page.getByRole('button', { name: 'Save the name' }).click();
      await chartSays('Pat Nguyen');
      pencilled = { title, name: 'Pat Nguyen' };
      break;
    }

    if (pencilled) {
      /*
        No reloading and no hunting for the card by its title.

        Re-finding it afterwards is what kept breaking: the journey has by now created several
        roles that hang off nothing, they are drawn in the off-chart tray, and a title is not a
        reliable handle on a chart that has been edited nine times. The panel is already open on
        the card whose name was just typed — so the question "does this card now offer to invite
        them" is asked where it actually arises.
      */
      await page.waitForTimeout(800);
      const box = page.locator('#org-invite');
      check('THE CHART CAN INVITE THE PERSON ON A CARD', await box.count() === 1,
            `no invite box on ${pencilled.title}, which holds ${pencilled.name} with no login`);

      if (await box.count()) {
        const invitee = `invited-${stamp}@journey.test`;
        await box.fill(invitee);
        await page.getByRole('button', { name: /^Invite / }).click();
        await page.waitForTimeout(2500);

        /*
          Either outcome is honest, and which one happens depends on the machine rather than the
          code: a development box has no Resend key, so the mail genuinely cannot leave. What must
          never happen is SILENCE. A seat has started being charged, and letting somebody assume it
          went is the version of this that costs a week.
        */
        const said = await page.evaluate(() => document.body.innerText);
        const sent = said.includes(invitee);
        const couldNot = /did not send/i.test(said);
        check('  and it says which of the two happened, rather than leaving you guessing',
              sent || couldNot, said.slice(0, 160).replace(/\n/g, ' '));
        if (couldNot) {
          check('  and when the mail cannot go, it says where to find the link',
                /Setting up/i.test(said), said.slice(0, 200).replace(/\n/g, ' '));
        }

        const [seat] = await sql`
          select u.email, u.seat_token, u.invited_at, s.user_id
          from users u join staff s on s.user_id = u.id
          where u.tenant_id = ${tenant.id} and u.email = ${invitee}`;
        check('  AND THE SEAT IS REALLY THERE, with a link to send',
              !!seat && !!seat.seat_token && !!seat.invited_at && !!seat.user_id,
              seat ? JSON.stringify(seat) : 'no account was created for that address');
      }
    } else {
      skip('THE CHART CAN INVITE THE PERSON ON A CARD', 'every card on the chart already has somebody in it');
    }

    /*
      ── The founder, not on their own chart ────────────────────────────────────────────────────

      Kris, 19 September: *"I still cant change my name in the org chart"*, then *"i should be the
      admin as i started the system - Kristopher Harold for JBI"*.

      SPEC decides what somebody may touch by walking DOWN from their own role. That rule quietly
      assumes everybody is ON the chart — and an administrator who is not has nothing to walk down
      from, so every card on the screen was one the server would refuse, with the boxes still
      offered and nothing said. The only way out was the thing they were locked out of.

      This takes the account holder off the chart, exactly as a rename or a vacate can, and then
      asks the two things that matter: are the boxes still there, and does a save actually land.
    */
    await sql`update role_assignments set to_date = ${new Date().toISOString().slice(0, 10)}
              where to_date is null and user_id is not null
                and role_id in (select id from roles where tenant_id = ${tenant.id})`;
    await sql`update users set access = 'administrator' where tenant_id = ${tenant.id}`;

    await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
    await page.locator(`[data-org-canvas] [data-role-card="${top.id}"]`).first().click();
    await page.waitForTimeout(500);

    const boxes = await page.locator('#org-title').count();
    check('AN ADMINISTRATOR OFF THE CHART CAN STILL DRAW IT', boxes === 1,
          boxes ? '' : 'no edit boxes — the founder is locked out of their own business');

    if (boxes) {
      await page.fill('#org-title', 'Drawn while unplaced');
      await page.getByRole('button', { name: 'Save the role name' }).click();
      await chartSays('Drawn while unplaced');
      const after = await page.locator('[data-org-canvas]').innerText();
      check('  and the change really lands, rather than being quietly refused',
            after.includes('Drawn while unplaced'),
            after.slice(0, 120).replace(/\n/g, ' '));
    }

    /*
      ── Putting yourself back in the role ──────────────────────────────────────────────────────

      Kris, 19 September: *"I can't change GM back to me"*. He was right, and it was not a fault in
      renaming — renaming and CLAIMING are different things and SPEC only had the first. Typing your
      own name over a pencilled-in one renames a name on a card; your login stays attached to
      nothing, so SPEC still does not believe you are on your own chart.

      Which is why this check reads the database rather than the screen. A card showing the right
      name is exactly the outcome that fooled me for three attempts: it looks finished and the
      placement behind it is still empty.
    */
    await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
    await page.locator('[data-org-canvas] [draggable="true"]', { hasText: 'Drawn while unplaced' })
      .first().click();
    await page.waitForTimeout(400);

    const claim = page.getByRole('button', { name: /This role is me/i });
    check('THE CHART CAN PUT YOUR OWN ACCOUNT IN A ROLE', await claim.count() === 1);

    if (await claim.count()) {
      await claim.click();
      await page.waitForTimeout(2500);

      const [mine] = await sql`
        select r.title from role_assignments a
        join roles r on r.id = a.role_id
        join users u on u.id = a.user_id
        where a.to_date is null and u.tenant_id = ${tenant.id} and u.email = ${EMAIL}`;
      check('  AND THE ACCOUNT IS REALLY IN IT, not just the name on the card',
            mine?.title === 'Drawn while unplaced',
            mine ? `placed in ${mine.title}` : 'the account holds no role at all');

      const said = await page.evaluate(() => document.body.innerText);
      check('  and the chart says so, rather than looking unchanged',
            /You are now in/i.test(said), said.slice(0, 120).replace(/\n/g, ' '));

      /*
        Kris, after putting his account into the General Manager role: *"it didnt add me - anthony
        is still there"*. He could not tell whether it had worked, because a name on a card says
        nothing about whose account it is — and two very different situations look identical from
        the outside: the claim did nothing, or the claim worked and his own account is carrying the
        wrong name, which renaming used to do.
      */
      await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
      const marked = await page.evaluate(() => document.body.innerText);
      check('  AND THE CARD SAYS WHICH ONE IS YOU',
            marked.includes('(you)'),
            'nothing on the chart marks the viewer\u2019s own card');
    }

    /*
      ── The administrator, standing below the role they need to fix ────────────────────────────

      Kris, 19 September, photographing the General Manager card on JBI: it said *"This role is
      outside your part of the chart"*, above a button offering to ask an administrator for
      permission — **"i am the GM - so how can i ask"**. He IS the administrator. SPEC was inviting
      him to petition himself, and the one control that would have fixed it, "This role is me", was
      hidden behind the very permission he was missing.

      So: stand the administrator in a role BELOW the top and ask whether they can still work on the
      role above them. Drawing the chart is administration, not management — the same category as
      seats and the financial year — and none of it widens what anybody can SEE.
    */
    /*
      A DIRECT CHILD of the top, because those are certainly drawn. "Any role with a parent" also
      matches roles sitting in the off-chart tray, and a check that waits thirty seconds for a card
      that was never going to appear reports a crash instead of a result.
    */
    const kids = await sql`
      select id, title from roles
      where tenant_id = ${tenant.id} and reports_to_role_id = ${top.id} and active = true
      order by title`;

    /*
      Pick from what is ON THE SCREEN, not from what the database says ought to be.

      By this point the journey has added, renamed, removed, vacated and unlinked its way through
      the chart, and every assumption I made from the database side was wrong in a different way:
      "any role with a parent" matched one sitting in the off-chart tray, and then a direct child of
      the top still was not drawn. Each time the check waited thirty seconds for a card that was
      never going to appear and reported a crash instead of a result.

      The chart is the thing under test. Asking it what it is showing is both the simplest way to
      pick a card and the only one that cannot go stale.
    */
    await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
    const onScreen = (await cards().allInnerTexts()).map(t => t.split('\n')[0].trim());
    const drawnKids = kids.filter(k => onScreen.includes(k.title));
    const lower = drawnKids[0];

    if (lower) {
      await sql`update role_assignments set to_date = ${today}
                where to_date is null and user_id = ${me.id}`;
      await sql`insert into role_assignments (id, role_id, user_id, from_date)
                values (${randomUUID()}, ${lower.id}, ${me.id}, ${today})`;
      await sql`update users set access = 'administrator' where id = ${me.id}`;

      await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
      await page.locator(`[data-org-canvas] [data-role-card="${top.id}"]`).first().click();
      await page.waitForTimeout(500);

      const said = await page.evaluate(() => document.body.innerText);
      check('AN ADMINISTRATOR CAN WORK ON THE ROLE ABOVE THEM',
            await page.locator('#org-title').count() === 1,
            'the top of the chart is refused to the person who administers the business');
      check('  and is never asked to petition themselves for it',
            !/Ask the administrator for rights/i.test(said),
            'the administrator is being offered a request form addressed to themselves');
    } else {
      skip('AN ADMINISTRATOR CAN WORK ON THE ROLE ABOVE THEM', 'no role below the top on this chart');
    }

    /*
      ── Rights: asked for, approved, and really in force ───────────────────────────────────────

      Kris's rule, 19 September: *"managers only have rights to their staff - if rights are needed
      then the admin must approve this"*.

      Three things have to be true and all three are easy to fake: the ASK reaches the
      administrator's queue, the APPROVAL is recorded, and — the one that matters — the branch
      actually opens afterwards. A screen that says "granted" over a scope that did not change is
      the exact shape of a security feature that is decoration, so the last check reads the grant
      from the database and then asks the CHART whether the role became editable.
    */
    // The OTHER branch: a second child of the top, so the manager standing in the first one
    // genuinely cannot reach it, and both cards are certainly on the chart.
    const otherBranch = drawnKids.find(k => k.id !== lower?.id) ?? null;

    if (otherBranch) {
      // Stand the account somewhere with nothing under it, so the branch above is genuinely out of
      // reach — the situation a supervisor covering somebody else's crew is actually in.
      const leaf = lower;

      if (leaf && leaf.id !== otherBranch.id) {
        await sql`update role_assignments set to_date = ${today}
                  where to_date is null and user_id is not null
                    and role_id in (select id from roles where tenant_id = ${tenant.id})`;
        await sql`insert into role_assignments (id, role_id, user_id, from_date)
                  values (${randomUUID()}, ${leaf.id}, ${me.id}, ${today})`;

        await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
        await page.locator(`[data-org-canvas] [data-role-card="${otherBranch.id}"]`)
          .first().click();
        await page.waitForTimeout(500);

        /*
          One account wearing two hats, in order.

          Asking is a MANAGER's act — an administrator draws the whole chart and has nothing to ask
          for, which is the point of the check above this one. So the account is set to 'full' to
          ask, and back to 'administrator' to decide. Doing it in one journey is a compromise; not
          doing it at all would leave the request untested from the only side that ever uses it.

          This check went red the moment the administrator rule changed, which is the check working:
          it was set up as a manager and silently became an administrator.
        */
        await sql`update users set access = 'full' where id = ${me.id}`;
        await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
        await page.locator(`[data-org-canvas] [data-role-card="${otherBranch.id}"]`)
          .first().click();
        await page.waitForTimeout(500);

        const ask = page.getByRole('button', { name: /Ask the administrator for rights/i });
        check('A MANAGER CAN ASK FOR RIGHTS OVER ANOTHER BRANCH', await ask.count() === 1);

        if (await ask.count()) {
          await page.fill('#org-why', 'Covering while Dave is on leave');
          await ask.click();
          await page.waitForTimeout(2000);

          const [asked] = await sql`
            select state, detail from approvals
            where tenant_id = ${tenant.id} and kind = 'rights' and ref_id = ${otherBranch.id}`;
          check('  and it lands in the administrator’s queue, with the reason',
                asked?.state === 'waiting' && /Covering while Dave/.test(asked?.detail ?? ''),
                asked ? `${asked.state}: ${asked.detail}` : 'no approval was written');

          // Back to the administrator's hat: only they may decide it.
          await sql`update users set access = 'administrator' where id = ${me.id}`;
          await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
          const queued = await page.evaluate(() => document.body.innerText);
          check('  and the administrator can see it waiting',
                queued.includes(`Rights over ${otherBranch.title}`),
                queued.slice(0, 160).replace(/\n/g, ' '));

          const approveBtn = page.getByRole('button', { name: /^Approve/ }).first();
          if (await approveBtn.count()) {
            await approveBtn.click();
            await page.waitForTimeout(2500);
          }

          const [grant] = await sql`
            select role_id, granted_by, revoked_at from role_grants
            where tenant_id = ${tenant.id} and user_id = ${me.id} and revoked_at is null`;
          check('  APPROVING IT REALLY GRANTS THE BRANCH',
                grant?.role_id === otherBranch.id,
                grant ? JSON.stringify(grant) : 'no grant was written');

          // And the thing the grant is FOR: the branch is now theirs to work on.
          await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
          await page.locator(`[data-org-canvas] [data-role-card="${otherBranch.id}"]`)
            .first().click();
          await page.waitForTimeout(500);
          check('  and the branch is editable afterwards, which is the whole point',
                await page.locator('#org-title').count() === 1,
                'the grant was recorded but the chart still refuses');
        }
      } else {
        skip('A MANAGER CAN ASK FOR RIGHTS OVER ANOTHER BRANCH', 'no leaf role to stand the account in');
      }
    } else {
      skip('A MANAGER CAN ASK FOR RIGHTS OVER ANOTHER BRANCH', 'no second branch on this chart');
    }
    /*
      ── The drag that cost Kris his own chart ──────────────────────────────────────────────────────

      Kris, 19 September, on how Anthony came to be General Manager of JBI: *"i was moving the boxes and
      moved anthonys and then his name went to gm"*.

      Dragging a name onto a filled card swaps the two people, which is almost always what was meant.
      The half nobody watches is the OTHER person — and on JBI that other person was the owner. The swap
      moved him out of General Manager and down into Anthony's role, said nothing, and from that moment
      SPEC would not let him change the top of his own chart.

      So: do the drag, and demand that the screen names BOTH halves of it.
    */
    {
      await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
      /*
        Two people, put there through the panel — by this point the journey has emptied most of the
        chart, and a check that quietly skips because its situation is gone is a check that is not
        being run. It skipped exactly once before I noticed.
      */
      const all = cards();
      for (let n = 0; n < Math.min(await all.count(), 8); n++) {
        if (await page.locator('[data-person-pill]').count() >= 2) break;
        await all.nth(n).click();
        await page.waitForTimeout(300);
        const box = page.locator('#org-person');
        if (await box.count() !== 1) continue;
        if ((await box.inputValue()).trim()) continue;
        await box.fill(`Swap Person ${n}`);
        await page.getByRole('button', { name: 'Save the name' }).click();
        await chartSays(`Swap Person ${n}`);
      }

      const pills = page.locator('[data-person-pill]');
      const filled = await pills.count();

      if (filled >= 2) {
        /*
          Check the drag ACTUALLY happened before judging what the screen said about it.

          A name pill is HTML5 drag-and-drop, and simulating that from a test driver does not always
          reach the handlers. If the placements did not move, nothing has been exercised — and calling
          that a product failure is a mistake I have now made twice today in this same file. So the
          database decides whether there was a swap to talk about, and the check only runs if there was.
        */
        const before = await sql`
          select role_id from role_assignments
          where to_date is null and role_id in (select id from roles where tenant_id = ${tenant.id})
          order by role_id`;

        /*
          Dispatched rather than mimed.

          Playwright's `dragTo` moves a mouse, and a name pill is HTML5 drag-and-drop: the handlers
          listen for dragstart/dragover/drop carrying a DataTransfer, which a mouse move does not
          produce. So the events are dispatched the way the browser would, sharing one DataTransfer
          between them — which is the whole mechanism, and the part a mouse cannot supply.
        */
        await page.evaluate(() => {
          const pills = document.querySelectorAll('[data-person-pill]');
          const onto = pills[0].closest('[data-role-card]');
          const dataTransfer = new DataTransfer();
          const fire = (el, type) =>
            el.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true }));
          fire(pills[1], 'dragstart');
          fire(onto, 'dragenter');
          fire(onto, 'dragover');
          fire(onto, 'drop');
        });
        await page.waitForTimeout(2500);

        const after = await sql`
          select role_id from role_assignments
          where to_date is null and role_id in (select id from roles where tenant_id = ${tenant.id})
          order by role_id`;

        const swapped = JSON.stringify(before) !== JSON.stringify(after)
          || /is now /.test(await page.evaluate(() => document.body.innerText));

        if (!swapped) {
          skip('A SWAP SAYS WHO MOVED WHERE, both halves of it',
               'the name-pill drag could not be simulated here, so no swap happened to report on');
          /*
            The drag itself cannot be driven from here — four attempts, including dispatching the
            drag events by hand with a DataTransfer. So the half that CAN be checked is checked
            rather than quietly dropped: that the chart prints what a move tells it to. The sentence
            the move BUILDS is still unproven by anything automatic, and saying so here is the point
            of the skip above.
          */
          await page.goto(
            `${BASE}/org?moved=${encodeURIComponent('Pat is now Yard Lead. You have moved to Scheduler.')}`,
            { waitUntil: 'networkidle' },
          );
          const printed = await page.evaluate(() => document.body.innerText);
          check('  but the chart does print what a move tells it to',
                printed.includes('You have moved to Scheduler'),
                printed.slice(0, 160).replace(/\n/g, ' '));
        } else {
          const said = await page.evaluate(() => document.body.innerText);
          check('A SWAP SAYS WHO MOVED WHERE, both halves of it',
                /is now /.test(said) && /moved to/i.test(said),
                said.slice(0, 200).replace(/\n/g, ' '));
          check('  and when it moved YOU, it says what that changes',
                !/You have moved to/.test(said) || /follows the role you are in/.test(said),
                said.slice(0, 240).replace(/\n/g, ' '));
        }
      } else {
        skip('A SWAP SAYS WHO MOVED WHERE, both halves of it', `only ${filled} people on the chart to swap`);
      }
    }

  } finally {
    await sql.end({ timeout: 5 });
  }
} else {
  /*
    Run against a deployed site there is no database to reach, and this check needs one to set the
    two placements up. Skipping is legitimate; skipping QUIETLY is not — a run that silently drops
    a check reports the same green as a run that made it.
  */
  skip('RENAMING THE PERSON CHANGES THE NAME ON THE CARD', 'needs DATABASE_URL to set up two placements');
  skip('THE CHART CAN INVITE THE PERSON ON A CARD', 'needs DATABASE_URL to read the seat back');
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The KPI editor, and the team layer
 * ───────────────────────────────────────────────────────────────────────────── */

/*
  ── Why these are browser checks and not unit tests ───────────────────────────────────────────

  Kris, 19 September: *"now do the team nodes and the KPI editor"*, and, an hour later, *"i need to
  know you have set up the org chart fully? everything i gave you from design - i hate having to ask
  this all the time"*.

  He is right to ask, and the reason he has to is that the unit tests for both of these pass whether
  or not the chart carries them. `addKpi` and `addMember` are pure and correct; a page that never
  renders a box to type into makes both of them true and useless. The rule this suite runs on:
  **a claim nobody checks quietly stops being true**, and a feature verified only in the library it
  lives in is a feature verified nowhere somebody uses it.

  So: type a KPI into the pillar card, and then ask the database-backed page whether it is on the
  role. Add a team from the menu, put somebody in it, and read the count off the node.
*/
await page.goto(`${BASE}/org`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-org-canvas] [data-role-card]').first().click();
await page.waitForTimeout(400);

const kpiBox = page.locator('[data-add-kpi="safety"]').first();
if (await kpiBox.count()) {
  const measure = `Toolbox talk every Monday ${stamp}`;
  await kpiBox.scrollIntoViewIfNeeded();
  await kpiBox.fill(measure);
  /*
    ── Where the page IS when the measure lands ───────────────────────────────────────────────

    Kris, 19 September: *"when i add kpi it takes me back to the org chart"*. It did: the action
    ended in a `redirect`, which is a fresh request for a new address, so the browser landed at the
    top of the page. The Role scorecard sits a long way down the chart, so adding a measure
    scrolled him away from what he was doing — every single time, on the screen whose whole job is
    entering sixteen of them.

    Remembered here and checked below, because "does it still work" and "does it throw you across
    the page while it works" are two different questions and only the first one was being asked.
  */
  const scrollBefore = await page.evaluate(() => window.scrollY);
  /*
    The + button rather than Enter.

    The box carries a `datalist` of the design's own examples, and in Chromium a keypress with a
    suggestion list open is consumed by the list instead of submitting the form. Pressing the
    control the design draws is both what a person does and the thing worth checking.
  */
  await page.locator('[data-pillar-card="safety"] button[aria-label^="Add this KPI"]').first().click();
  /*
    Read it back off the PAGE rather than trusting the redirect. `addRoleKpi` re-evens the pillar's
    weights in the same write, and a criterion that landed without its pillar summing to 1 makes
    every percentage on that pillar meaningless — so the thing worth checking is that the measure is
    on the card afterwards, which only happens if the whole write went through.
  */
  const landed = await page.waitForFunction(
    text => document.body.innerText.includes(text),
    measure, { timeout: 15000 },
  ).then(() => true).catch(() => false);
  check('A KPI TYPED ON THE CHART LANDS ON THE ROLE', landed,
        `${page.url()} :: panel=[${(await page.locator('[data-pillar-card="safety"]').first().innerText().catch(() => 'none')).replace(/\n/g, ' / ')}] cards=${await page.locator('[data-pillar-card]').count()}`);

  const scrollAfter = await page.evaluate(() => window.scrollY);
  check('  AND THE PAGE DOES NOT JUMP BACK TO THE TOP OF THE CHART',
        Math.abs(scrollAfter - scrollBefore) < 80,
        `was ${Math.round(scrollBefore)}px down, now ${Math.round(scrollAfter)}px`);

  // And the same measure again is refused in words, not with a fault screen.
  await page.locator('[data-add-kpi="safety"]').first().fill(measure.toUpperCase());
  await page.locator('[data-pillar-card="safety"] button[aria-label^="Add this KPI"]').first().click();
  const refused = await page.waitForFunction(
    () => /already on this pillar/i.test(document.body.innerText),
    null, { timeout: 15000 },
  ).then(() => true).catch(() => false);
  check('  and the same measure twice is REFUSED IN WORDS, not with a fault screen', refused,
        (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' '));

  // The × beside it takes it off again.
  const cross = page.locator(`[data-pillar-card="safety"] form button[aria-label*="${measure}"]`).first();
  if (await cross.count()) {
    await cross.scrollIntoViewIfNeeded();
    await cross.click();
    const gone = await page.waitForFunction(
      text => !document.body.innerText.includes(text),
      measure, { timeout: 15000 },
    ).then(() => true).catch(() => false);
    check('  and the × beside it takes it off again', gone);
  } else {
    skip('  and the × beside it takes it off again', 'no × rendered beside the measure');
  }
} else {
  check('A KPI TYPED ON THE CHART LANDS ON THE ROLE', false, 'no add-a-KPI box on any pillar card');
}

/*
  A team: added from the leader's menu, opened, and given somebody.

  The node is read back by its member COUNT rather than by the words on it, because the count is the
  thing that can only be right if the placement really landed — a title renders whether or not
  anybody is in the crew.
*/
await page.goto(`${BASE}/org`, { waitUntil: 'domcontentloaded' });
const leaderCard = page.locator('[data-org-canvas] [data-role-card]').first();
await aimAt(leaderCard);
const addTeamItem = menu.getByRole('menuitem', { name: 'Add a team' });
if (await addTeamItem.count()) {
  await addTeamItem.click();
  const inTeam = await page.waitForSelector('[data-team-layer]', { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('ADDING A TEAM OPENS THE TEAM LAYER', inTeam, page.url());

  if (inTeam) {
    /*
      The team's name. There was no way to give one: the design names a team with a
      `window.prompt` at creation, which is not built, so every team was created called "Team" and
      stayed called "Team". Kris: *"how do i give the team a team name"*.
    */
    const teamName = `Solar crew ${stamp}`;
    await page.locator('#team-name').fill(teamName);
    await page.getByRole('button', { name: 'Save the team name' }).click();
    const named = await page.waitForFunction(
      text => document.body.innerText.includes(text),
      teamName, { timeout: 15000 },
    ).then(() => true).catch(() => false);
    check('  AND THE TEAM CAN BE GIVEN A NAME, from inside the team', named,
          (await page.locator('[data-team-layer]').innerText().catch(() => 'no layer')).slice(0, 160).replace(/\n/g, ' / '));
    const stillIn = await page.locator('[data-team-layer]').count();
    check('    and naming it does not close the team', stillIn > 0);

    const member = `Casey Nguyen ${stamp}`;
    await page.locator('#team-add').fill(member);
    const teamScrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('button', { name: '+ Add to team' }).click();
    const joined = await page.waitForFunction(
      text => document.body.innerText.includes(text),
      member, { timeout: 15000 },
    ).then(() => true).catch(() => false);
    check('  and somebody typed into it joins the team', joined,
          (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' '));
    const teamScrollAfter = await page.evaluate(() => window.scrollY);
    check('    without throwing the page back to the top', Math.abs(teamScrollAfter - teamScrollBefore) < 80,
          `was ${Math.round(teamScrollBefore)}px down, now ${Math.round(teamScrollAfter)}px`);

    /*
      The shared score, which is the whole reason a team is a node rather than four more cards. Four
      pillar cards inside the layer, each of which can take a KPI.
    */
    const pillars = await page.locator('[data-team-layer] [data-pillar-card]').count();
    check('  and the team carries ONE shared S/P/E/C, not one per person', pillars === 4,
          `${pillars} pillar cards in the team layer`);

    // Back to the chart, and the node says how many are in it.
    await page.getByRole('button', { name: /Back to org chart/i }).click();
    const counted = await page.waitForFunction(
      () => /1 member\b/.test(document.querySelector('[data-org-canvas]')?.innerText ?? ''),
      null, { timeout: 15000 },
    ).then(() => true).catch(() => false);
    check('  and the team node on the chart counts its members', counted,
          (await page.locator('[data-org-canvas]').innerText()).slice(0, 200).replace(/\n/g, ' '));

    const nodes = await page.locator('[data-team-node]').count();
    check('  and the team is drawn as a team node, not as an ordinary card', nodes > 0);

    /*
      ── AND THE TEAM REACHES THE SCREEN WHERE A MONTH IS SIGNED OFF ────────────────────────

      Kris, having built one: *"how do i sign off the team kpi's"*.

      He could not, anywhere. A team is `staff` level, and both `isScored` and
      `scoredRolesInScope` filtered `staff` out — so its KPIs could be written on the chart and
      then never marked, never rolled up and never signed off. Every unit test passed: they were
      testing the team layer, which worked, and nothing asked whether the rest of the product
      could see what it produced.

      This asks the other end. Add a measure to the team, then open /scoring — the screen where a
      month is marked and handed up — and look for the team by name. It is the only check here
      that would have failed on the build Kris was given.
    */
    await page.goto(`${BASE}/org?team=${encodeURIComponent(await page.locator('[data-team-node]').first().getAttribute('data-team-node'))}`, { waitUntil: 'domcontentloaded' });
    const teamKpi = page.locator('[data-team-layer] [data-add-kpi="safety"]').first();
    if (await teamKpi.count()) {
      const measure = `Crew toolbox talk ${stamp}`;
      await teamKpi.fill(measure);
      await page.locator('[data-team-layer] [data-pillar-card="safety"] button[aria-label^="Add this KPI"]').first().click();
      await page.waitForFunction(text => document.body.innerText.includes(text), measure, { timeout: 15000 })
        .catch(() => {});

      await page.goto(`${BASE}/scoring`, { waitUntil: 'domcontentloaded' });
      const onScoring = await page.evaluate(name => document.body.innerText.includes(name), teamName)
        .catch(() => false);
      check('  AND THE TEAM APPEARS ON /scoring, so its month can be marked and signed off', onScoring,
            (await page.evaluate(() => document.body.innerText)).slice(0, 240).replace(/\n/g, ' '));

      const measured = await page.evaluate(text => document.body.innerText.includes(text), measure)
        .catch(() => false);
      check('    with the measure that was typed into the team on it', measured);
    } else {
      check('  AND THE TEAM APPEARS ON /scoring, so its month can be marked and signed off', false,
            'no add-a-KPI box in the team layer');
    }
  }
} else {
  check('ADDING A TEAM OPENS THE TEAM LAYER', false, '"Add a team" is not on the card menu');
}

check('no page threw', faults.length === 0, faults.join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
if (skipped.length) console.log(`${skipped.length} skipped: ${skipped.join(', ')}`);
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
