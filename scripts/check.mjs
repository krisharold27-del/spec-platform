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

import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const t0 = Date.now();
const results = [];

/*
  ── Settings this command needs, wherever they live ──────────────────────────────────────────────

  Next.js reads .env.local. A script run outside Next does not, so this command used to announce
  "no database is configured here" while a perfectly good database sat in that file four lines from
  the top. A check that cannot find what it is checking reports a gap that does not exist, and a
  person who is told that twice stops believing the next thing it says.

  Never overrides a real environment variable: on a deploy those are the truth, and a local file has
  no business outranking them.
*/
function loadLocalEnv() {
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key] === undefined) process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local is the ordinary case on a deploy and in CI.
  }
}
loadLocalEnv();

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

/*
  How old are the designs these numbers are measured against?

  There is no live connection to Claude Design — designs/ is a snapshot. So every number below can
  read 100% while being 100% against a set that is weeks old, which is the worst kind of green: not
  wrong, just answering a question nobody asked. It has already happened once, with eighteen of
  twenty-one screens a day behind and the cockpit reading 100%.

  Dated from the last commit that CHANGED a design file, because file timestamps are whatever the
  clone happened to write. Nothing is failed on it: an old design set is a fact about what was sent,
  not a fault in the code. It just can never again be invisible.
*/
const designAge = (() => {
  try {
    const at = run('git log -1 --format=%ct -- designs/').trim();
    if (!at) return null;
    return Math.floor((Date.now() / 1000 - Number(at)) / 86400);
  } catch { return null; }
})();
if (designAge !== null) {
  const how = designAge === 0 ? 'today' : designAge === 1 ? 'yesterday' : `${designAge} days ago`;
  console.log(
    `  ${designAge <= 2 ? '✓' : '!'} those designs last changed ${how}` +
    `${designAge > 2 ? ' — send the project again from Claude Design if you have worked on it since (npm run designs:pull)' : ''}`,
  );
}

/*
  And does the product SAY what they say?

  A complete set of designs and a product that does not carry their wording are two different
  questions, and only the first was on this page. Somebody asking "are the code and the designs
  linked?" is asking the second one, and had to go and run another command to find out.

  Both tiers, because they answer different things: headings and buttons is the clean number, every
  label is the noisy one that once found three whole features missing.
*/
const coverage = (label, args) => {
  try {
    const out = run(`node scripts/design-coverage.mjs ${args}`);
    return (out.match(/(\d+) of (\d+) design phrases[^\n]*/) ?? [null])[0];
  } catch (error) {
    const out = String(error.stdout ?? '');
    return (out.match(/(\d+) of (\d+) design phrases[^\n]*/) ?? [null])[0];
  }
};
for (const [label, args] of [['headings and buttons', ''], ['every label', '--deep']]) {
  const line = coverage(label, args);
  const hit = line?.match(/\((\d+)%\)/);
  console.log(`  ${hit?.[1] === '100' ? '✓' : 'ℹ'} the product says what they say (${label}) — ${line ?? 'could not tell'}`);
}

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

const curlOk = (url, seconds = 4) => {
  try {
    execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', String(seconds), url], { stdio: 'ignore' });
    return true;
  } catch { return false; }
};

/**
 * What the app says about itself. Null when it cannot be asked.
 *
 * /api/health lists exactly which settings are missing, which is how this command can tell the
 * difference between "the product is broken" and "the app in front of me was started without the
 * settings these journeys need" — two sentences that used to produce the same four red lines.
 */
function healthOf(base) {
  try {
    return JSON.parse(execFileSync('curl', ['-fsS', '--max-time', '20', `${base}/api/health`], { encoding: 'utf8' }));
  } catch { return null; }
}

