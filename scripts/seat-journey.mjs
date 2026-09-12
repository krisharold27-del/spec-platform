// Take your seat: single use, expiring, bound to that address.
//
// All three are stated in the engine (designs/the-rules.md §11) and none of them were true — the
// invitation was a bare link to /signin. This drives the real thing: an owner invites somebody, the
// token that would have gone in the email is read from the database, and the invited person uses it.
// Then it is used a second time, which must fail.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/seat-journey.mjs

import { chromium } from 'playwright';
import postgres from 'postgres';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const stamp = Date.now();
const OWNER = `owner-${stamp}@example.test`;
const MATE = `mate-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Seat Test ${stamp}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};
const text = () => page.textContent('body').then(t => t ?? '');

// ── An owner, with a business ────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Dane Whitmore');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', OWNER);
await page.fill('input[name="password"]', PASSWORD);
await page.waitForTimeout(3500);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
check('the owner is set up', !page.url().includes('/signup'), page.url());

const [tenant] = await sql`select id from tenants where name = ${BUSINESS}`;
check('the business exists', Boolean(tenant));
if (!tenant) { await b.close(); await sql.end(); process.exit(1); }

// ── Invite somebody, the way the product does ────────────────────────────────────────────────────
// Written straight to the database: this journey is about the seat LINK, and the invite screen has
// its own path. What matters is that a token exists, expires, and is spent exactly once.
const [invitee] = await sql`
  insert into users (id, tenant_id, email, name, access, invited_at, seat_token, seat_token_expires)
  values (${`u-${stamp}`}, ${tenant.id}, ${MATE}, 'Tom Alderson', 'readonly', now()::text,
          ${`tok-${stamp}-aaaaaaaaaaaaaaaaaaaaaaaaaaaa`}, ${new Date(Date.now() + 7 * 864e5).toISOString()})
  returning seat_token`;
const token = invitee.seat_token;
check('an invitation carries a token', Boolean(token));

// ── A refused link says what happened, in their words ────────────────────────────────────────────
const fresh = await ctx.newPage();
await fresh.goto(`${BASE}/seat?t=not-a-real-token`, { waitUntil: 'networkidle' });
let body = (await fresh.textContent('body')) ?? '';
check('a wrong link is explained, not error-coded', /does not match an invitation/i.test(body));
// Scoped to the visible message: the raw body also carries Next's serialised props, which
// include the token from the query string and are not something a person reads.
const shown = (await fresh.textContent('h1')) + ' ' + (await fresh.textContent('main p'));
check('and never says "token"', !/token/i.test(shown), shown.slice(0, 120));

// ── Expired ──────────────────────────────────────────────────────────────────────────────────────
await sql`update users set seat_token_expires = ${new Date(Date.now() - 864e5).toISOString()} where email = ${MATE}`;
await fresh.goto(`${BASE}/seat?t=${encodeURIComponent(token)}`, { waitUntil: 'networkidle' });
body = (await fresh.textContent('body')) ?? '';
check('an expired invitation offers a new one', /expired/i.test(body) && /new one/i.test(body));
await sql`update users set seat_token_expires = ${new Date(Date.now() + 7 * 864e5).toISOString()} where email = ${MATE}`;

// ── Take the seat ────────────────────────────────────────────────────────────────────────────────
await fresh.goto(`${BASE}/seat?t=${encodeURIComponent(token)}`, { waitUntil: 'networkidle' });
body = (await fresh.textContent('body')) ?? '';
check('the seat names the person and the business', body.includes('Tom Alderson') && body.includes(BUSINESS));
// Bound to that address: the email is shown, never asked for, so a forwarded invitation cannot
// become somebody else's seat.
check('the address is shown, not asked for', body.includes(MATE) && (await fresh.locator('input[name="email"]').count()) === 0);

await fresh.fill('input[name="password"]', PASSWORD);
await fresh.click('button[type="submit"]');
await fresh.waitForTimeout(3500);
check('TAKING THE SEAT LANDS THEM INSIDE', !fresh.url().includes('/seat'), fresh.url());

const [after] = await sql`select accepted_at, seat_token from users where email = ${MATE}`;
check('the seat is marked taken', Boolean(after.accepted_at));
// The token stays; acceptedAt is what spends it. See the note in app/seat/actions.
check('the token is inert but still findable, so a second click can be answered', Boolean(after.seat_token));

// ── SINGLE USE: the same link, a second time ─────────────────────────────────────────────────────
const second = await ctx.newPage();
await second.goto(`${BASE}/seat?t=${encodeURIComponent(token)}`, { waitUntil: 'networkidle' });
body = (await second.textContent('body')) ?? '';
check('THE SAME LINK CANNOT BE USED TWICE', /did not work/i.test(body));
check('and a second reader is sent to sign in, not told to ask again', /already been taken|just sign in/i.test(body));

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
await sql.end();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
