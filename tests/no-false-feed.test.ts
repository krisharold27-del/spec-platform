import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * SPEC must not say a number arrived on its own until one does.
 *
 * ── What was found on 18 September ───────────────────────────────────────────────────────────────
 *
 * My Page carried a block headed **"Numbers arriving on their own"**, beside a count of systems
 * **connected**, with **"last read <date>"** under each one.
 *
 * None of it was happening. `connectSystem` writes a row and `markLive` is an administrator pressing
 * a button, which sets the status to live and stamps `lastSyncAt` with the moment of the press.
 * There is no OAuth anywhere in this repository, no request to a vendor and no data. The date was
 * when somebody clicked.
 *
 * It mattered less while the block sat behind the Advanced tier. Removing the tiers put it in front
 * of every business, which is how it surfaced — a lie widened by a change meant to be generous.
 *
 * ── Why a test, and what it is really protecting ─────────────────────────────────────────────────
 *
 * The connector is the biggest thing still to build, and the brief is explicit that the first
 * "link Xero and bang" moment decides whether a customer believes the rest of the product. Between
 * now and then there is a standing temptation to describe the destination rather than the position,
 * because the destination is the better sentence.
 *
 * So the words that promise a fetch are banned from the screens until a fetch exists. `EVIDENCE`
 * below is what would prove one does: an OAuth exchange or a request to a vendor. When that lands,
 * this test starts allowing the wording again on its own — it is a ratchet, not a padlock.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** What a real connector looks like in source. Any of these and the ban lifts. */
const EVIDENCE = [
  /oauth2?\b/i,
  /grant_type/,
  /https:\/\/[a-z.]*(xero|myob|simpro|aroflo|hubspot)\.com/i,
];

const files = walk(SRC).filter(p => ['.ts', '.tsx'].includes(extname(p)));
const source = files.map(p => readFileSync(p, 'utf8'));

/** Comments stripped: a note EXPLAINING that the product does not fetch is not a claim that it does. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/*
  ── Stripped before the EVIDENCE scan too, and that is not a detail ──────────────────────────────

  The first version of this file tested EVIDENCE against the raw source. The comment on My Page
  explaining the situation contains the sentence "There is no OAuth anywhere in this repository" —
  which matched /oauth/i, set `connectorExists` to true, and switched every ban below off.

  Proven by putting the banned wording back: all four checks passed. A check that cannot fail is
  worse than no check, because it is also a claim that somebody is watching. This codebase has been
  caught by prose-instead-of-code five times; this was the sixth, and it was in the check written to
  stop the fifth.
*/
const connectorExists = source.some(text => EVIDENCE.some(re => re.test(code(text))));

describe('no screen claims a number arrived on its own', () => {
  /*
    Written out one by one rather than looped.

    `tests/readiness.test.ts` and `tests/cockpit.test.ts` both count the tests in this repository by
    reading `it(` out of the source, and two documents print that number. A loop declares one `it`
    and runs three, so looping here would quietly make both of those documents wrong by two — a
    check that breaks a different check's honesty to save four lines.
  */
  const guiltyOf = (pattern: RegExp) =>
    connectorExists
      ? []                                // a real connector exists now — the wording is earned
      : files
          .map((path, i) => [path, code(source[i])] as const)
          .filter(([, text]) => pattern.test(text))
          .map(([path]) => path.replace(`${process.cwd()}/`, ''));

  it('never says "last read"', () => {
    // `lastSyncAt` is stamped when an administrator presses Mark live. It is the time of a click.
    const guilty = guiltyOf(/last read/i);
    expect(guilty, `Found in: ${guilty.join(', ')}`).toEqual([]);
  });

  it('never says numbers are "arriving on their own"', () => {
    const guilty = guiltyOf(/arriving on their own/i);
    expect(guilty, `Found in: ${guilty.join(', ')}`).toEqual([]);
  });

  it('nor "arrive on their own", which is the same claim said the other way round', () => {
    const guilty = guiltyOf(/arrive on their own/i);
    expect(guilty, `Found in: ${guilty.join(', ')}`).toEqual([]);
  });

  it('AND THE BAN LIFTS BY ITSELF once a connector is built', () => {
    /*
      The check that stops this becoming a padlock. If somebody builds the Xero connection and this
      test still fails, they would delete it rather than fix it — and the ban would take the honest
      wording with it. So the escape is asserted, not assumed.
    */
    expect(EVIDENCE.length).toBeGreaterThan(0);
    expect(EVIDENCE.some(re => re.test('await fetch("https://api.xero.com/connections")'))).toBe(true);
    expect(EVIDENCE.some(re => re.test('grant_type=authorization_code'))).toBe(true);
  });
});
