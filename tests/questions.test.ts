import { describe, it, expect } from 'vitest';
import {
  QUESTIONS, PLACES, placeOf, statusOf, read, byGroup, EVERYWHERE_IS_NOT_CHECKED,
  type Question,
} from '../src/lib/questions';
import { routesInApp } from '../src/lib/questions-data';

const REAL = routesInApp();

describe('the ninety-six', () => {
  it('is all of them, from the design', () => {
    expect(QUESTIONS).toHaveLength(96);
  });

  it('gives every one an answer and a place', () => {
    for (const q of QUESTIONS) {
      expect(q.q.length, `${q.n} has no question`).toBeGreaterThan(5);
      expect(q.a.length, `${q.n} has no answer`).toBeGreaterThan(10);
      expect(q.where.length, `${q.n} has no place`).toBeGreaterThan(2);
    }
  });

  it('numbers them in order', () => {
    expect(QUESTIONS.map(q => q.n)).toEqual(QUESTIONS.map((_, i) => i + 1));
  });
});

describe('where a question is handled', () => {
  it('takes the longest matching place, so Jobs does not swallow Jobs · Leads', () => {
    expect(placeOf('Jobs · Leads · Is our rate right?').href).toBe('/jobs?tab=leads');
    expect(placeOf('Jobs').href).toBe('/jobs');
  });

  it('resolves a place named exactly', () => {
    expect(placeOf('Org chart').href).toBe('/org');
  });

  it('resolves nothing for a place that is not a place', () => {
    expect(placeOf('Everywhere').href).toBeNull();
    expect(placeOf('Somewhere nobody built').href).toBeNull();
  });

  it('points every known place at a route that exists', () => {
    for (const p of PLACES) {
      const path = p.href.split('?')[0];
      expect(REAL.has(path), `${p.named} points at ${p.href}, which is not a page`).toBe(true);
    }
  });
});

describe('the status is worked out, never asserted', () => {
  /*
    The design marks all ninety-six Answered. This page's whole value is that it does not repeat
    that — so the check that matters is that a question pointing at a screen nobody built reads as
    a gap.
  */
  it('calls a question with no screen behind it a gap', () => {
    const made: Question = { n: 1, group: 'x', q: 'q', a: 'a', where: 'Jobs · Leads' };
    expect(statusOf(made, new Set(['/jobs']))).toBe('answered');
    expect(statusOf(made, new Set(['/people']))).toBe('gap');
    expect(statusOf(made, new Set())).toBe('gap');
  });

  it('calls one answered everywhere its own thing, not a gap and not a tick', () => {
    /*
      Three of the ninety-six are answered by something siteVIP does on every screen. Counting them
      as gaps read as three unbuilt features; counting them as answered would be a status nothing
      checked. They get their own word.
    */
    const made: Question = { n: 1, group: 'x', q: 'q', a: 'a', where: 'Everywhere · seven places' };
    expect(statusOf(made, REAL)).toBe('everywhere');
    expect(EVERYWHERE_IS_NOT_CHECKED).toContain('does not pretend');
  });

  it('reports against the product as it is today', () => {
    const r = read(QUESTIONS, REAL);
    expect(r.total).toBe(96);
    expect(r.answered + r.gaps.length + r.everywhere.length).toBe(96);
    /* Whatever the number is, the sentence has to say how it was arrived at. */
    expect(r.says).toMatch(/checked every one by looking|counted rather than taken/);
  });

  it('says so plainly when something is missing', () => {
    const r = read(QUESTIONS, new Set(['/jobs']));
    expect(r.gaps.length).toBeGreaterThan(50);
    expect(r.says).toContain('no screen behind');
  });

  it('counts per area, because one number hides which part is thin', () => {
    const groups = byGroup(QUESTIONS, REAL);
    expect(groups.length).toBeGreaterThan(5);
    expect(groups.reduce((a, g) => a + g.total, 0)).toBe(96);
  });
});

describe('the routes come from the filesystem', () => {
  it('finds the pages this product actually has', () => {
    for (const path of ['/jobs', '/people', '/money', '/org', '/safety', '/compliance', '/questions']) {
      expect(REAL.has(path), `${path} should be a page`).toBe(true);
    }
  });

  it('does not invent one', () => {
    expect(REAL.has('/a-page-nobody-built')).toBe(false);
  });

  it('makes a page behind a token reachable by its parent', () => {
    /* /customer/[token] — the design names the customer page, and the token is not the owner's question. */
    expect(REAL.has('/customer')).toBe(true);
  });
});
