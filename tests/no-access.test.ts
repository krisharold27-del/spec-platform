import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  repeaters, noAccessCount, toldText, REPEAT_AT, LOOK_BACK_DAYS, type NoAccess,
} from '../src/lib/no-access';

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const visit = (client: string, iso: string, over: Partial<NoAccess> = {}): NoAccess =>
  ({ id: `${client}-${iso}`, jobId: 'j1', jobRef: 'J-1001', client,
     at: `${iso}T08:00:00.000Z`, who: 'Jamie', because: null, ...over });

describe('one press, and the reason afterwards', () => {
  it('the action asks for nothing but the job', () => {
    /*
      The person pressing it is standing in a driveway with a phone in one hand. Anything with a
      decision in it does not get pressed — and a record only made on quiet days produces a number
      saying quiet days have the most no-access.
    */
    const src = readFileSync('src/app/tech-day/actions.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function couldNotGetIn'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/formData\.get\('jobId'\)/);
    /* The reason is read, and nothing is refused when it is missing. */
    expect(body).toMatch(/because: String\(formData\.get\('because'\)[\s\S]{0,80}\|\| null/);
    expect(body).not.toMatch(/if \(!because\)/);
  });

  it('puts the job back on the list to rebook', () => {
    /* A job left scheduled for a day nobody worked is a job that looks done from the office. */
    const src = readFileSync('src/app/tech-day/actions.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function couldNotGetIn'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/stage === 'scheduled'[\s\S]{0,200}stage: 'won'/);
  });

  it('tells the customer as part of the same press', () => {
    /* Telling them later is what turns a wasted visit into an argument about whether anybody came. */
    const src = readFileSync('src/app/tech-day/actions.ts', 'utf8');
    expect(src.slice(src.indexOf('export async function couldNotGetIn'))).toMatch(/toldAt: at/);
    const said = toldText('JBI Electrical', 'J-1004');
    expect(said).toContain('J-1004');
    expect(said).toMatch(/no charge/i);
    expect(said.length).toBeLessThan(220);
  });
});

describe('the number worth having is which customers do it twice', () => {
  it('says nothing about a one-off', () => {
    expect(REPEAT_AT).toBe(2);
    expect(repeaters([visit('Dana Ward', '2026-06-01')], at('2026-06-10'))).toEqual([]);
  });

  it('names a customer who has done it more than once', () => {
    const r = repeaters([visit('Dana Ward', '2026-02-01'), visit('Dana Ward', '2026-06-01')], at('2026-06-10'));
    expect(r).toHaveLength(1);
    expect(r[0].times).toBe(2);
    expect(r[0].says).toMatch(/different arrangement/i);
  });

  it('ranks by how often, not by how recently', () => {
    /*
      A list sorted by date puts whoever did it most recently at the top, which is almost never the
      person worth ringing.
    */
    const rows = [
      visit('Once-ish', '2026-06-09'), visit('Once-ish', '2026-06-08'),
      visit('Worst', '2026-01-01'), visit('Worst', '2026-02-01'), visit('Worst', '2026-03-01'),
    ];
    expect(repeaters(rows, at('2026-06-10')).map(r => r.client)).toEqual(['Worst', 'Once-ish']);
  });

  it('forgets what is older than the window', () => {
    expect(LOOK_BACK_DAYS).toBe(365);
    const rows = [visit('Old', '2024-01-01'), visit('Old', '2024-02-01'), visit('Old', '2026-06-01')];
    expect(repeaters(rows, at('2026-06-10'))).toEqual([]);
  });

  it('ignores a visit with no customer against it', () => {
    expect(repeaters([visit('  ', '2026-06-01'), visit('  ', '2026-06-02')], at('2026-06-10'))).toEqual([]);
  });
});

describe('what it cost, without inventing a number', () => {
  it('says nothing has happened when nothing has', () => {
    expect(noAccessCount([], null, at('2026-06-10')).says).toMatch(/Nobody has been locked out/);
  });

  it('counts the times and asks for an hours figure it does not have', () => {
    const c = noAccessCount([visit('A', '2026-06-01'), visit('B', '2026-06-02')], null, at('2026-06-10'));
    expect(c.times).toBe(2);
    expect(c.hours).toBeNull();
    expect(c.says).toMatch(/Set what one costs you in hours/);
    /* Never a dollar figure SPEC made up. */
    expect(c.says).not.toMatch(/\$/);
  });

  it('totals the hours once the business has said what one costs', () => {
    const c = noAccessCount([visit('A', '2026-06-01'), visit('B', '2026-06-02')], 1.5, at('2026-06-10'));
    expect(c.hours).toBe(3);
    expect(c.says).toMatch(/about 3 hours/);
    expect(c.says).toMatch(/paid for and earning nothing/);
  });

  it('only counts this year', () => {
    const c = noAccessCount([visit('A', '2024-01-01'), visit('B', '2026-06-01')], 1, at('2026-06-10'));
    expect(c.times).toBe(1);
  });
});

describe('the phone offers it beside the job', () => {
  const PHONE = readFileSync('src/components/tech-day-phone.tsx', 'utf8');

  it('is one button, not a form', () => {
    expect(PHONE).toContain('Could not get in');
    const panel = PHONE.slice(PHONE.indexOf('function CouldNotGetIn'));
    const body = panel.slice(0, panel.indexOf('\nfunction '));
    /* The reason only appears after something has been recorded. */
    expect(body).toMatch(/if \(said\)/);
    expect(body.indexOf('if (said)')).toBeLessThan(body.indexOf("name=\"because\""));
  });

  it('is thumb-sized, like everything else on that screen', () => {
    const panel = PHONE.slice(PHONE.indexOf('function CouldNotGetIn'));
    expect(panel.slice(0, panel.indexOf('\nfunction '))).toMatch(/min-h-\[48px\]/);
  });
});
