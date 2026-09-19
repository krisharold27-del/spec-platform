import { describe, it, expect } from 'vitest';
import { mayShapeChart } from '../src/lib/scope';

/**
 * ── The founder must not be locked out of their own chart ────────────────────────────────────────
 *
 * Kris, 19 September: *"I still cant change my name in the org chart"*, and then *"i should be the
 * admin as i started the system - Kristopher Harold for JBI"*. Both were the same fault.
 *
 * SPEC decides what somebody may touch by walking DOWN from their own role — the rule the whole
 * product is sold on, and correct. It quietly assumes everybody IS on the chart. An administrator
 * holding no role has nothing to walk down from, so their scope is empty: not one card on the
 * chart can be changed, including the one they should be sitting in, and the only way out is the
 * thing they are locked out of. On day one, the founder of the business is exactly that person.
 *
 * ── Why this is its own rule and not a loosening of `canEdit` ────────────────────────────────────
 *
 * `canEdit` also gates scorecards, KPIs and training — other people's numbers. Widening it so a
 * founder could draw their chart would have handed every administrator a key to all of that, which
 * is the opposite of what SPEC promises. So the chart got its own question, and this holds the line
 * between them: each clause is removed in turn below, and each removal has to break something.
 */

const VISIBLE = new Set(['mine', 'below']);
const ours = (id: string) => ['mine', 'below', 'elsewhere'].includes(id);

describe('who may draw the org chart', () => {
  it('the ordinary rule: your own role and the ones beneath it', () => {
    expect(mayShapeChart('full', 'mine', VISIBLE, ours, 'mine')).toBe(true);
    expect(mayShapeChart('full', 'mine', VISIBLE, ours, 'below')).toBe(true);
  });

  it('and never somebody else’s branch', () => {
    expect(mayShapeChart('full', 'mine', VISIBLE, ours, 'elsewhere')).toBe(false);
    expect(mayShapeChart('administrator', 'mine', VISIBLE, ours, 'elsewhere')).toBe(false);
  });

  it('AN ADMINISTRATOR WITH NO ROLE CAN DRAW THE CHART — the founder on day one', () => {
    expect(mayShapeChart('administrator', null, new Set(), ours, 'mine')).toBe(true);
    expect(mayShapeChart('administrator', null, new Set(), ours, 'elsewhere')).toBe(true);
  });

  /*
    Each of these is one clause of the rule taken away. If any of them starts passing, the founder's
    exemption has quietly become something else.
  */
  it('  but only an ADMINISTRATOR — "full" with no role still gets nothing', () => {
    expect(mayShapeChart('full', null, new Set(), ours, 'mine')).toBe(false);
  });

  it('  and only while they are UNPLACED — once on the chart, the ordinary rule returns', () => {
    expect(mayShapeChart('administrator', 'mine', VISIBLE, ours, 'elsewhere')).toBe(false);
  });

  it('  and never a role outside this business', () => {
    expect(mayShapeChart('administrator', null, new Set(), ours, 'another-company')).toBe(false);
  });

  it('  and read-only is still read-only', () => {
    expect(mayShapeChart('readonly', null, new Set(), ours, 'mine')).toBe(false);
    expect(mayShapeChart('readonly', 'mine', VISIBLE, ours, 'mine')).toBe(false);
  });
});
