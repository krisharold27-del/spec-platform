import { describe, it, expect } from 'vitest';
import { deterministic, enforce } from '../src/lib/mapping';
import { CATEGORIES } from '../src/lib/systems';

describe('proposing a mapping', () => {
  it('reads a described system into the right kind of number', () => {
    expect(deterministic('We invoice out of Xero every Friday').category).toBe('financials');
    expect(deterministic('Jobs and timesheets are in Simpro').category).toBe('job_management');
    expect(deterministic('Incidents go in SiteDocs on the tablet').category).toBe('safety');
  });

  it('names the system the way the person would say it', () => {
    expect(deterministic('We invoice out of Xero every Friday').name).toBe('Xero');
    expect(deterministic('we log plant checks in a shared spreadsheet each morning').name)
      .toBe('The spreadsheet');
  });

  it('never leaves the name blank, even with nothing to go on', () => {
    expect(deterministic('').name).toBe('Unnamed system');
    expect(deterministic('dunno really').name).toBe('Unnamed system');
  });

  it('files what it cannot place as something else, rather than guessing', () => {
    const m = deterministic('a thing the boys fill in');
    expect(m.category).toBe('other');
    expect(m.because).toMatch(/confirmed by a person/);
  });

  /*
    The rule that matters most. A wrong category here would let a business connect its payroll
    without the board ever seeing the request.
  */
  it('sends money and people systems to the board, whatever they are called', () => {
    expect(deterministic('payroll is in Employment Hero').needsBoard).toBe(true);
    expect(deterministic('the ledger lives in MYOB').needsBoard).toBe(true);
    expect(deterministic('jobs are in Simpro').needsBoard).toBe(false);
  });

  it('refuses a category the model invented', () => {
    const m = enforce({ name: 'Thing', category: 'nonsense' as never, because: 'x' }, 'incidents and inductions');
    expect(CATEGORIES.some(c => c.id === m.category)).toBe(true);
    expect(m.category).toBe('safety');
  });

  it('uses its own list of what a category feeds, never the model’s', () => {
    const m = enforce({ category: 'safety', feeds: ['whatever the model felt like'] } as never, 'incidents');
    expect(m.feeds).not.toContain('whatever the model felt like');
    expect(m.feeds.join(' ')).toMatch(/Incidents/);
  });

  it('does not pretend mail lands on a scorecard', () => {
    const m = enforce({ category: 'communications' }, 'our work email is in Outlook');
    expect(m.feeds.join(' ')).toMatch(/Nothing on a scorecard/);
  });
});
