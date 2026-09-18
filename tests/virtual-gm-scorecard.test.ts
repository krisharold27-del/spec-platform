import { describe, it, expect } from 'vitest';
import templates from '../seed/criteria_templates.json';

/**
 * The scorecard the first person gets, before they have done anything.
 *
 * Kris, 18 September: *"i told you already the first person should have boilerplate kpis in the
 * system as the virtual gm"* — and then, in the brief that followed, exactly which eight.
 *
 * ── Why this is held by a test and not just written in a seed file ───────────────────────────────
 *
 * These eight are the product's central argument made measurable. The pitch is *"don't pay three
 * hundred thousand for a GM"*, and the thing that has to make that felt rather than claimed is that
 * somebody signs up and a real scorecard is already there — **never a blank one**. A seed file is
 * the easiest place in this repository for that to quietly rot: nothing renders it, nothing fails
 * when it changes, and the only person who would notice is a customer on their first morning.
 *
 * So the wording is not held — Kris will keep improving it, and he should — but the SHAPE is:
 * eight, two per pillar, every one of them a KPI, weights that add up, and the specific commitments
 * he named. Each check says which of his sentences it is protecting.
 */

type Criterion = { text: string; weight: number; kpi?: boolean; target?: string };
type Role = { template_id: string; criteria: Record<string, Criterion[] | 'organisational_standard'> };

const roles = templates.roles as unknown as Role[];
const gm = roles.find(r => r.template_id === 'gm')!;
const standard = (templates.organisational_standard as unknown as Record<string, Criterion[]>);

/** The GM's four pillars, with the shared safety block resolved the way `provision.ts` resolves it. */
const pillarsOf = (role: Role) =>
  Object.fromEntries(
    Object.entries(role.criteria).map(([pillar, list]) => [
      pillar,
      list === 'organisational_standard' ? standard[pillar] : list,
    ]),
  ) as Record<string, Criterion[]>;

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

describe('the virtual GM arrives with a scorecard', () => {
  const gmPillars = pillarsOf(gm);

  it('NEVER A BLANK SCORECARD — two per pillar, eight in all', () => {
    for (const p of PILLARS) {
      expect(gmPillars[p], `no ${p} criteria on the GM`).toBeTruthy();
      expect(gmPillars[p]).toHaveLength(2);
    }
    expect(PILLARS.flatMap(p => gmPillars[p])).toHaveLength(8);
  });

  it('and every one of them is a KPI, not a note', () => {
    // A criterion that is not a KPI is a thing somebody is judged on with no number behind it.
    for (const p of PILLARS) for (const c of gmPillars[p]) expect(c.kpi, `${p}: ${c.text}`).toBe(true);
  });

  it('the weights in each pillar add to 100%', () => {
    for (const p of PILLARS) {
      const total = gmPillars[p].reduce((a, c) => a + c.weight, 0);
      expect(total, `${p} weights`).toBeCloseTo(1, 5);
    }
  });

  it('SAFETY is zero harm and zero workers compensation', () => {
    const texts = gmPillars.safety.map(c => c.text.toLowerCase());
    expect(texts.some(t => /zero (incidents|harm)/.test(t)), texts.join(' | ')).toBe(true);
    expect(texts.some(t => /workers comp/.test(t)), texts.join(' | ')).toBe(true);
    // Both are absolutes. A target of anything but zero would be a different commitment.
    for (const c of gmPillars.safety) expect(c.target).toBe('0');
  });

  it('PEOPLE is trained for the role, and a culture nobody leaves', () => {
    const texts = gmPillars.people.map(c => c.text.toLowerCase());
    expect(texts.some(t => /trained/.test(t) && /role/.test(t)), texts.join(' | ')).toBe(true);
    // "reviewed against the org chart" is the half that makes it answerable rather than a feeling.
    expect(texts.some(t => /org chart/.test(t)), texts.join(' | ')).toBe(true);
    expect(texts.some(t => /culture/.test(t) && /leave/.test(t)), texts.join(' | ')).toBe(true);
  });

  it('EARNINGS is profitable, and the financial systems are fit for purpose', () => {
    const texts = gmPillars.earnings.map(c => c.text.toLowerCase());
    expect(texts.some(t => /profitab/.test(t)), texts.join(' | ')).toBe(true);
    /*
      The second one is the easiest of the eight to lose, because it is the only one that is not a
      number. It is also the one that pays for the other seven: a business whose financial systems
      do not support it cannot answer any of the rest honestly.
    */
    expect(texts.some(t => /financial system/.test(t) && /fit for purpose/.test(t)), texts.join(' | ')).toBe(true);
  });

  it('COMPLIANCE is the contracts, and people doing as they say', () => {
    const texts = gmPillars.compliance.map(c => c.text.toLowerCase());
    expect(texts.some(t => /contract/.test(t)), texts.join(' | ')).toBe(true);
    expect(texts.some(t => /as they said|as you say|do what they/.test(t)), texts.join(' | ')).toBe(true);
  });
});

describe('two per pillar is a foundation, not a cap', () => {
  it('THE KPI SCREEN ALWAYS OFFERS A SPARE ROW', () => {
    /*
      Kris: *"Users can ADD as many KPIs per quadrant as they like."* The screen used to pad up to
      two blank rows and stop, so a pillar that already had its two had nowhere to type a third —
      a business could not measure something it had decided mattered. `Math.max(1, ...)` is the
      whole fix, and it is the kind of character that gets "tidied" back.
    */
    const src = require('node:fs').readFileSync('src/app/setup/kpis/page.tsx', 'utf8') as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'the KPI screen caps a pillar at two').toContain('Math.max(1, 2 - rows.length)');
  });
});
