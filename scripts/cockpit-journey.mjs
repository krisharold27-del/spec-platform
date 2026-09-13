// The cockpit is private, and "private" has to mean enforced rather than unlinked.
//
// /cockpit carries commercial targets — revenue, client count, the road to twenty thousand seats.
// None of that is a customer's business, and a page that is merely unlinked is not protected: the
// address is guessable, and anybody who ever sees it once can return to it.
//
// So this drives two real people through a real browser: an ordinary customer, who must be turned
// away, and an allowlisted address, which must get in. The allowlist lives in ADMIN_EMAILS and is
// checked on the server on every request.
//
//   ADMIN_EMAILS=boss@example.test npm start &
//   node scripts/cockpit-journey.mjs

import { chromium } from 'playwright';
import postgres from 'postgres';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const ADMIN = (process.env.ADMIN_EMAILS ?? '').split(',')[0].trim();

if (!ADMIN) {
  console.log('ADMIN_EMAILS is not set, so there is no allowlist to test against — skipping.');
  process.exit(0);
}

/*
  This journey CLEARS its own fixture, and that is only ever safe against a throwaway address.

  The allowlisted address has to be a fixed one — it is the thing being tested — but the sign-in
  stand-in keeps its accounts in memory and forgets them whenever the server restarts. The database
  row survives, so from the second run onwards sign-up correctly says "you already have an account"
  and sign-in correctly fails, because as far as the auth service is concerned that person has never
  existed. The run then reports that an allowlisted address cannot reach its own page, which is a
  lie about the product caused entirely by the test.

  So the row is removed first. The guard below is the important half: a real address is never
  touched, at any cost — the journey skips instead, loudly. Deleting a founder's account to make a
  test pass is not a trade anybody would accept.
*/
const DISPOSABLE = /@([\w-]+\.)*(test|example|invalid|localhost)$/i.test(ADMIN);
if (!DISPOSABLE) {
  console.log(`ADMIN_EMAILS starts with a real address (${ADMIN}), and this journey clears the account it tests with.`);
  console.log('Skipping rather than touching it. Point ADMIN_EMAILS at something like boss@example.test to run this.');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log('No DATABASE_URL, so the fixture cannot be cleared — skipping.');
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
{
  /*
    Removed in dependency order, innermost first. Written out rather than forced with a cascade:
    a cascade added to the schema to make a test convenient is a cascade that also fires in
    production the day somebody deletes the wrong row.
  */
  const tenants = (await sql`select distinct tenant_id from users where email = ${ADMIN}`)
    .map(r => r.tenant_id);

  for (const id of tenants) {
    const roleIds = (await sql`select id from roles where tenant_id = ${id}`).map(r => r.id);
    const periodIds = (await sql`select id from assessment_periods where tenant_id = ${id}`).map(r => r.id);

    if (roleIds.length) {
      await sql`delete from role_assignments where role_id in ${sql(roleIds)}`;
      await sql`delete from role_curriculum where role_id in ${sql(roleIds)}`;
      await sql`delete from criteria where role_id in ${sql(roleIds)}`;
    }
    if (periodIds.length) {
      await sql`delete from assessments where period_id in ${sql(periodIds)}`;
      await sql`delete from gates where period_id in ${sql(periodIds)}`;
      await sql`delete from board_outputs where period_id in ${sql(periodIds)}`;
    }

    // Everything else that simply hangs off the business.
    for (const t of ['obligations', 'leave_entries', 'training_records', 'training_modules',
                     'scorecard_comments', 'register_entries', 'approvals', 'candidates',
                     'directors', 'diagnostics', 'meetings', 'journey_steps',
                     'system_connections', 'staff', 'assessment_periods', 'roles']) {
      await sql.unsafe(`delete from ${t} where tenant_id = $1`, [id]);
    }
  }

  await sql`delete from users where email = ${ADMIN}`;
  for (const id of tenants) await sql`delete from tenants where id = ${id}`;
}

const stamp = Date.now();
const PASSWORD = 'a-good-password-123';

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};

