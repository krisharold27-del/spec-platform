// Can a job photo be saved, and can only the right business see it?
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// SPEC recorded that a photo was taken — the caption, who took it, when — and the picture stayed on
// the phone. Kris, 24 September: *"yes connect the file store so photos save"*.
//
// A photo is different from every other row in SPEC: it is a picture of somebody's switchboard,
// their meter box, the inside of their house, held by a business that is our customer. So the check
// that matters most here is not that an upload works. It is that ONE BUSINESS CAN NEVER SEE
// ANOTHER'S — proven by making two real businesses, putting a record in one, and asking for it as
// the other.
//
// ── What this can and cannot prove on this machine ───────────────────────────────────────────────
//
// The round trip through Vercel Blob itself needs the store's own token, which lives only in the
// deployment's settings. So this walks everything either side of it: that the app refuses to issue
// an upload token when no store is connected, that the screen says so plainly instead of pretending
// the picture is safe, that a photo row is served only to its own business, and that a record with
// no file says so rather than showing a broken frame. `npm run check` will report the live upload
// as unproven until it has been walked on the deployment.
//
//   node scripts/fake-auth.mjs 54321 &
//   npx next dev -p 3100 &
//   npx tsx scripts/photo-journey.mts http://localhost:3100

import { chromium } from 'playwright';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { tidyUp } from './test-cleanup.mjs';
import { folderFor, photoHref, storeConnected } from '../src/lib/photos';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });

const stamp = Date.now();
const MINE = `Photo Test ${stamp}`;
const THEIRS = `Photo Other ${stamp}`;

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

const faults: string[] = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 140)));

const stop = async (code: number, why: string) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await sql.end({ timeout: 5 }).catch(() => {});
  await tidyUp(code === 0 ? null : MINE);
  await tidyUp(code === 0 ? null : THEIRS);
  process.exit(code);
};

/** Sign a brand-new business up, the way anybody does. Returns its tenant id. */
async function signUp(business: string): Promise<string> {
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'Kris Harold');
  await page.fill('input[name="business"]', business);
  await page.fill('input[name="email"]', `photo-${business.replace(/\W/g, '')}@example.test`);
  await page.fill('input[name="password"]', 'a-good-password-123');
  await page.check('input[name="consent"]').catch(() => {});
  await page.waitForTimeout(3000);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 30_000 }).catch(() => {});
  const [t] = await sql`select id from tenants where name = ${business}`;
  return t?.id as string;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Two real businesses
 * ───────────────────────────────────────────────────────────────────────────── */

const theirs = await signUp(THEIRS);
if (!theirs) await stop(1, 'could not sign up the second business');

/*
  A photo record in THEIR business, with a file against it. Written straight to the database rather
  than through the phone, because the point of it is to be something this journey's own business
  must never be able to reach — and driving the phone to make it would prove nothing extra.
*/
const theirJobId = randomUUID();
const theirRecordId = randomUUID();
await sql`
  insert into jobs (id, tenant_id, ref, title, client, stage, stage_at, created_by, created_at)
  values (${theirJobId}, ${theirs}, 'J-9001', 'Their job', 'Their client', 'won', now(), 'Kris Harold', now())`;
await sql`
  insert into job_records (id, tenant_id, job_id, kind, who, what, file_ref, at_time)
  values (${theirRecordId}, ${theirs}, ${theirJobId}, 'photo', 'Their tech', 'Their switchboard',
          ${`${folderFor(theirs)}jobs/${theirJobId}/secret.jpg`}, now())`;

const mine = await signUp(MINE);
if (!mine) await stop(1, 'could not sign up');

/* ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THAT MATTERS
 * ───────────────────────────────────────────────────────────────────────────── */

const connected = storeConnected();

/*
  ── The page, which bites whether or not a store is connected ──────────────────────────────────

  Signed in as MY business, open THEIR job by its real id. Their caption must not appear anywhere,
  and neither must their job. This is the version of the cross-business check that is worth
  something on a machine with no file store: nothing here depends on a picture being fetchable, so
  it fails the moment the scoping on the job read is wrong.
*/
await page.goto(`${BASE}/jobs?job=${theirJobId}`, { waitUntil: 'networkidle' });
const theirJobPage = await page.evaluate(() => document.body.innerText);
check(
  'ANOTHER BUSINESS’S JOB AND ITS PHOTOS ARE NOT ON MY BOARD',
  !/Their switchboard/.test(theirJobPage) && !/Their job/.test(theirJobPage) && !/Their tech/.test(theirJobPage),
  theirJobPage.slice(0, 200).replace(/\n/g, ' '),
);
check(
  'and their record id is nowhere in the page for anybody to lift',
  !(await page.content()).includes(theirRecordId),
);

/*
  ── And the route itself ─────────────────────────────────────────────────────────────────────────

  Ask for THEIR photo by its real record id. If this ever answers anything but 404, one customer is
  showing another customer the inside of somebody's house.

  ── Why this is reported as unproven without a store ─────────────────────────────────────────────

  With no store connected the route answers 404 for EVERY photo, so this passes whether the business
  check is there or not — it was written, it passed, and putting the fault back showed it passing
  just the same. A check that cannot fail is not a check, and the honest thing is to say so rather
  than bank a pass it did not earn. `mayRead` carries this in tests/photos.test.ts, where removing
  the fence fails four checks; this line becomes real the moment there is a store.
*/
const cross = await page.goto(`${BASE}${photoHref(theirRecordId)}`, { waitUntil: 'domcontentloaded' });
const missing = await page.goto(`${BASE}${photoHref(randomUUID())}`, { waitUntil: 'domcontentloaded' });

