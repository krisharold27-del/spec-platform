// Did what I just pushed actually reach the live site?
//
//   npm run deployed
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// A fix is not finished when it is committed. It is finished when it is running where customers
// are. Between those two is a gap — a build that failed, a deploy that never triggered, a push to
// the wrong branch — and for a while the only way anybody found out was Kris opening the site and
// discovering the thing he had been told was fixed was not.
//
// That is the same failure this project has already been bitten by twice: the deploy that reported
// success while changing nothing, and the migration that politely declined to run in a build log
// nobody reads. A step whose failure mode is silence is not a step.
//
// So this closes the loop, and it closes it from HERE — no opening a browser, no asking anybody to
// go and look.
//
// ── How it knows, without touching the site ──────────────────────────────────────────────────────
//
// Vercel reports the outcome of every build back to GitHub as a commit status. So the question
// "is my commit live?" can be answered by asking GitHub about the commit, which needs no access to
// specbizhq.com at all. That matters: some environments this runs in are not allowed to reach the
// live domain, and a check that only works from a laptop is a check that gets skipped.
//
// It answers one of five ways, and never guesses:
//
//   LIVE        — this exact commit built and deployed.
//   BUILDING    — Vercel has it and is working. Run again in a minute.
//   WAITING     — GitHub has it and Vercel has not said anything yet.
//   FAILED      — the build broke. The commit is on GitHub and NOT on the site.
//   NOT PUSHED  — GitHub answered 404. There is nothing for Vercel to have seen.
//
// And a sixth that is the most important one: **UNKNOWN**. Anything that is not a clean 200 or a
// clean 404 means this could not tell, and it says so. The alternative is a guess wearing the
// clothes of a fact, which this tool already produced once — reporting a commit Vercel was
// actively building as never pushed, because a 403 from the network was read as "does not exist".
//
// "No status yet" is never read as "fine".

import { execSync } from 'node:child_process';

const REPO = 'krisharold27-del/spec-platform';
const API = `https://api.github.com/repos/${REPO}`;

const git = cmd => execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * GitHub, as JSON. Null when it could not be reached — which is said out loud, never assumed good.
 *
 * Two ways of asking, because one of them is not enough. Node's built-in fetch ignores HTTPS_PROXY
 * unless told not to, so on any machine behind a proxy it times out while the network is perfectly
 * fine — and a check that reports "could not reach GitHub" when GitHub is up is a check that gets
 * ignored, which is worse than not having it. curl reads the proxy without being asked, so it is
 * the fallback.
 */
