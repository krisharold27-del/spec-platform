import { describe, it, expect } from 'vitest';
import { SECTORS, sectorByKey, QUESTIONS } from '../src/lib/sectors';
import { PILLARS } from '../src/lib/scoring';
import { CATEGORIES } from '../src/lib/systems';

describe('SECTORS', () => {
  it('has a unique key per sector', () => {
    expect(new Set(SECTORS.map(s => s.key)).size).toBe(SECTORS.length);
  });

  // The four pillars never change. What changes is only what each one is measured by.
  it('measures all four pillars in every sector', () => {
    for (const s of SECTORS) {
      for (const p of PILLARS) {
        expect(s.measures[p].length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('names roles rather than people', () => {
    for (const s of SECTORS) {
      expect(s.roles.length).toBeGreaterThanOrEqual(4);
      // A role title, not "Jo Barnes" — no sector should read like one client's staff list.
      for (const r of s.roles) expect(r).toMatch(/manager|lead|supervisor|director|partner|planner|estimator|scheduler|nursing/i);
    }
  });

  // A page that lists products is a page some business is absent from.
  it('names system categories and never a vendor', () => {
    const known = new Set<string>(CATEGORIES.map(c => c.name));
    for (const s of SECTORS) {
      expect(s.systems.length).toBeGreaterThan(0);
      for (const sys of s.systems) expect(known.has(sys)).toBe(true);
    }
  });

  it('gives each sector a shape that explains what differs', () => {
    for (const s of SECTORS) {
      expect(s.line.length).toBeGreaterThan(30);
      expect(s.shape.length).toBeGreaterThan(30);
    }
  });

  it('covers more than one industry, and one that has no site at all', () => {
    expect(SECTORS.length).toBeGreaterThanOrEqual(4);
    const services = SECTORS.find(s => s.key === 'professional')!;
    expect(services.shape).toMatch(/psychosocial/i);
    expect(services.shape).toMatch(/still a hard gate/i);
  });
});

describe('sectorByKey', () => {
  it('finds a sector', () => {
    expect(sectorByKey('manufacturing').name).toBe('Manufacturing');
  });

  it('falls back to the first rather than returning nothing', () => {
    expect(sectorByKey('unknown')).toBe(SECTORS[0]);
    expect(sectorByKey(null)).toBe(SECTORS[0]);
  });
});

describe('QUESTIONS', () => {
  it('asks one question per pillar, the same in every sector', () => {
    for (const p of PILLARS) expect(QUESTIONS[p]).toMatch(/\?$/);
  });
});
