/*
  The hard rule, as a check.

  Kris, 26 September: *"time to start being careful - you're removing things and you need to stop -
  do not remove functions - unless i tell you to - make this a hard rule."*

  Every rule in this codebase that actually holds is a check. A rule that lives in a sentence is a
  rule right up until somebody is mid-refactor and certain that nothing uses this.

  The asymmetry is the point, and it runs in one direction only:

    ADDING is free and silent. `npm run surface -- --write`, carry on.
    REMOVING fails, by name, and the only way past is Kris saying so and a dated line in
    docs/REMOVED.md.

  Note what this deliberately does NOT check: whether anything calls the export. "Nothing uses it"
  is exactly the reasoning that deletes something a customer reached through a route nobody
  grepped for, and it is the reasoning this file exists to interrupt.
*/
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { surface, recorded, vanished, LEDGER, REMOVALS } from '../scripts/surface.mjs';

describe('nothing leaves the product quietly', () => {
  it('KEEPS EVERY EXPORT THE LEDGER SAYS WE HAVE, unless Kris said to drop it', () => {
    const gone = vanished(surface());
    expect(
      gone,
      `${gone.length} export${gone.length === 1 ? ' has' : 's have'} stopped existing:\n\n` +
        `${gone.map(n => `  ${n}`).join('\n')}\n\n` +
        `If that was not deliberate, put ${gone.length === 1 ? 'it' : 'them'} back.\n` +
        `If Kris asked for ${gone.length === 1 ? 'it' : 'them'} to go, add a dated line for each ` +
        `to ${REMOVALS} — with who said so, in their words — and re-run \`npm run surface -- --write\`.`,
    ).toEqual([]);
  });

  it('has a ledger at all, with real content in it', () => {
    /* A check whose failure mode is silence is worse than no check: an empty or missing ledger
       would pass the test above for ever while guarding nothing. */
    const list = recorded();
    expect(list.length, `${LEDGER} is empty or missing — run \`npm run surface -- --write\``).toBeGreaterThan(500);
    expect(list.every(l => / :: /.test(l)), `${LEDGER} has lines that are not \`path :: name\``).toBe(true);
  });

  it('catches a removal — proved by taking something out', () => {
    /* Proved by putting the fault back. If this ever passes trivially, the rule is decoration. */
    const list = surface().filter(n => n !== 'src/lib/people.ts :: clearToWork');
    expect(vanished(list)).toContain('src/lib/people.ts :: clearToWork');
  });

  it('is not fooled by a name that merely appears somewhere in REMOVED.md', () => {
    /* The escape hatch has to be narrow, or it is not an escape hatch, it is a door. Somebody
       writing "we should look at clearToWork one day" must not thereby license deleting it: the
       match is the whole `path :: name`. */
    const without = surface().filter(n => n !== 'src/lib/people.ts :: clearToWork');
    expect(vanished(without, 'one day we should revisit clearToWork'))
      .toContain('src/lib/people.ts :: clearToWork');
    expect(vanished(without, '- 2026-09-26 — `src/lib/people.ts :: clearToWork` — Kris said so'))
      .not.toContain('src/lib/people.ts :: clearToWork');
  });

  it("has a removals log whose worked example cannot itself unlock anything", () => {
    /* REMOVED.md has to show the format, and the format is the unlock string. So the example has
       to name something that does not exist and never will. */
    const said = readFileSync(REMOVALS, 'utf8');
    const now = new Set(surface());
    for (const m of said.matchAll(/([\w./-]+ :: [\w$]+)/g)) {
      expect(now.has(m[1]), `${REMOVALS} shows \`${m[1]}\` as an example, but that is a real export`).toBe(false);
    }
  });

  it('WRITING THE LEDGER CANNOT BE THE WAY TO LOSE SOMETHING FROM IT', () => {
    /* The obvious way this rule dies: the check goes red, somebody re-runs `--write` until it goes
       green, and nobody ever reads the names that went. `--write` refuses instead. */
    const script = readFileSync('scripts/surface.mjs', 'utf8');
    expect(script).toContain('Refusing to write');
    expect(script).toContain('process.exit(1)');
  });
});
