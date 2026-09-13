import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROBLEMS, ALL_PROBLEMS, type Problem } from '../src/lib/problems';

/*
  ── The argument, held to the designs ────────────────────────────────────────────────────────────

  SPEC's differentiator is not a feature. It is that a business's problems keep happening, and that
  solving them starts with the people. The designs carry that as twenty-four Before/After pairs on
  the eight screens where each problem actually gets fixed, and the product carried none of them —
  a customer saw the software and never saw the thinking.

  The wording now lives in lib/problems and is rendered from there. That creates a new way to be
  wrong: the designs say one thing and the product says something slightly different, which for a
  differentiator is worse than saying nothing. So these read the design files themselves.
*/

const DESIGNS = join(__dirname, '..', 'designs');

/** Every design file's text, with entities unescaped enough to compare sentences. */
function designText(): string {
  return readdirSync(DESIGNS)
    .filter(f => f.endsWith('.dc.html'))
    .map(f => readFileSync(join(DESIGNS, f), 'utf8'))
    .join('\n')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ');
}

const designs = designText();

describe('the problems SPEC says it solves', () => {
  it('carries all twenty-four, across the eight screens that fix them', () => {
    expect(ALL_PROBLEMS).toHaveLength(24);
    expect(Object.keys(PROBLEMS)).toHaveLength(8);
    for (const set of Object.values(PROBLEMS)) {
      expect(set.problems.length, `${set.screen} should carry three`).toBe(3);
    }
  });

  /*
    The one that matters. Every sentence shown to a customer must be the sentence the design
    agreed, not a paraphrase somebody improved on the way through.
  */
  it('uses the designs’ own wording, not a rewrite of it', () => {
    const drifted: string[] = [];
    for (const p of ALL_PROBLEMS) {
      for (const [what, text] of Object.entries(p) as [keyof Problem, string][]) {
        if (!designs.includes(text)) drifted.push(`${p.problem} — the ${what} line is not in any design`);
      }
    }
    expect(drifted, drifted.join('\n')).toEqual([]);
  });

  /*
    A "before" that reads as a fault and an "after" that reads as a promise is marketing. The
    after has to name a MECHANISM — what the software actually does — or the claim is empty.
  */
  it('never states a problem without stating what is done about it', () => {
    for (const p of ALL_PROBLEMS) {
      expect(p.problem.length, p.problem).toBeGreaterThan(10);
      expect(p.before.length, `${p.problem} — before`).toBeGreaterThan(30);
      expect(p.after.length, `${p.problem} — after`).toBeGreaterThan(40);
      expect(p.after, `${p.problem} — after must not merely promise`).not.toMatch(/\bwe (will|can|aim)\b/i);
    }
  });

  it('points every screen at a route the product serves', () => {
    for (const set of Object.values(PROBLEMS)) {
      expect(set.route, set.screen).toMatch(/^\/[a-z-]+$/);
    }
  });

  /*
    People first, and demonstrably so — the same rule FIX_ORDER holds in the engine.

    Most of these arrive dressed as a numbers or a process problem, and every one of them is about
    somebody: what they are expected to do, whether anyone told them, and whether it was written
    down. If this set ever stops being about people, SPEC has become a dashboard.
  */
  it('is about people, which is the whole argument', () => {
    const aboutPeople = ALL_PROBLEMS.filter(p =>
      /\b(people|person|nobody|somebody|someone|manager|manage|leader|everyone|anybody|performs?|performance|culture|grievance|conversation|taught|trained|training|quits?|leave|resignation|burnout|step up|holding)\b/i
        .test(`${p.problem} ${p.before} ${p.after}`));
    expect(aboutPeople.length / ALL_PROBLEMS.length).toBeGreaterThan(0.8);
  });
});
