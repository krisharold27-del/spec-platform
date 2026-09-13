// Is the LIVE site actually working, from outside it?
//
//   node scripts/production-check.mjs [url]
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// Everything else in this repository proves the code is right. `npm run deployed` proves Vercel
// finished a build. Neither of those is the same as a customer being able to use the site, and the
// gap between them is where this product has been hurt before: a deploy reported success while the
// database it needed had never been migrated, and the owner concluded his product was broken.
//
// So this asks the only question that actually matters, from the outside, the way a customer's
// browser would: **does the live site answer, is it serving the commit we think it is, and does it
// say anything is wrong with itself?**
//
// It is deliberately READ-ONLY. It signs nobody up and creates nothing. A production smoke test
// that registers accounts leaves fake businesses in a real customer database, and the day somebody
// is auditing the numbers for a sale, "most of these are from the smoke test" is not an answer.
//
// The journeys that DO sign up run against a local copy, where fake data belongs. See npm run check.

import { execFileSync } from 'node:child_process';

const BASE = (process.argv[2] ?? process.env.PRODUCTION_URL ?? 'https://www.specbizhq.com').replace(/\/$/, '');

const failures = [];
const notes = [];
/** How many requests got a real HTTP answer. Zero means this machine, not the site. */
let reached = 0;

/** Fetch, through curl, which reads a proxy without being asked. Returns {status, body}. */
function get(path) {
  try {
    const out = execFileSync('curl', [
      '-s', '--max-time', '30', '-w', '\n%{http_code}', `${BASE}${path}`,
    ], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
    const cut = out.lastIndexOf('\n');
    return { status: Number(out.slice(cut + 1).trim()), body: out.slice(0, cut) };
  } catch (error) {
    return { status: 0, body: String(error.stderr ?? error.message ?? '') };
  }
}

function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

console.log(`\nThe live site — ${BASE}\n`);

/* ── The pages a stranger meets first ──────────────────────────────────────────────────────────
   No sign-in needed, so a failure here is visible to every visitor and every prospect. */
console.log('What anybody can reach');
for (const [path, name] of [
  ['/', 'the front door'],
  ['/pricing', 'pricing'],
  ['/signin', 'the sign-in page'],
  ['/signup', 'the sign-up page'],
  ['/status', 'the status page'],
]) {
  const { status } = get(path);
  if (status > 0) reached += 1;
  check(name, status === 200, status ? `HTTP ${status}` : 'no answer at all');
}

/* ── What the product says about itself ───────────────────────────────────────────────────────── */
console.log('\nWhat it says about itself');
const health = get('/api/health');
if (health.status > 0) reached += 1;
let body = null;
try { body = JSON.parse(health.body); } catch { /* handled below */ }

if (!body) {
  check('the health check answers', false, health.status ? `HTTP ${health.status}, and not JSON` : 'no answer');
} else {
  /*
    A 503 here is the product doing its job, not a crash: /api/health answers 503 when something it
    needs is missing, and names it. So the STATUS is not the test — the contents are.
  */
  check('the health check answers', health.status === 200 || health.status === 503, `HTTP ${health.status}`);
  check('the database answers', body.database?.status === 'ok', body.database?.reason ?? body.database?.status ?? 'unknown');
  check(
    'the database matches the build',
    body.schema?.status === 'ok',
    body.schema?.says ?? body.schema?.status ?? 'unknown',
  );

  const missing = body.missing ?? [];
  check('every setting it needs is present', missing.length === 0, missing.length ? missing.join(', ') : 'nothing missing');

  /*
    Optional settings are REPORTED, never failed. A missing Stripe key is not a broken site — it is
    a business decision that has not been made yet. Saying so plainly is the point: the owner should
    be able to see, without asking anybody, exactly which of these are switched on.
  */
  const optional = body.optional ?? {};
  const off = Object.entries(optional).filter(([, on]) => !on).map(([k]) => k);
  if (off.length) notes.push(`Not switched on: ${off.join(', ')}`);

  if (optional.RESEND_API_KEY === false) notes.push('Invitations cannot be sent — nobody can be given a seat.');
  if (optional.STRIPE_SECRET_KEY === false || optional.STRIPE_PRICE_SEAT_MONTHLY === false) {
    notes.push('Billing is off — nobody can be charged.');
  }
}

/* ── Is it serving the commit we think it is? ──────────────────────────────────────────────────
   Only when told which one to expect, so this stays useful run by hand at any time. */
const expected = (process.env.EXPECTED_SHA ?? '').trim();
if (expected && body?.commit) {
  console.log('\nWhich version is live');
  const same = body.commit.startsWith(expected.slice(0, 7)) || expected.startsWith(body.commit.slice(0, 7));
  check('serving this commit', same, `live is ${String(body.commit).slice(0, 7)}, expected ${expected.slice(0, 7)}`);
} else if (expected) {
  notes.push('The site does not report its commit, so which version is live could not be confirmed here.');
}

if (notes.length) {
  console.log('\nWorth knowing');
  for (const n of notes) console.log(`  · ${n}`);
}

/*
  ── "I could not reach it" is not "it is down" ───────────────────────────────────────────────────

  Run from a machine whose network refuses the outside world — a locked-down container, a corporate
  proxy, an offline laptop — every request fails identically, and the first version of this
  announced THE LIVE SITE HAS A PROBLEM about a site that was perfectly fine.

  That is the cry-wolf failure this project has spent a week stamping out, and it is worse here than
  anywhere: this is the check somebody would act on at speed, at the exact moment they are worried.
  So: if NOTHING answered at all, the honest verdict is that this machine cannot see the site.
*/
const nothingAnswered = failures.length > 0 && reached === 0;

console.log(`\n${'─'.repeat(60)}`);
if (nothingAnswered) {
  console.log('COULD NOT REACH IT — nothing answered, from this machine.');
  console.log('That is almost certainly this network rather than the site: a proxy, a firewall, or');
  console.log('no connection. It is NOT the same as the site being down, and is not reported as it.');
  console.log(`Try from somewhere else, or open ${BASE} in a browser.`);
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(2);
}
if (failures.length) {
  console.log(`THE LIVE SITE HAS A PROBLEM — ${failures.length} check(s) failed.`);
  console.log('The lines marked ✗ say which. This is what a customer would hit.');
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(1);
}
console.log('THE LIVE SITE IS WORKING — everything a visitor touches answers, and it reports no fault.');
console.log(`${'─'.repeat(60)}\n`);
