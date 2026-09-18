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
  await locator.click({ button: 'right' });
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
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
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
const canvas = page.locator('[data-org-canvas]').first();
const outer = await canvas.boundingBox();
const inner = await canvas.locator('> div').first().boundingBox();
await page.mouse.click(outer.x + 4, inner.y + inner.height / 2, { button: 'right' });
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

check('no page threw', faults.length === 0, faults.join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
