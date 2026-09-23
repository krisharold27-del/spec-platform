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

const BASE = (process.argv[2] ?? process.env.PRODUCTION_URL ?? 'https://www.sitevipapp.com').replace(/\/$/, '');

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
  // The price IDs stopped being settings on 19 September — they are Stripe's own, in lib/pricing.
  // Only the key can be missing now, and asking about a variable /api/health no longer reports
  // would have made this read `undefined === false`, which is false, and quietly stopped checking.
  if (optional.STRIPE_SECRET_KEY === false) notes.push('Billing is off — nobody can be charged.');
}

/*
  ── Is it serving the commit we think it is? ────────────────────────────────────────────────────

  Only when told which one to expect, so this stays useful run by hand at any time.

  ── Why "it is serving a different commit" is not automatically a fault ─────────────────────────

  On 16 September this emailed Kris **"Production: All jobs have failed"** — the subject line you
  would read as the site being down — about a site that was completely fine. Two commits had been
  pushed 38 seconds apart. The run for the first one slept its 150 seconds, asked the site which
  version it was serving, and was correctly told the second one. Everything had worked exactly as
  intended and the alarm went off anyway.

  That is the cry-wolf failure this repository has already removed one whole check for. It is worse
  than a missing check, because the cost lands on the one person who cannot ignore it: he was on a
  phone, away from a desk, reading that his business was down.

  So a newer commit is recognised as what it is. "Live is AHEAD of the commit this run was for"
  means somebody pushed again — the deploy worked, twice. Only behind, or unrelated, is a fault.
*/
const expected = (process.env.EXPECTED_SHA ?? '').trim();

/**
 * How `head` stands relative to `base` on GitHub: ahead, behind, identical, diverged — or null when
 * GitHub could not be asked, which is said out loud rather than assumed to be either.
 */
function standing(base, head) {
  const repo = process.env.GITHUB_REPOSITORY ?? 'krisharold27-del/spec-platform';
  const token = process.env.GITHUB_TOKEN ?? '';
  try {
    const out = execFileSync('curl', [
      '-s', '--max-time', '20', '-H', 'accept: application/vnd.github+json',
      // Unauthenticated GitHub allows 60 requests an hour per address, shared across every runner
      // on that address. A rate-limited answer must read as "could not ask", never as a fault.
      ...(token ? ['-H', `authorization: Bearer ${token}`] : []),
      `https://api.github.com/repos/${repo}/compare/${base}...${head}`,
    ], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'] });

    /*
      Only the four answers GitHub gives when it actually compared two commits.

      Its error bodies carry a `status` field too — "404" for a commit it cannot find, and a rate
      limit answers similarly — so reading `.status` and trusting it would turn "I could not ask"
      into a confident verdict. That is the whole fault being fixed here, one level down.
    */
    const said = JSON.parse(out).status;
    return ['ahead', 'behind', 'identical', 'diverged'].includes(said) ? said : null;
  } catch {
    return null;
  }
}

if (expected && body?.commit) {
  console.log('\nWhich version is live');
  const live = String(body.commit);
  const same = live.startsWith(expected.slice(0, 7)) || expected.startsWith(live.slice(0, 7));

  if (same) {
    check('serving this commit', true);
  } else {
    const how = standing(expected, live);
    if (how === 'ahead') {
      // Somebody pushed again while this was waiting. The deploy worked; this run is just late.
      notes.push(
        `Live is ${live.slice(0, 7)}, which is NEWER than the ${expected.slice(0, 7)} this run was for — `
        + 'somebody pushed again while it was waiting. Not a fault.',
      );
      console.log(`  ✓ serving this commit or a newer one — live is ${live.slice(0, 7)}, newer than ${expected.slice(0, 7)}`);
    } else if (how === null) {
      /*
        Could not ask GitHub. Do NOT guess in either direction: reporting a fault might be crying
        wolf again, and reporting success would hide a deploy that never landed. Say what is known.
      */
      check(
        'serving this commit',
        false,
        `live is ${live.slice(0, 7)}, expected ${expected.slice(0, 7)} — and GitHub could not be asked `
        + 'whether that is a newer commit or an older one',
      );
    } else {
      check('serving this commit', false, `live is ${live.slice(0, 7)} (${how}), expected ${expected.slice(0, 7)}`);
    }
  }
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