if (connected) {
  check(
    'ANOTHER BUSINESS’S PHOTO IS NOT SERVED, asked for by its real id',
    cross?.status() === 404,
    `answered ${cross?.status()}`,
  );
  /*
    And the same answer for an id that does not exist. A different one would confirm which ids are
    real, which is the one thing somebody guessing is trying to learn.
  */
  check(
    'AND A REAL ID AND A MADE-UP ONE ANSWER IDENTICALLY',
    missing?.status() === cross?.status(),
    `${missing?.status()} vs ${cross?.status()}`,
  );
} else {
  console.log('  ––   NOT PROVEN HERE  another business’s photo over the route — with no store every');
  console.log('                        photo 404s, so this cannot fail. tests/photos.test.ts holds it.');
  check(
    'with no store, every photo answers the same way',
    cross?.status() === 404 && missing?.status() === 404,
    `${cross?.status()} / ${missing?.status()}`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A photo of my own
 * ───────────────────────────────────────────────────────────────────────────── */

const myJobId = randomUUID();
const withFile = randomUUID();
const withoutFile = randomUUID();
await sql`
  insert into jobs (id, tenant_id, ref, title, client, stage, stage_at, created_by, created_at)
  values (${myJobId}, ${mine}, 'J-1001', 'Level 3 riser', 'Acme', 'won', now(), 'Kris Harold', now())`;
await sql`
  insert into job_records (id, tenant_id, job_id, kind, who, what, file_ref, at_time)
  values (${withFile}, ${mine}, ${myJobId}, 'photo', 'Jack', 'Board before we started',
          ${`${folderFor(mine)}jobs/${myJobId}/before.jpg`}, now())`;
// One from before there was anywhere to put a picture: the chain is there, the image is not.
await sql`
  insert into job_records (id, tenant_id, job_id, kind, who, what, file_ref, at_time)
  values (${withoutFile}, ${mine}, ${myJobId}, 'photo', 'Jack', 'Taken before the store existed',
          null, now())`;

await page.goto(`${BASE}/jobs?job=${myJobId}`, { waitUntil: 'networkidle' });
const onJob = await page.evaluate(() => document.body.innerText);

check(
  'THE OFFICE CAN SEE WHAT THE CREW RECORDED ON SITE',
  /From site/i.test(onJob),
  'a chain nobody can open is a filing cabinet with no key',
);
check(
  'and each photo carries its caption and who took it',
  /Board before we started/.test(onJob) && /Jack/.test(onJob),
);
check(
  'A PHOTO FROM BEFORE THE STORE SAYS SO, rather than showing a broken frame',
  /stayed on the phone/i.test(onJob),
);

/*
  The stored path must never reach the page, so there is nothing in it for anybody to try. Checked
  against the EXACT path that was written rather than against a shape — an `||` between two loose
  substrings passes as soon as either one happens to be absent, which is a check that holds itself
  up.
*/
const html = await page.content();
const storedPath = `${folderFor(mine)}jobs/${myJobId}/before.jpg`;
check(
  'AND THE STORED PATH IS NOWHERE IN THE PAGE',
  !html.includes(storedPath) && !html.includes(folderFor(mine)),
  'the picture is addressed by record id, never by path',
);
check(
  'the picture is fetched from the route that checks the business first',
  (await page.locator(`img[src="${photoHref(withFile)}"]`).count()) > 0,
);

/* ─────────────────────────────────────────────────────────────────────────────
 * When there is nowhere to put one
 * ───────────────────────────────────────────────────────────────────────────── */

console.log(`  --   a file store is ${connected ? 'CONNECTED' : 'not connected'} for this run`);

const token = await page.evaluate(async base => {
  const r = await fetch(`${base}/api/photo/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: 'x.jpg', callbackUrl: '' } }),
  });
  return r.status;
}, BASE);

if (!connected) {
  /*
    The honest half. SPEC ran a long time with nowhere to put a picture and SAID so — and the
    sentence a technician reads has to follow the store rather than somebody's memory.
  */
  check(
    'NO STORE MEANS NO UPLOAD TOKEN, said plainly rather than as a fault',
    token === 503,
    `the upload route answered ${token}`,
  );

  await page.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
  const phone = await page.evaluate(() => document.body.innerText);
  check(
    'AND THE PHONE PROMISES THE PICTURE STAYS ON IT',
    /stay on this phone/i.test(phone),
    phone.slice(0, 200).replace(/\n/g, ' '),
  );
  check(
    'and never says a photo was saved when it was not',
    !/saved to the job/i.test(phone),
  );
} else {
  check(
    'A STORE MEANS THE UPLOAD ROUTE ANSWERS, rather than refusing',
    token !== 503,
    `the upload route answered ${token}`,
  );
  await page.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
  const phone = await page.evaluate(() => document.body.innerText);
  check(
    'AND THE PHONE NO LONGER SAYS THE PICTURE STAYS ON IT',
    !/stay on this phone/i.test(phone),
    phone.slice(0, 200).replace(/\n/g, ' '),
  );
}

check('no page crashed while doing any of it', faults.length === 0, faults.join(' | '));

await sql.end({ timeout: 5 }).catch(() => {});
await browser.close();
await tidyUp(MINE);
await tidyUp(THEIRS);

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