/*
  ── Standing up what the journeys need, rather than hoping somebody already did ──────────────────

  Every journey below signs somebody up, and sign-up talks to the authentication provider. Point the
  app at a provider that is not there and sign-up fails honestly with "that is our end, not yours" —
  correct product behaviour, and indistinguishable, from out here, from the product being broken.

  It was reported as the latter. Four journeys failed, the verdict read SOMETHING IS BROKEN, and
  nothing was: the dev server on this machine had simply been started without the two Supabase
  settings. That is the cry-wolf failure this file has now had four times, and it is the one that
  matters most, because the whole value of one command is a verdict you can trust without reading
  the detail.

  So this command now brings up its own stack when the one in front of it is not wired for this:
  scripts/fake-auth on a spare port, and the app beside it, both torn down at the end. Nothing
  test-only ships — fake-auth speaks enough of the provider's HTTP API that the real client talks to
  it unmodified, which is the same arrangement CI uses.

  If it cannot — no database, no browser — it says so as a SKIP. "I could not check this" and "this
  is broken" are different sentences and only one of them should make somebody's stomach drop.
*/
const started = [];
function stopStack() {
  for (const child of started.splice(0)) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}
process.on('exit', stopStack);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopStack(); process.exit(130); });

function spawnQuiet(cmd, args, env) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: true });
  started.push(child);
  return child;
}

function waitFor(url, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (curlOk(url, 5)) return true;
    try { execSync('sleep 1'); } catch { /* keep waiting */ }
  }
  return false;
}

/** Bring up fake-auth and the app, wired together. Returns the base URL, or null if it could not. */
function standUpStack(dbUrl) {
  const authPort = 54321;
  const appPort = 3100;
  const base = `http://localhost:${appPort}`;

  if (!curlOk(`http://127.0.0.1:${authPort}/auth/v1/user`, 3)) {
    spawnQuiet('node', ['scripts/fake-auth.mjs', String(authPort)], { NODE_ENV: 'test' });
    // fake-auth answers 401 on that route, which curl -f treats as a failure, so poll for the
    // socket being open rather than for a 2xx.
    const until = Date.now() + 20_000;
    let up = false;
    while (Date.now() < until && !up) {
      try {
        execFileSync('curl', ['-sS', '-o', '/dev/null', '--max-time', '3', `http://127.0.0.1:${authPort}/auth/v1/user`], { stdio: 'ignore' });
        up = true;
      } catch { try { execSync('sleep 1'); } catch { /* keep waiting */ } }
    }
    if (!up) return null;
  }

  spawnQuiet('npx', ['next', 'dev', '-p', String(appPort)], {
    DATABASE_URL: dbUrl,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    APP_URL: base,
    NODE_ENV: 'test',
  });
  return waitFor(`${base}/`, 120) ? base : null;
}

/*
  Prefer an app that is already running and properly wired — somebody with `npm run dev` open should
  not wait for a second copy to boot. Otherwise stand one up.
*/
let APP = process.env.APP_URL ?? 'http://localhost:3000';
let serving = curlOk(`${APP}/`);
let wiringNote = null;

if (serving) {
  const health = healthOf(APP);
  const missing = health?.missing ?? [];
  if (missing.length) {
    serving = false;
    wiringNote = `the app at ${APP} was started without ${missing.join(' and ')}`;
  }
}

if (!serving && dbUp) {
  process.stdout.write('  … starting an app of my own for these');
  const own = standUpStack(process.env.DATABASE_URL);
  if (own) {
    APP = own;
    serving = true;
    process.stdout.write(`\r  ✓ started an app of my own on ${own}${wiringNote ? ` — ${wiringNote}` : ''}\n`);
  } else {
    process.stdout.write(`\r  – could not start an app of my own\n`);
  }
}

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
  // Playwright's own copy, wherever it keeps it — and only if it is really there. It reports the
  // path of the build it WANTS, which on a machine carrying a different one does not exist; taking
  // its word for that crashed every journey before they reached the product.
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
  const why = wiringNote
    ? `${wiringNote}, and a replacement could not be started${dbUp ? '' : ' because there is no database here'}`
    : dbUp ? `nothing is running at ${APP}, and one could not be started` : 'there is no database here to run them against';
  for (const [id, what] of JOURNEYS) skip(id, what, why);
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
        // The address is passed explicitly. Every journey defaults to :3000, so when this command
        // has stood up its own app on another port they would all have driven at whatever happened
        // to be on :3000 instead — or at nothing.
        return run(`node scripts/${script}.mjs ${APP}`, {
          env: { ...process.env, CHROME_PATH: browser, APP_URL: APP },
        });
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
