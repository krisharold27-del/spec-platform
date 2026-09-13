// One command. Is SPEC working right now?
//
//   npm run check
//
// Written for the person who owns the business, not for the person who wrote the code. It runs
// everything — the engine's arithmetic, the four ways a customer gets in, the security policies —
// and prints one line per thing in plain words, then a verdict.
//
// The point is not that it is convenient. The point is that nobody has to take anybody's word for
// whether the product works: you run this, and it either says so or names what is broken.
//
// Anything needing a database or a browser is skipped, out loud, when those are not here. A skip is
// never counted as a pass.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const t0 = Date.now();
const results = [];

const run = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function step(name, what, fn) {
  process.stdout.write(`  … ${what}`);
  try {
    const note = fn();
    process.stdout.write(`\r  ✓ ${what}${note ? ` — ${note}` : ''}\n`);
    results.push({ name, state: 'pass' });
  } catch (error) {
    const why = String(error.stdout || error.stderr || error.message).trim().split('\n').slice(-3).join(' ');
    process.stdout.write(`\r  ✗ ${what}\n      ${why.slice(0, 200)}\n`);
    results.push({ name, state: 'fail' });
  }
}

function skip(name, what, why) {
  console.log(`  – ${what} — skipped, ${why}`);
  results.push({ name, state: 'skip' });
}

const have = cmd => { try { execSync(cmd, { stdio: 'ignore' }); return true; } catch { return false; } };

console.log('\nChecking SPEC\n');

// ── The parts that need nothing ──────────────────────────────────────────────────────────────────
console.log('The code itself');
step('types', 'every screen still fits together', () => {
  run('npx tsc --noEmit');
  return null;
});
step('tests', 'the rules SPEC runs on', () => {
  const out = run('npx vitest run --reporter=dot 2>&1');
  const m = out.match(/Tests\s+(\d+) passed/);
  return m ? `${m[1]} checks` : null;
});
/*
  Reported, never failed.

  An incomplete design set is a fact about what was exported from Claude Design — it says nothing
  about whether the product works. Failing here would tell somebody their business is broken
  because a designer renamed a screen, which is both untrue and the fastest way to teach them to
  ignore the whole check.
*/
const designs = (() => {
  try {
    const out = run('node scripts/design-check.mjs');
    return (out.match(/(COMPLETE|INCOMPLETE)[^\n]*/) ?? [null])[0];
  } catch { return null; }
})();
console.log(`  ${designs?.startsWith('COMPLETE') ? '✓' : 'ℹ'} the designs are all here — ${designs ?? 'could not tell'}`);

// ── The database ─────────────────────────────────────────────────────────────────────────────────
console.log('\nThe database');
const dbUrl = process.env.DATABASE_URL;
// Configured but not running is "could not check", never "broken". Telling somebody their
// security is broken because their laptop's database is asleep is a lie with consequences.
const dbUp = dbUrl && have(`psql "${dbUrl}" -c "select 1" 2>/dev/null`);

if (!dbUrl) {
  skip('rls', 'one business cannot see another', 'no database is configured here');
} else if (!have('command -v psql')) {
  skip('rls', 'one business cannot see another', 'psql is not installed');
} else if (!dbUp) {
  skip('rls', 'one business cannot see another', 'the database is not running');
} else {
  step('rls', 'one business cannot see another', () => {
    const out = run('node scripts/check-rls.mjs');
    if (/FAIL/.test(out)) throw new Error(out);
    const m = out.match(/every tenant table has a policy \(([^)]+)\)/);
    return m ? m[1] : null;
  });
}

// ── The ways in ──────────────────────────────────────────────────────────────────────────────────
console.log('\nThe ways in, and the one way out of bounds');
const APP = process.env.APP_URL ?? 'http://localhost:3000';
const serving = (() => {
  try {
    execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '4', `${APP}/`], { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

/*
  Find a browser, rather than assuming Playwright's.

  This check said SOMETHING IS BROKEN — 3 of 7 checks failed, and nothing was broken: the machine
  had Chromium installed somewhere Playwright does not look, so three journeys crashed before they
  reached the product. That is the same cry-wolf failure this file has now had three times, and it
  is the worst kind, because the whole point of one command is that its verdict can be trusted
  without reading the detail.

  So: look where browsers actually live, hand the journeys the path, and when there is genuinely no
  browser say so as a SKIP. "I could not check this" and "this is broken" are different sentences
  and only one of them should make somebody's stomach drop.
*/
function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const path = join(root, dir, rel);
        if (existsSync(path)) return path;
      }
    }
  }
  // Playwright's own copy, wherever it keeps it. Silence, not an error, when it has none.
  try {
    const path = execSync('node -e "console.log(require(\'playwright\').chromium.executablePath())"', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (path && existsSync(path)) return path;
  } catch { /* no playwright, or no browser downloaded — handled by the caller */ }
  return null;
}

