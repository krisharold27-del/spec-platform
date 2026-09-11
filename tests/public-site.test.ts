import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARTER } from '../src/lib/charter';

/**
 * The public site, checked as source rather than rendered.
 *
 * These pages make claims about how the product behaves, to people who have not seen it. The risk
 * is not that a claim is wrong today — it is that it quietly stops being true two releases from now
 * and nobody notices, because prose does not fail a build. So the rule is that a public page RENDERS
 * the objects the product runs on instead of restating them, and these tests hold that rule.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Source with its line breaks and indentation flattened.
 *
 * These tests are about what a page SAYS, so they must not also be about how Prettier happened to
 * wrap it. A sentence that fails a test because it moved onto a new line is a test that will be
 * deleted the first time it cries wolf.
 */
const words = (p: string) => read(p).replace(/\s+/g, ' ');

const PUBLIC_PAGES = [
  'src/app/how/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/sectors/page.tsx',
  'src/app/welcome/page.tsx',
];

describe('the public pages stay public', () => {
  // A marketing page that redirects to sign-in is worse than no marketing page.
  it('never gates itself behind a sign-in', () => {
    for (const p of PUBLIC_PAGES) {
      expect(read(p)).not.toContain('getCurrentUser');
    }
  });
});

describe('claims are rendered, not restated', () => {
  it('draws the charter from lib/charter on every page that shows it', () => {
    for (const p of ['src/app/how/page.tsx', 'src/app/sectors/page.tsx']) {
      const src = read(p);
      expect(src).toContain("from '@/lib/charter'");
      // The commitments themselves must not be retyped into the page.
      for (const c of CHARTER) expect(src).not.toContain(c.says);
    }
  });

  it('draws the stretch band and the discovery benchmark from their own modules', () => {
    const how = read('src/app/how/page.tsx');
    expect(how).toContain('MAX_STRETCH');
    expect(how).toContain('MIN_MONTHS_TO_JUDGE');
    expect(how).toContain('HAND_BUILT_DISCOVERY_DAYS');
  });

  // The worked example runs through the real function, so a change to the rule changes the page.
  it('computes the worked example rather than asserting its verdicts', () => {
    const how = read('src/app/how/page.tsx');
    expect(how).toContain('soundness(');
    expect(how).not.toMatch(/Too easy['"]\s*,\s*['"]Sound/);
  });
});

describe('the front door stays a front door', () => {
  /**
   * One line and one button — the founder's instruction of 10 September, recorded in DECISIONS.md.
   * The argument lives on the pages behind it. This test exists because a welcome page is the single
   * most tempting thing in any product to quietly grow a brochure onto.
   */
  /**
   * Measured as words a visitor actually READS, not as lines of source.
   *
   * The first version counted lines, which is a proxy for the wrong thing: adding the mascot and a
   * two-column layout tripped it while the page still said thirty-four words. A guard that fires on
   * layout gets its limit raised until it means nothing. This one only fires if somebody starts
   * arguing on the front door, which is the thing the instruction was actually about.
   */
  it('keeps welcome to a headline, a line and a button', () => {
    const src = read('src/app/welcome/page.tsx');
    const visible = src
      .replace(/\/\*[\s\S]*?\*\//g, '')      // comments are not on the page
      .replace(/className="[^"]*"/g, '')
      .match(/>([^<>{}]+)</g) ?? [];
    const words = visible.join(' ').replace(/[<>]/g, '').split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThan(60);
    expect(src).not.toContain('<section');
  });

  it('offers the argument rather than making it', () => {
    const src = read('src/app/welcome/page.tsx');
    for (const href of ['/how', '/sectors', '/pricing']) expect(src).toContain(`href="${href}"`);
  });
});

describe('the public navigation', () => {
  // It had already drifted once: pricing had lost "By sector". A nav that changes depending on
  // which page you landed on reads as unfinished before anybody has seen the product.
  it('is one component, used by every public page with a header', () => {
    for (const p of ['src/app/how/page.tsx', 'src/app/pricing/page.tsx', 'src/app/sectors/page.tsx']) {
      const src = read(p);
      expect(src).toContain('<PublicNav');
      expect(src).not.toContain('<header');
    }
  });

  it('reaches every public page from every public page', () => {
    const nav = words('src/components/public-nav.tsx');
    for (const href of ['/welcome', '/how', '/sectors', '/pricing', '/signin']) {
      expect(nav).toMatch(new RegExp(`['"]${href}['"]`));
    }
  });
});

describe('the tier claim', () => {
  /**
   * The one overclaim that would matter most: letting "shallow J curve" spread across the whole
   * price list. The collapse is caused by connectors, so it happens on Advanced and not on Basic,
   * and the page that sells both has to say so beside the prices.
   */
  it('says on the pricing page which half the collapse applies to', () => {
    const src = words('src/app/pricing/page.tsx');
    expect(src).toContain('happens on Advanced and not on Basic');
    expect(src).toContain('complete way to run the whole system');
  });
});
