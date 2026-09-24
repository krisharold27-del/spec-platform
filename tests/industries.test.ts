import { describe, it, expect } from 'vitest';
import { INDUSTRIES, industryByKey, QUESTIONS } from '../src/lib/industries';
import { PILLARS } from '../src/lib/scoring';
import { CATEGORIES } from '../src/lib/systems';

describe('INDUSTRIES', () => {
  it('has a unique key per sector', () => {
    expect(new Set(INDUSTRIES.map(s => s.key)).size).toBe(INDUSTRIES.length);
  });

  // The four pillars never change. What changes is only what each one is measured by.
  it('measures all four pillars in every sector', () => {
    for (const s of INDUSTRIES) {
      for (const p of PILLARS) {
        expect(s.measures[p].length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('names roles rather than people', () => {
    for (const s of INDUSTRIES) {
      expect(s.roles.length).toBeGreaterThanOrEqual(4);
      // A role title, not "Jo Barnes" — no sector should read like one client's staff list.
      for (const r of s.roles) expect(r).toMatch(/manager|lead|supervisor|director|partner|planner|estimator|scheduler|nursing/i);
    }
  });

  // A page that lists products is a page some business is absent from.
  it('names system categories and never a vendor', () => {
    const known = new Set<string>(CATEGORIES.map(c => c.name));
    for (const s of INDUSTRIES) {
      expect(s.systems.length).toBeGreaterThan(0);
      for (const sys of s.systems) expect(known.has(sys)).toBe(true);
    }
  });

  it('gives each sector a shape that explains what differs', () => {
    for (const s of INDUSTRIES) {
      expect(s.line.length).toBeGreaterThan(30);
      expect(s.shape.length).toBeGreaterThan(30);
    }
  });

  it('covers more than one industry, and one that has no site at all', () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(4);
    const services = INDUSTRIES.find(s => s.key === 'professional')!;
    expect(services.shape).toMatch(/psychosocial/i);
    expect(services.shape).toMatch(/still a hard gate/i);
  });
});

describe('industryByKey', () => {
  it('finds a sector', () => {
    expect(industryByKey('manufacturing').name).toBe('Manufacturing');
  });

  it('falls back to the first rather than returning nothing', () => {
    expect(industryByKey('unknown')).toBe(INDUSTRIES[0]);
    expect(industryByKey(null)).toBe(INDUSTRIES[0]);
  });
});

describe('QUESTIONS', () => {
  it('asks one question per pillar, the same in every sector', () => {
    for (const p of PILLARS) expect(QUESTIONS[p]).toMatch(/\?$/);
  });
});
