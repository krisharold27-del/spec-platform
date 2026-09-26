/**
 * Mirrors, driven in a real browser — asked for, changed, undone, and the sealed frame.
 *
 * ── Why this one exists ──────────────────────────────────────────────────────────────────────────
 *
 * Kris, 26 September, after three days of being told things were finished: *"no confirm the
 * mirrors."* Fair. Everything in this feature had unit tests and none of them had ever opened it.
 *
 * Doing that immediately found what no unit test could: the page was blank for every business,
 * because the local database had no `body` or `runnable` column. In the repo that is a missing
 * migration; the same class of fault in production is a page that simply does not load. Tests pass
 * against functions, and a business uses a page.
 *
 * ── The part worth driving rather than asserting ─────────────────────────────────────────────────
 *
 * `tests/runnable.test.ts` checks that the sandbox is spelled `allow-scripts` and the policy says
 * `default-src 'none'`. That is a check on a STRING. Whether a browser then actually withholds the
 * origin, the parent document, the cookie, local storage and the network is a question only a
 * browser can answer.
 *
 * So the tool reports on ITSELF, from inside the frame, and this reads the answer off the page.
 * The first version of that probe picked the frame with `frame.name() === ''` — which matches the
 * MAIN PAGE — and duly reported SPEC's own cookie as though the sandbox had failed. The frame is
 * taken from its element, never by name.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npx next dev -p 3100 &
 *   node scripts/mirrors-journey.mjs http://127.0.0.1:3100
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const stamp = Date.now();
const BUSINESS = `Mirrors Test ${stamp}`;

let pass = 0, fail = 0, skipped = 0;
const check = (what, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(` FAIL  ${what}${detail ? ` — ${detail}` : ''}`); }
};
const skip = (what, why) => { skipped++; console.log(`  --   ${what} (${why})`); };

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const sql = process.env.DATABASE_URL
  ? (await import('postgres')).default(process.env.DATABASE_URL, { max: 1 })
  : null;

try {
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'Kris Harold');
  await page.fill('input[name="business"]', BUSINESS);
  await page.fill('input[name="email"]', `mirrors-${stamp}@journey.test`);
  await page.fill('input[name="password"]', 'a-good-password-123');
  await page.check('input[name="consent"]');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  if (page.url().includes('/signup')) {
    console.log('  --   could not sign up; nothing else can be checked.');
    process.exit(1);
  }

  /* ── The box at the top ──────────────────────────────────────────────────────────────────── */
  await page.goto(`${BASE}/mirrors`, { waitUntil: 'networkidle' });
  const asked = page.locator('[data-ask-for-mirror]');
  check('THE ASK BOX IS AT THE TOP OF MIRRORS', await asked.count() === 1,
        'the page may be erroring — a missing column renders it blank');
  if (await asked.count() !== 1) throw new Error('no ask box');

  check('  and it says what it will not draft, where somebody is typing',
        /Live data/.test(await asked.innerText()));

  /* ── Asking for one ──────────────────────────────────────────────────────────────────────── */
  await page.fill('[data-ask-for-mirror] textarea[name="ask"]', 'a pre-start checklist for switchboard work');
  await page.click('[data-ask-for-mirror] button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  check('ASKING IN PLAIN WORDS PRODUCES A MIRROR', /[?&]board=/.test(page.url()), page.url());
  const boardId = new URL(page.url()).searchParams.get('board');
  const body = await page.locator('body').innerText();
  check('  named from what was actually asked for', /pre-start/i.test(body));
  check('  and the request is kept on it, so "where did this come from" has an answer',
        /Drafted from/i.test(body));

  /* ── Changing it by talking ──────────────────────────────────────────────────────────────── */
  check('IT CAN BE CHANGED BY SAYING WHAT TO CHANGE', await page.locator('[data-change-mirror]').count() === 1);
  await page.locator('[data-change-mirror] summary').click();
  await page.fill('[data-change-mirror] textarea[name="ask"]', 'add a step about isolating the board first');
  await page.click('[data-change-mirror] button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  check('  and the change is applied, or refused in as many words',
        /changed=1|removed=|nochange=1/.test(page.url()), page.url());

  /* ── The sealed frame, reported by the tool itself ───────────────────────────────────────── */
  if (!sql) {
    skip('A RUNNABLE MIRROR IS SEALED OFF', 'no DATABASE_URL to seed one with');
  } else {
    const [tenant] = await sql`select id from tenants where name = ${BUSINESS}`;
    const id = randomUUID();
    const now = new Date().toISOString();
    /* It answers the five questions about itself. Read off the page rather than probed, so a
       mistake in the probe cannot quietly report a sandbox that is not there. */
    const tool = `<pre id=out>running…</pre><script>
const r = [];
try { r.push('origin=' + location.origin); } catch (e) { r.push('origin=THREW'); }
try { r.push('parent=' + (window.parent.document ? 'VISIBLE' : 'no')); } catch (e) { r.push('parent=BLOCKED'); }
try { r.push('cookie=' + (document.cookie || 'EMPTY')); } catch (e) { r.push('cookie=THREW'); }
try { r.push('storage=' + (localStorage ? 'VISIBLE' : 'no')); } catch (e) { r.push('storage=BLOCKED'); }
fetch('/api/export').then(() => r.push('fetch=ALLOWED')).catch(() => r.push('fetch=BLOCKED'))
  .finally(() => { out.textContent = r.join('|'); });
</script>`;
    await sql`insert into boards (id, tenant_id, title, summary, kind, live, feeds, rows, steps, body, runnable, created_by, created_at, updated_at)
              values (${id}, ${tenant.id}, 'Sealed?', 'It reports on itself.', 'training', false, '[]','[]','[]',
                      '## A tool', ${tool}, 'journey', ${now}, ${now})`;

    await page.goto(`${BASE}/mirrors?board=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const frameEl = await page.locator('[data-mirror-runs] iframe').elementHandle();
    check('A RUNNABLE MIRROR DRAWS ITS FRAME', !!frameEl);
    if (frameEl) {
      check('  sandboxed with allow-scripts and nothing else',
            await page.locator('[data-mirror-runs] iframe').getAttribute('sandbox') === 'allow-scripts');
      check('  handed over as srcdoc, so nothing is served from SPEC’s own origin',
            !(await page.locator('[data-mirror-runs] iframe').getAttribute('src')));

      /* By its element. `frame.name() === ''` matches the MAIN page, which is how the first
         version of this read SPEC's own cookie and called the sandbox broken. */
      const frame = await frameEl.contentFrame();
      const said = await frame.locator('#out').innerText();

      check('  IT RUNS WITH AN OPAQUE ORIGIN, not SPEC’s', /origin=null|origin=THREW/.test(said), said);
      check('  IT CANNOT SEE THE PARENT PAGE', /parent=BLOCKED/.test(said), said);
      check('  IT HOLDS NO SESSION COOKIE', /cookie=EMPTY|cookie=THREW/.test(said), said);
      check('  IT CANNOT REACH LOCAL STORAGE', /storage=BLOCKED/.test(said), said);
      check('  AND IT CANNOT CALL BACK INTO SPEC', /fetch=BLOCKED/.test(said), said);
    }

    /* ── The undo really restores ─────────────────────────────────────────────────────────── */
    await sql`insert into board_versions (id, tenant_id, board_id, title, summary, body, runnable, steps, asked_for, changed_by, changed_at)
              values (${randomUUID()}, ${tenant.id}, ${id}, 'The older name', 'Older.', '', '', '[]', 'a journey', 'journey', ${now})`;
    await page.goto(`${BASE}/mirrors?board=${id}&removed=1`, { waitUntil: 'networkidle' });
    check('THE UNDO IS OFFERED WHEN A CHANGE TOOK STEPS OUT',
          await page.locator('[data-removed-warning]').count() === 1);
    await page.locator('[data-removed-warning] button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const [after] = await sql`select title from boards where id = ${id}`;
    check('  AND PUTTING IT BACK REALLY PUTS IT BACK', after.title === 'The older name', after.title);
  }
} finally {
  /* The shared clean-up, not a delete of my own: it knows about every table a signed-up business
     touches, and `tests/test-cleanup.test.ts` holds every journey to using it. A journey that
     leaves a business behind fills the database one run at a time. */
  if (sql) await sql.end();
  await tidyUp(BUSINESS).catch(() => {});
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
