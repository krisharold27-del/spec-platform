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
// It answers one of four ways, and never guesses:
//
//   LIVE        — this exact commit built and deployed.
//   BUILDING    — Vercel has it and is working. Run again in a minute.
//   FAILED      — the build broke. The commit is on GitHub and NOT on the site.
//   NOT PUSHED  — there is nothing for Vercel to have seen yet.
//
// Unknown is reported as unknown. "No status yet" is never read as "fine".

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
  try {
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
    if (res.ok) return await res.json();
    if (res.status === 404) return { message: 'Not Found' };
  } catch {
    // Fall through to curl.
  }
  try {
    const out = execSync(`curl -sS -H "accept: application/vnd.github+json" ${JSON.stringify(url)}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
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
  console.log(`  Careful  ${n} change${n === 1 ? '' : 's'} here are not committed, so they are in no deploy.`);
}

/* Is the commit even on GitHub? If it is not, nothing else is worth asking — Vercel deploys what
   GitHub has, and a commit sitting only on this machine has not begun the journey. */
const onGitHub = await gh(`/commits/${sha}`);

if (onGitHub === null) {
  console.log(`\n  UNKNOWN — GitHub could not be reached, so there is no way to tell from here.`);
  console.log(`  This is not the same as "not deployed". Try again, or look at ${'https://vercel.com'}.\n`);
  process.exit(2);
}

if (onGitHub.message === 'Not Found' || !onGitHub.sha) {
  console.log(`\n  NOT PUSHED — GitHub has never seen ${short}, so Vercel cannot have deployed it.`);
  console.log(`  Push it:  git push -u origin ${branch}\n`);
  process.exit(1);
}

const status = await gh(`/commits/${sha}/status`);
const vercel = status?.statuses?.find(s => /vercel/i.test(s.context ?? ''));

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