async function gh(path) {
  const url = `${API}${path}`;

  /*
    Node's built-in fetch does not read HTTPS_PROXY, so on a machine that reaches the internet
    through one it does not merely fail slowly — it gets a 403 straight from the network, every
    time. The first version treated that as GitHub's own answer and never tried the fallback at
    all, which is how a commit Vercel was building was reported as never pushed.

    So anything other than a clean 200 or 404 falls through to curl, which does read the proxy.
  */
  try {
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
    if (res.ok) return { status: 200, body: await res.json() };
    if (res.status === 404) return { status: 404, body: null };
  } catch {
    // Fall through to curl.
  }

  try {
    // The status code is captured deliberately. Reading only the body means a rate-limit message,
    // a proxy's error page, or anything else JSON-shaped gets treated as a real answer.
    const out = execSync(
      `curl -sS -H "accept: application/vnd.github+json" -w "\\n%{http_code}" ${JSON.stringify(url)}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const cut = out.lastIndexOf('\n');
    const status = Number(out.slice(cut + 1).trim());
    if (status === 200) return { status, body: JSON.parse(out.slice(0, cut)) };
    return { status, body: null };
  } catch {
    return { status: 0, body: null };
  }
}

/**
 * Ask again before giving up.
 *
 * GitHub, or whatever sits between here and it, intermittently answers 403 to an unauthenticated
 * request from a shared address. One of those turned into a definite-sounding verdict on a commit
 * that was building perfectly well. A transient refusal is not an answer, so it is retried a few
 * times, briefly, before this reports that it could not tell.
 */
async function ask(path, tries = 3) {
  let last = { status: 0, body: null };
  for (let n = 0; n < tries; n++) {
    last = await gh(path);
    if (last.status === 200 || last.status === 404) return last;
    if (n < tries - 1) execSync('sleep 2');
  }
  return last;
}

const sha = git('rev-parse HEAD');
const short = sha.slice(0, 7);
const branch = git('rev-parse --abbrev-ref HEAD');
const subject = git('log -1 --pretty=%s');

console.log(`\nIs it live?\n`);
console.log(`  Commit   ${short}  ${subject}`);
console.log(`  Branch   ${branch}`);

const dirty = git('status --porcelain');
if (dirty) {
  const n = dirty.split('\n').length;
  console.log(`  Careful  ${n} change${n === 1 ? ' here is' : 's here are'} not committed, so ${n === 1 ? 'it is' : 'they are'} in no deploy.`);
}

/* Is the commit even on GitHub? If it is not, nothing else is worth asking — Vercel deploys what
   GitHub has, and a commit sitting only on this machine has not begun the journey. */
const onGitHub = await ask(`/commits/${sha}`);

/*
  NOT PUSHED is claimed on a verified 404 and on nothing else.

  This used to read "no sha in the answer" as "the commit does not exist", which is a guess wearing
  the clothes of a fact — and it fired: a commit Vercel was actively building was reported as never
  pushed, one poll after being reported as BUILDING. Any answer that is not a clean 200 or a clean
  404 means this could not tell, and saying so is the whole point of the tool.
*/
if (onGitHub.status === 404) {
  console.log(`\n  NOT PUSHED — GitHub does not have ${short}, so Vercel cannot have deployed it.`);
  console.log(`  Push it:  git push -u origin ${branch}\n`);
  process.exit(1);
}

if (onGitHub.status !== 200 || !onGitHub.body?.sha) {
  const why = onGitHub.status === 0 ? 'GitHub could not be reached' : `GitHub answered ${onGitHub.status}`;
  console.log(`\n  UNKNOWN — ${why}, so there is no way to tell from here.`);
  console.log('  This is NOT the same as "not deployed". Try again in a minute.\n');
  process.exit(2);
}

const statusAnswer = await ask(`/commits/${sha}/status`);
if (statusAnswer.status !== 200) {
  console.log(`\n  UNKNOWN — GitHub has ${short}, but its build status could not be read (${statusAnswer.status || 'unreachable'}).`);
  console.log('  Try again in a minute.\n');
  process.exit(2);
}

const vercel = statusAnswer.body?.statuses?.find(s => /vercel/i.test(s.context ?? ''));

if (!vercel) {
  console.log(`\n  WAITING — GitHub has ${short}, and Vercel has not reported on it yet.`);
  console.log(`  That is normal for the first minute after a push. Run this again shortly.\n`);
  process.exit(2);
}

const when = vercel.updated_at ? new Date(vercel.updated_at) : null;
const ago = when ? `${Math.max(0, Math.round((Date.now() - when.getTime()) / 60000))} min ago` : '';

if (vercel.state === 'success') {
  console.log(`\n  LIVE — ${short} built and deployed${ago ? `, ${ago}` : ''}.`);
  console.log(`  What is on the site is what is in this commit.`);
  console.log(`  Build: ${vercel.target_url}\n`);
  process.exit(0);
}

if (vercel.state === 'pending') {
  console.log(`\n  BUILDING — Vercel has ${short} and is working on it${ago ? ` (started ${ago})` : ''}.`);
  console.log(`  The site is still showing the previous deploy. Run this again in a minute.`);
  console.log(`  Build: ${vercel.target_url}\n`);
  process.exit(2);
}

console.log(`\n  FAILED — the build for ${short} did not deploy (${vercel.state}${ago ? `, ${ago}` : ''}).`);
console.log(`  ${vercel.description ?? 'No reason given.'}`);
console.log(`  The commit is on GitHub and is NOT on the site — the site is still on the one before.`);
console.log(`  Build log: ${vercel.target_url}\n`);
process.exit(1);
