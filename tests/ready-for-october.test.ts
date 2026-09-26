/*
  Getting a real business live, by a date.

  Kris, 26 September: *"HR for Monday is add everyone into the system and then make sure they all
  have a place on the org chart - then set everyones kpis and be ready for the start of october."*

  Four things and the last one is a deadline. A month that starts with half the crew off the chart
  cannot be scored honestly afterwards — the numbers would be about whoever happened to be set up
  in time.
*/
import { describe, it, expect } from 'vitest';
import {
  readyForMonth, readNames, addedSays, NEED_PER_ROLE, MOST_AT_ONCE,
  type Person, type ScoredRole,
} from '../src/lib/ready-for-october';

const person = (id: string, name: string, roleId: string | null = null): Person => ({ id, name, roleId });
const role = (id: string, title: string, kpis: number, vacant = false): ScoredRole => ({ id, title, kpis, vacant });

describe('it names who is missing, rather than giving a percentage', () => {
  it('NAMES EVERY PERSON WITH NO PLACE ON THE CHART', () => {
    /*
      The whole reason this exists. lib/start-here nudges twice and goes quiet as soon as ONE role
      has its numbers — right for a first-week nudge, useless for a deadline. "Who exactly is still
      missing" is the question, and a list you can work down beats a number you cannot act on.
    */
    const r = readyForMonth('October', [person('1', 'Kris', 'gm'), person('2', 'Dan'), person('3', 'Mel')], []);
    expect(r.ready).toBe(false);
    expect(r.offChart.map(p => p.name)).toEqual(['Dan', 'Mel']);
    expect(r.says).toContain('2 people have no place on the chart');
  });

  it('names every role short of its KPIs, with how many it has', () => {
    const r = readyForMonth('October', [], [role('a', 'Site Supervisor', 3), role('b', 'Estimator', 8)]);
    expect(r.short).toEqual([{ id: 'a', title: 'Site Supervisor', kpis: 3, need: NEED_PER_ROLE }]);
  });

  it('LISTS VACANT ROLES AND NEVER BLOCKS ON THEM', () => {
    /*
      An unfilled Estimator role is a job to advertise, not a setup mistake. A check that refused to
      go green until every seat was full would be one nobody could ever satisfy — which is the same
      as one nobody reads.
    */
    const r = readyForMonth('October', [person('1', 'Kris', 'gm')], [role('v', 'Estimator', 0, true)]);
    expect(r.ready).toBe(true);
    expect(r.vacant).toEqual(['Estimator']);
    expect(r.says).toContain('vacant');
  });

  it('says so plainly when the business is ready', () => {
    const r = readyForMonth('October', [person('1', 'Kris', 'gm')], [role('a', 'GM', 8)]);
    expect(r.ready).toBe(true);
    expect(r.says).toContain('Ready for October');
  });

  it('counts one person and one role in the singular', () => {
    /* "1 people have no place" is how a screen stops sounding like it was written by anybody. */
    const r = readyForMonth('October', [person('2', 'Dan')], [role('a', 'GM', 1)]);
    expect(r.says).toContain('1 person has');
    expect(r.says).toContain('1 role needs');
  });
});

describe('adding everybody at once', () => {
  it('READS A LIST PASTED OUT OF A SPREADSHEET', () => {
    /* addStaff takes one name per submission. For thirty-five people that is thirty-five round
       trips — the kind of friction that gets a rollout postponed rather than reported. */
    expect(readNames('Kris Harold\nDan Reilly\nMel Tran')).toEqual(['Kris Harold', 'Dan Reilly', 'Mel Tran']);
  });

  it('copes with commas, tabs, quotes and a trailing blank line', () => {
    expect(readNames('"Kris Harold",\tDan Reilly ,\n\n')).toEqual(['Kris Harold', 'Dan Reilly']);
  });

  it('drops a spreadsheet header row rather than hiring it', () => {
    expect(readNames('Name\nKris Harold')).toEqual(['Kris Harold']);
    expect(readNames('Full Name\nKris')).toEqual(['Kris']);
  });

  it('strips the numbering off a numbered list', () => {
    expect(readNames('1. Kris Harold\n2) Dan Reilly\n- Mel Tran')).toEqual(['Kris Harold', 'Dan Reilly', 'Mel Tran']);
  });

  it('NEVER SPLITS A NAME ON SPACES', () => {
    /* "Kris Harold" is one person. A rule clever enough to guess otherwise would eventually turn
       somebody's double-barrelled surname into two employees. */
    expect(readNames('Mary-Jane Van Der Berg')).toEqual(['Mary-Jane Van Der Berg']);
  });

  it('skips the same person twice, however they were typed', () => {
    expect(readNames('Kris Harold\nkris harold\n  KRIS HAROLD  ')).toEqual(['Kris Harold']);
  });

  it('ignores things that are not names', () => {
    expect(readNames('---\n0412 345 678\n \nKris')).toEqual(['0412 345 678', 'Kris'].filter(n => /[a-z]/i.test(n)));
    expect(readNames('---\n\nKris')).toEqual(['Kris']);
  });

  it('caps a runaway paste', () => {
    const many = Array.from({ length: MOST_AT_ONCE + 50 }, (_, i) => `Person ${i}`).join('\n');
    expect(readNames(many)).toHaveLength(MOST_AT_ONCE);
  });

  it('says what happened, including the ones already there', () => {
    expect(addedSays(12, 3)).toContain('12 added');
    expect(addedSays(12, 3)).toContain('3 were already there');
    expect(addedSays(1, 1)).toContain('1 was already there');
    expect(addedSays(0, 0)).toContain('No names found');
  });
});
