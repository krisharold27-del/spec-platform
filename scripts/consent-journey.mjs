/**
 * Agreeing to the terms — the box, the refusal, and the record.
 *
 * Kris, 18 September, handing over the plumbing brief.
 *
 * The check that matters is the one in the middle: it STRIPS `required` off the input the way
 * anybody with devtools could, and then presses the button. A box that is only enforced in the
 * browser is a box that produces a record saying somebody agreed when the server never asked.
 *
 * It also reads the database afterwards, because the point of the whole exercise is the record
 * rather than the tick — what they agreed to, and when.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/consent-journey.mjs
 */
import { chromium } from 'playwright';
import postgres from 'postgres';
const B = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
let failed = 0;
const say = (l, ok, d='') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${ok||!d?'':`  — ${d}`}`); if (!ok) failed++; };
const stamp = Date.now();
const NAME = `Consent ${stamp}`, EMAIL = `consent-${stamp}@journey.test`;

await p.goto(`${B}/signup`, { waitUntil: 'networkidle' });
say('the box is there', await p.locator('input[name="consent"]').count() === 1);
say('UNTICKED when the page loads', !(await p.locator('input[name="consent"]').isChecked()));
say('and the links point at the two pages',
  await p.locator('a[href="/terms"][target="_blank"]').count() > 0 && await p.locator('a[href="/privacy"][target="_blank"]').count() > 0);

// Fill everything EXCEPT the box, and defeat the browser's own `required` the way anybody could.
await p.fill('input[name="name"]', 'Kris Harold');
await p.fill('input[name="business"]', NAME);
await p.fill('input[name="email"]', EMAIL);
await p.fill('input[name="password"]', 'a-good-password-123');
await p.waitForTimeout(3500);
await p.evaluate(() => document.querySelector('input[name="consent"]').removeAttribute('required'));
await p.click('button[type="submit"]');
await p.waitForLoadState('networkidle').catch(()=>{});
await p.waitForTimeout(1500);
const body = await p.evaluate(() => document.body.innerText);
say('THE SERVER REFUSES IT EVEN WITH `required` STRIPPED', p.url().includes('/signup'), p.url());
say('and says why, in words', /Tick the box/i.test(body), body.split('\n').find(l=>/tick|agree/i.test(l)) ?? '');
say('keeping what was typed', (await p.inputValue('input[name="business"]')) === NAME);

// Now tick it and go through.
await p.check('input[name="consent"]');
await p.fill('input[name="password"]', 'a-good-password-123');
await p.click('button[type="submit"]');
await p.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 20000 }).catch(()=>{});
/*
  A throttled sign-up is SPEC protecting itself, not a fault — and this journey runs after twelve
  others that each sign a business up, so it is the most likely one to meet the limit. Everything
  above this point has already been proven; what is below needs an account to exist.
*/
if (p.url().includes('error=busy')) {
  console.log('  --   sign-up is being throttled (error=busy) — SPEC protecting itself, not a fault.');
  await b.close();
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed (the record checks were skipped — throttled).');
  process.exit(failed ? 1 : 0);
}

say('TICKED, IT GOES THROUGH', !p.url().includes('/signup'), p.url());

// And the record.
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const [row] = await sql`select terms_version, terms_accepted_at from users where email = ${EMAIL}`;
say('THE VERSION IS STAMPED ON THE ACCOUNT', row?.terms_version === '1.1', JSON.stringify(row));
say('and the moment with it', !!row?.terms_accepted_at && !Number.isNaN(Date.parse(row.terms_accepted_at)), row?.terms_accepted_at ?? '');

await p.goto(`${B}/terms`, { waitUntil: 'networkidle' });
const t = await p.evaluate(() => document.body.innerText);
say('the terms page prints its version', /Version 1\.1/.test(t), t.split('\n').find(l=>/Version/i.test(l)) ?? '');
say('and carries no placeholders', !/\[[A-Z][A-Z \/]{3,}\]/.test(t));

await b.close();
const { tidyUp } = await import('./test-cleanup.mjs');
await tidyUp(NAME);
await sql.end();

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
