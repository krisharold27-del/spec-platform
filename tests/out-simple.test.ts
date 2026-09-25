import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as story from '../src/lib/out-simple';
import { FEATURES, OUT_SIMPLE_HERO } from '../src/lib/out-simple';
import { ANGUS_SHIELD } from '../src/lib/virtual-gm-overview';

/**
 * The out-simple front door at www.sitevipapp.com. See lib/out-simple.
 *
 * The one that matters is the first: a feature may only be shown as live when a signed-in business
 * can actually use it, and the evidence for that is a route that exists.
 */

const routeExists = (href: string): boolean => {
  const path = href.split(/[?#]/)[0].replace(/^\//, '');
  return existsSync(join('src/app', path, 'page.tsx'));
};

const page = readFileSync('src/app/page.tsx', 'utf8');
const words = JSON.stringify(story) + page;

describe('the honesty rule', () => {
  it('shows a feature as live only when its route exists', () => {
    for (const f of Object.values(FEATURES)) {
      if (!f.live) continue;
      expect(f.evidence, `${f.key} is live with no evidence`).toBeTruthy();
      expect(routeExists(f.evidence!), `${f.key} names ${f.evidence}, which is not a page`).toBe(true);
    }
  });

  it('never promises Angus Shield before the switch inside SPEC can deliver it', () => {
    expect(FEATURES.angus_shield.live).toBe(ANGUS_SHIELD.switchable);
  });

  it('has nothing to press where a feature is still arriving', () => {
    // The interactive example is only rendered behind the recommends flag.
    expect(page).toMatch(/isLive\('recommends'\) \? <RecommendDemo \/>/);
  });
});

describe('the words', () => {
  it('leads with Simple. and the out-simple lines', () => {
    expect(OUT_SIMPLE_HERO.word).toBe('Simple.');
    expect(OUT_SIMPLE_HERO.line).toBe('Your GM and your admin department, run virtually.');
    expect(OUT_SIMPLE_HERO.push).toBe('Don’t pay three hundred grand for a GM. Just use SPEC.');
    expect(page).toContain('{OUT_SIMPLE_HERO.word}');
  });

  it('tells the story in Kris’s order, with the problem box first and the Power Meter last', () => {
    const at = (s: string) => page.indexOf(s);
    const order = ['id="hero"', '<ProblemBox', 'id="virtual"', 'id="recommends"', 'id="switch"', 'id="weekly"', 'id="guarantee"', 'id="cta"', 'id="power"'];
    const found = order.map(at);
    expect(found.every(i => i > 0)).toBe(true);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
    expect(story.CTA.href).toBe('#problem');
    expect(page).toContain('id="problem"');
  });

  it('names no client, no former employer and no vendor', () => {
    for (const name of ['JBI', 'Xero', 'MYOB', 'QuickBooks', 'SimPro', 'ServiceM8', 'AroFlo']) {
      expect(words).not.toContain(name);
    }
  });

  it('never shows what SPEC charges by the hour', () => {
    // The labour-rate example is the business's own charge-out rate, which is the point of it. Any
    // other hourly figure on this page would be SPEC's, and that is never shown.
    const hourly = words.match(/\$\d[\d,.]*\s*(?:\/|per\s*)h(?:ou)?r/gi) ?? [];
    expect(hourly.every(h => h.startsWith('$105'))).toBe(true);
  });
});
