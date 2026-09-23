import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARTER } from '../src/lib/charter';
import { SITEVIP_FLOW, SITEVIP_SYSTEMS, defaultOwnSystems, startHref, systemsLine } from '../src/lib/sitevip';

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

/**
 * The file with its comments taken out.
 *
 * For checks about what the CODE does. On 17 September this check failed because a comment on the
 * pricing page explained why that page does not use a `<header>` — and the check, reading the raw
 * file, found the word in the explanation. Five separate times that day a source check matched the
 * English describing a thing rather than the thing. A check that punishes somebody for writing down
 * why is a check that gets the explanation deleted instead of understood.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PUBLIC_PAGES = [
  'src/app/how/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/sectors/page.tsx',
  'src/app/spec/page.tsx',
  'src/app/page.tsx',
];

/*
  SPEC's own front door moved from `/` to `/spec` on 23 September 2026, whole, when the bare address
  became siteVIP, the trades edition. Every rule below about the SPEC front door is held against the
  page where it now lives — none of them was relaxed in the move.
*/
const SPEC_DOOR = 'src/app/spec/page.tsx';
const SITEVIP_DOOR = 'src/app/page.tsx';

describe('the public pages stay public', () => {
  // A marketing page that redirects to sign-in is worse than no marketing page.
  it('never sends a stranger to sign in', () => {
    for (const p of PUBLIC_PAGES) {
      expect(read(p), p).not.toMatch(/redirect\(['\`]\/signin/);
    }
  });

  /*
    The landing page is allowed to ask who you are — it sends somebody already signed in to their
    own page rather than making them look at a shopfront. What it may NOT do is depend on the answer
    arriving. This is the page every stranger sees, and it has to render with no database and no
    sign-in service configured at all; a marketing site going down over a missing setting is exactly
    how production broke on 11 September. So the ask must be guarded, and this is the guard.
  */
  it('never lets asking who you are take the page down', () => {
    for (const p of PUBLIC_PAGES) {
      const src = words(p);
      if (!src.includes('getCurrentUser')) continue;
      expect(src, `${p} asks who you are without a fallback`).toContain('getCurrentUser().catch(() => null)');
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
    const src = read(SPEC_DOOR);
    const box = src.indexOf('<ProblemBox');
    expect(box, 'the front door no longer opens with the problem box').toBeGreaterThan(-1);

    // Nothing that sells may appear above it.
    for (const later of ['Per seat, per month', 'SPEC Basic', 'Four questions']) {
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
    /*
      Anchored on the pricing SECTION, not on a card's label.

      It used to look for the words "SPEC Basic", which is a label the page is free to change — and
      when it did change, this failed while the rule it is protecting was perfectly intact. A test
      that breaks on a copy edit teaches people to edit the test.
    */
    const src = read(SPEC_DOOR);
    const pricing = src.indexOf('<span className="label-caps">Pricing</span>');
    expect(pricing, 'the pricing section has moved or been renamed').toBeGreaterThan(-1);
    expect(pricing).toBeGreaterThan(src.indexOf('<ProblemBox'));
  });

  // Both doors still lead in. Somebody who would rather see the product than talk about themselves
  // must not be forced to type a problem to get anywhere.
  it('keeps the look-around for people who would rather not talk about themselves', () => {
    expect(read(SPEC_DOOR)).toContain('href="/look"');
  });

  it('offers the argument rather than making it', () => {
    const src = read(SPEC_DOOR);
    for (const href of ['/how', '/sectors', '/pricing']) expect(src).toContain(`href="${href}"`);
  });
});

describe('the public navigation', () => {
  // It had already drifted once: pricing had lost "By sector". A nav that changes depending on
  // which page you landed on reads as unfinished before anybody has seen the product.
  it('is one component, used by every public page with a header', () => {
    for (const p of ['src/app/how/page.tsx', 'src/app/pricing/page.tsx', 'src/app/sectors/page.tsx']) {
      const src = code(p);
      expect(src, p).toContain('<PublicNav');
      expect(src, `${p} has grown a header of its own`).not.toContain('<header');
    }
  });

  it('reaches every public page from every public page', () => {
    const nav = words('src/components/public-nav.tsx');
    for (const href of ['/', '/spec', '/how', '/sectors', '/pricing', '/signin']) {
      expect(nav).toMatch(new RegExp(`['"]${href}['"]`));
    }
  });
});

describe('siteVIP, the front door at /', () => {
  it('is siteVIP, powered by SPEC, and says so in the title', () => {
    const src = words(SITEVIP_DOOR);
    expect(src).toContain('<SiteVipMark powered');
    expect(words('src/components/sitevip-mark.tsx')).toContain('POWERED BY SPEC');
    expect(src).toMatch(/title: 'siteVIP/);
    expect(src).toContain("canonical: '/'");
  });

  // The SPEC front door was moved, not lost — and the one that moved it must still point at it.
  it('keeps the SPEC front door one press away', () => {
    expect(code(SITEVIP_DOOR)).toContain('href="/spec"');
    expect(words(SITEVIP_DOOR)).toContain('siteVIP is the trades edition of');
    expect(read(SPEC_DOOR)).toContain('<ProblemBox');
    expect(read(SPEC_DOOR)).toContain("canonical: '/spec'");
  });

  it('sends somebody already signed in to their day, exactly as the SPEC door does', () => {
    for (const p of [SITEVIP_DOOR, SPEC_DOOR]) {
      expect(words(p), p).toContain('if (await getCurrentUser().catch(() => null)) redirect(DEFAULT_AFTER_SIGN_IN)');
    }
  });

  /*
    The business name typed on the front door travels to sign-up in the parameter sign-up already
    reads, so it is filled in there and never asked for twice.
  */
  it('carries the business name into sign-up rather than asking again', () => {
    expect(startHref('  Harbour Electrical  ')).toBe('/signup?business=Harbour%20Electrical');
    expect(startHref('A & B Plumbing')).toBe('/signup?business=A%20%26%20B%20Plumbing');
    expect(startHref('')).toBe('/signup');
    expect(startHref(null)).toBe('/signup');
    expect(startHref('x'.repeat(500)).length).toBeLessThan(230);
    expect(read('src/app/signup/page.tsx')).toContain('sp.business');
    const box = code('src/components/sitevip-landing.tsx');
    // A real form onto sign-up with the same field name, so it works before any script has loaded.
    expect(box).toContain('action="/signup"');
    expect(box).toContain('name="business"');
    expect(box).toContain('startHref(biz)');
  });

  it('does nothing on Enter with an empty box', () => {
    expect(code('src/components/sitevip-landing.tsx')).toMatch(/e\.key === 'Enter' && !biz\.trim\(\)\) e\.preventDefault\(\)/);
  });

  it('counts the systems somebody keeps, in plain words', () => {
    const own = defaultOwnSystems();
    expect(Object.values(own).filter(Boolean)).toHaveLength(1); // the books start on "keep"
    expect(systemsLine(own)).toBe('siteVIP runs the rest and talks to your 1 connected system, so you still work from one screen.');
    const none = Object.fromEntries(SITEVIP_SYSTEMS.map(s => [s.job, false]));
    expect(systemsLine(none)).toBe('Everything runs in siteVIP. Nothing to connect.');
    const all = Object.fromEntries(SITEVIP_SYSTEMS.map(s => [s.job, true]));
    expect(systemsLine(all)).toContain(`your ${SITEVIP_SYSTEMS.length} connected systems`);
  });

  /*
    The never list: no vendor in the UI, connectors by category. The design named four products;
    none of them may reach the page, the component or the words behind them.
  */
  it('names categories of system, never a vendor', () => {
    const vendors = /\b(simpro|xero|hubspot|myob|aroflo|servicem8|quickbooks|salesforce|employment hero|deputy)\b/i;
    for (const p of [SITEVIP_DOOR, 'src/components/sitevip-landing.tsx', 'src/lib/sitevip.ts']) {
      expect(code(p), p).not.toMatch(vendors);
    }
    for (const s of SITEVIP_SYSTEMS) expect(s.own, s.job).not.toMatch(vendors);
    for (const f of SITEVIP_FLOW) expect(f.line, f.label).not.toMatch(vendors);
  });
});

describe('the one home', () => {
  it('resolves every canonical address against www.sitevipapp.com', () => {
    const layout = words('src/app/layout.tsx');
    expect(layout).toContain('metadataBase: new URL(`https://${HOME_HOST}`)');
    expect(read('src/lib/home-address.ts')).toContain("HOME_HOST = 'www.sitevipapp.com'");
    for (const p of ['src/app/robots.ts', 'src/app/sitemap.ts']) {
      expect(read(p), p).toContain('HOME_HOST');
      expect(read(p), p).not.toContain('specbizhq');
    }
    const map = read('src/app/sitemap.ts');
    for (const path of ["'/'", "'/spec'", "'/pricing'"]) expect(map).toContain(path);
  });
});

describe('the tier claim', () => {
  /**
   * There used to be an overclaim to guard against here: letting "shallow J curve" spread across
   * the whole price list when only Advanced supposedly caused the collapse. Advanced is retired (22
   * September — see the note on `SEAT_PRICES` in lib/pricing) along with the claim, so there is no
   * tier left for the page to carve the collapse in half for.
   */
  it('no longer claims the J curve applies to only half the price list', () => {
    const src = words('src/app/pricing/page.tsx');
    expect(src).not.toContain('happens on Advanced and not on Basic');
  });
});