/**
 * Sign somebody up and hand back their page, signed in.
 *
 * Waits for the URL to actually leave /signup rather than sleeping a fixed three seconds. The fixed
 * sleep failed on the first sign-up of a cold server and passed on the second — and the failure was
 * dangerous rather than merely flaky, because a customer who is not signed in gets redirected away
 * from /cockpit for the wrong reason, so the privacy check below would have passed while proving
 * nothing at all.
 */
async function signUp(email, business) {
  /*
    A FRESH browser for each person, not a second tab.

    Sharing one context shared the cookies, so the second sign-up quietly reused the first person's
    session — and the run then reported that an allowlisted address could not reach its own page.
    The bug was in the test, and it is the kind that would have sent me looking at the allowlist.
    Two people means two browsers.
  */
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'Test Person');
  await page.fill('input[name="business"]', business);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.waitForTimeout(3500);   // the sign-up form holds briefly against bots
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 25_000 });
  } catch {
    // Left on the form. The caller's check reports it, with whatever the page said.
  }

  /*
    Already on SPEC, so sign in instead.

    The allowlisted address is a FIXED one — it has to be, since it is the thing being tested — so
    from the second run onwards sign-up correctly refuses it and offers sign-in. That is the real
    path this address takes every day, not a test artefact, so the journey walks it rather than
    working around it with a throwaway address that would prove nothing about the actual allowlist.
  */
  if (page.url().includes('/signin')) {
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 25_000 });
    } catch { /* reported by the caller */ }
  }
  return page;
}

// ── An ordinary customer must be turned away ─────────────────────────────────────────────────────
const customer = await signUp(`customer-${stamp}@example.test`, `Customer Co ${stamp}`);
const customerSignedIn = !customer.url().includes('/signup');
check('an ordinary customer is signed in', customerSignedIn, customer.url());

/*
  Only meaningful while they really are signed in. A signed-out visitor is bounced off /cockpit
  anyway, so running this check against one would prove the allowlist works when it might not
  exist at all — the check would pass and the page would be wide open to every customer.
*/
if (!customerSignedIn) {
  check('A CUSTOMER CANNOT REACH THE COCKPIT', false, 'could not sign the customer in, so this proves nothing');
}
await customer.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
const customerBody = (await customer.textContent('body')) ?? '';
if (customerSignedIn) {
  check('A CUSTOMER CANNOT REACH THE COCKPIT', !customer.url().includes('/cockpit'), customer.url());
}
check('and is not shown any of it on the way past', !/path to twenty thousand|Revenue run-rate/i.test(customerBody));

// ── The allowlisted address must get in ──────────────────────────────────────────────────────────
const owner = await signUp(ADMIN, `SPEC Business Solutions ${stamp}`);
await owner.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
const ownerBody = (await owner.textContent('body')) ?? '';
check('THE ALLOWLISTED ADDRESS GETS IN', owner.url().includes('/cockpit'), owner.url());
check('it says what it is for', /Running SPEC Business Solutions/i.test(ownerBody));
check('both engines are there', /Consulting/.test(ownerBody) && /Software/.test(ownerBody));

/*
  The rule the page exists to keep. Three health figures in the design were invented — plausible
  uptime, response time and error rate that SPEC does not measure. A cockpit with decorative numbers
  on it is worse than no cockpit, so the page must say plainly where it has nothing of its own.
*/
check('it admits what it does not measure', /Not measured here/i.test(ownerBody));
check('and points at whoever does measure it', /Vercel/.test(ownerBody));
check('it admits what has not been built', /Not yet/i.test(ownerBody) && /Load-tested/i.test(ownerBody));

// A seat count read from the database, never a flattering round number.
check('the seat count is counted, not claimed', /of 20,000 seats/.test(ownerBody));

// ── Signed out entirely ──────────────────────────────────────────────────────────────────────────
const stranger = await b.newContext();
const strangerPage = await stranger.newPage();
await strangerPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
check('A SIGNED-OUT STRANGER CANNOT REACH IT', !strangerPage.url().includes('/cockpit'), strangerPage.url());

await b.close();
await sql.end();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
