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

describe('the front door asks before it tells', () => {
  /**
   * The rule here CHANGED, and the old test was right up until it was not.
   *
   * It enforced "a headline, a line and a button" — the founder's instruction of 10 September — by
   * capping the page at sixty words. The design that replaced it on 12 September makes the front
   * door a working problem-intake flow: a stranger types one ongoing problem, watches SPEC work out
   * what is underneath it, and only then sees a price. That page cannot be sixty words, so the word
   * count was measuring a decision nobody holds any more.
   *
   * What survives is the thing the old rule was actually protecting: **the page must not open by
   * arguing.** So this tests the order instead of the length — the box a person types into comes
   * before any pitch, and the proof still comes before the price.
   */
  it('leads with the problem box, not with a pitch', () => {
    const src = read('src/app/welcome/page.tsx');
    const box = src.indexOf('<ProblemBox');
    expect(box, 'the front door no longer opens with the problem box').toBeGreaterThan(-1);

    // Nothing that sells may appear above it.
    for (const later of ['What it costs', 'SPEC Basic', 'Four questions']) {
      const at = src.indexOf(later);
      if (at === -1) continue;
      expect(at, `"${later}" appears before the person has been asked anything`).toBeGreaterThan(box);
    }
  });

  /**
   * A price is a claim, and this page's whole argument is that it demonstrates before it claims. By
   * the time somebody reads a number they have already been told something true about their own
   * business.
   */
  it('shows the price only after the reading', () => {
    const src = read('src/app/welcome/page.tsx');
    expect(src.indexOf('What it costs')).toBeGreaterThan(src.indexOf('<ProblemBox'));
  });

  // Both doors still lead in. Somebody who would rather see the product than talk about themselves
  // must not be forced to type a problem to get anywhere.
  it('keeps the look-around for people who would rather not talk about themselves', () => {
    expect(read('src/app/welcome/page.tsx')).toContain('href="/look"');
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
