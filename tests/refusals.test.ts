import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A refusal is a sentence. A fault is a crash. They are not the same thing ─────────────────────
 *
 * Kris, 18 September, renaming a role on JBI: *"when changing a name on the org chart it did this"*
 * — and a screenshot of **"This page did not load. Something went wrong on our end."**
 *
 * Nothing had gone wrong. The server had correctly refused, and it refused by `throw`ing, which
 * renders the generic fault screen. There were **thirty-nine** of these across the product — every
 * guard on the org chart, People, Monthly scoring, a scorecard, the KPI screen — and each carried a
 * sentence worth reading that could never reach a screen:
 *
 *   "Only the top of the org chart signs the month"
 *   "Move the person out of that role first — removing it would lose their placement"
 *   "You can only set KPIs for your own role and the roles beneath it"
 *
 * Every one of them told a customer the product was broken instead.
 *
 * The rule already existed for exactly one case. `scripts/org-journey.mjs` asserts that removing an
 * occupied role is *"REFUSED IN WORDS ... and not with a fault screen"* — and it passed, because
 * the BROWSER checks that one case before asking. So the check was proving the client's manners
 * while thirty-eight other routes to a refusal produced the crash page. A check that covers one
 * instance of a class is how a class of fault survives.
 *
 * This holds the whole class: a server action may not `throw` a message meant for a person. It
 * refuses with `refuseTo`, which sends the reason back to the screen — see lib/refuse.
 */

const ACTIONS = 'src/app/';

/** Every `actions.ts` under src/app, at any depth. */
function actionFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) actionFiles(path, found);
    else if (name === 'actions.ts') found.push(path);
  }
  return found;
}

describe('saying no to somebody', () => {
  const files = actionFiles(ACTIONS);

  it('finds the action files at all, so this cannot pass by looking at nothing', () => {
    expect(files.length).toBeGreaterThan(6);
  });

  /*
    The exemption is deliberate and narrow.

    `assertWritable` and the guards in lib/guard throw, and should: a lapsed business or a signed-out
    request is not a refusal to explain on the page, it is a redirect somewhere else entirely, and
    those paths have their own handling. What this bans is a SENTENCE — a message written for a
    person — being delivered as an exception.
  */
  it('NO SERVER ACTION THROWS A MESSAGE MEANT FOR A PERSON', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes("'use server'")) continue;
      for (const [i, line] of source.split('\n').entries()) {
        // A thrown Error carrying prose is a refusal wearing a fault's clothes.
        if (/throw new Error\(\s*['"`]/.test(line)) offenders.push(`${file}:${i + 1} ${line.trim().slice(0, 70)}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('and the ones that refuse do it through lib/refuse, so every screen answers the same way', () => {
    const refusing = files.filter(f => readFileSync(f, 'utf8').includes('refuseTo('));
    expect(refusing.length).toBeGreaterThan(4);
    for (const file of refusing) {
      expect(readFileSync(file, 'utf8'), `${file} calls refuseTo without importing it`)
        .toMatch(/from '@\/lib\/refuse'/);
    }
  });

  /*
    And the screen has to print it, or the reason is in the address and nowhere a person looks.
    Checked against the page beside each action file, which is the screen `refuseTo` names.
  */
  it('and every screen that refuses shows the reason', () => {
    const silent: string[] = [];
    for (const file of files) {
      if (!readFileSync(file, 'utf8').includes('refuseTo(')) continue;
      const page = file.replace(/actions\.ts$/, 'page.tsx');
      let source: string;
      try { source = readFileSync(page, 'utf8'); } catch { continue; }
      if (!source.includes('<Refused')) silent.push(page);
    }
    expect(silent, `${silent.join(', ')} refuse but never say why`).toEqual([]);
  });
});