const browser = findBrowser();

const JOURNEYS = [
  ['look', 'looking around, then signing up', 'journey'],
  ['front', 'a stranger types a problem on the front door', 'frontdoor-journey'],
  ['register', 'logging a problem once inside', 'register-journey'],
  ['seat', 'somebody you invited taking their seat', 'seat-journey'],
  ['cockpit', 'your own cockpit staying private', 'cockpit-journey'],
];

if (!serving) {
  for (const [id, what] of JOURNEYS) skip(id, what, `nothing is running at ${APP}`);
} else if (!browser) {
  for (const [id, what] of JOURNEYS) skip(id, what, 'there is no browser on this machine to drive');
} else {
  for (const [id, what, script] of JOURNEYS) {
    /*
      The sign-up throttle is not a broken product.

      Every journey here signs somebody up, so a few runs back to back trip SPEC's own protection
      against a flood of accounts from one address — and the run then reports SOMETHING IS BROKEN
      about a safeguard doing exactly its job. That is the cry-wolf failure this file has already
      had three times, and the verdict is the whole value of the command. So it is reported as a
      skip, in words that say what to do: wait.
    */
    const out = (() => {
      try {
        return run(`node scripts/${script}.mjs`, { env: { ...process.env, CHROME_PATH: browser } });
      } catch (error) {
        return String(error.stdout || error.stderr || error.message);
      }
    })();

    if (/error=busy/.test(out)) {
      skip(id, what, 'SPEC\u2019s own sign-up throttle is holding, which it should. Wait a few minutes and run this again');
      continue;
    }

    step(id, what, () => {
      if (/FAIL|check\(s\) failed/.test(out)) throw new Error(out.split('\n').filter(l => l.startsWith('FAIL')).join(' '));
      const n = (out.match(/^ok /gm) ?? []).length;
      return n ? `${n} checks` : null;
    });
  }
}

/*
  ── And is any of it actually live? ──────────────────────────────────────────────────────────────

  Everything above tests the code ON THIS MACHINE. All of it can pass while the site customers use
  runs something else entirely — a build that failed, a commit never pushed, work sitting uncommitted
  in this folder. That gap is not theoretical: this product once spent twenty-five commits behind
  its own repository with nobody aware of it.

  So the last line of the one command that answers "is SPEC working" also answers "where". It asks
  GitHub what became of this commit, which needs no access to the live site — deliberately, because
  the check has to work from every machine this is run on, not just the ones allowed to reach it.

  Reported, never counted. A local check suite has no business failing because a deploy is mid-build.
*/
console.log('\nAnd on the live site');
try {
  const out = execSync('node scripts/deployed.mjs', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`  ✓ ${(out.match(/^ {2}LIVE — .*/m) ?? ['live, but it did not say so'])[0].trim()}`);
} catch (error) {
  const out = String(error.stdout || error.stderr || '');
  const verdict = out.match(/^ {2}(NOT PUSHED|FAILED|BUILDING|WAITING|UNKNOWN) — .*/m);
  console.log(`  ! ${verdict ? verdict[0].trim() : 'could not tell whether this commit is deployed'}`);
  console.log('    Run  npm run deployed  for the detail. Nothing above is affected by this.');
}

// ── The verdict ──────────────────────────────────────────────────────────────────────────────────
const failed = results.filter(r => r.state === 'fail');
const skipped = results.filter(r => r.state === 'skip');
const passed = results.filter(r => r.state === 'pass');
const seconds = Math.round((Date.now() - t0) / 1000);

console.log(`\n${'─'.repeat(60)}`);
if (failed.length) {
  console.log(`SOMETHING IS BROKEN — ${failed.length} of ${results.length - skipped.length} checks failed.`);
  console.log('The lines marked ✗ above say which. Nothing else is affected.');
} else if (skipped.length) {
  console.log(`WORKING — everything that could be checked here passed (${passed.length} of ${passed.length}).`);
  // The reason is printed against each skipped line, and they are not all the same reason — a
  // sleeping database and a throttle doing its job are different things. Naming one of them here
  // would be wrong about the others.
  console.log(`${skipped.length} could not be checked — each line above says why.`);
} else {
  console.log(`WORKING — all ${passed.length} checks passed.`);
}
console.log(`Took ${seconds}s.`);
console.log(`${'─'.repeat(60)}\n`);

process.exit(failed.length ? 1 : 0);
