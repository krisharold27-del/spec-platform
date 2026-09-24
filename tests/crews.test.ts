import { describe, it, expect } from 'vitest';
import {
  needsSupervisor, hasSupervisor, crewWatch, unheld, onTheJob, unled, crewLine,
  WHY_ONE_SUPERVISOR, type Scope, type SupervisedJob,
} from '../src/lib/crews';

/*
  ── Two crews on one job ────────────────────────────────────────────────────────────────────────

  Kris, 25 September: "multi crew is common - split scopes with one supervisor overall".
*/
const job = (over: Partial<SupervisedJob> = {}): SupervisedJob =>
  ({ id: 'j1', ref: 'J-1001', supervisorKey: null, supervisorName: null, ...over });

const scope = (name: string, lead: string | null = null, jobId = 'j1'): Scope =>
  ({ id: `s-${name}`, jobId, name, leadKey: lead ? lead.toLowerCase() : null, leadName: lead });

describe('a split job needs somebody over the whole of it', () => {
  it('one scope needs nobody', () => {
    /*
      Asking a sparkie to nominate themselves as their own supervisor is the kind of ceremony that
      teaches people the software is not on their side.
    */
    expect(needsSupervisor(0)).toBe(false);
    expect(needsSupervisor(1)).toBe(false);
    expect(crewWatch(job(), [scope('Switchboard', 'Jamie')]).state).toBe('single');
  });

  it('a second scope is the declaration — nobody has to tick anything', () => {
    expect(needsSupervisor(2)).toBe(true);
    const w = crewWatch(job(), [scope('Switchboard', 'Jamie'), scope('Lighting', 'Dana')]);
    expect(w.state).toBe('unheld');
  });

  it('names the day it will matter, rather than saying a field is required', () => {
    const w = crewWatch(job(), [scope('Switchboard'), scope('Lighting')]);
    expect(w.says).toMatch(/the day they disagree/i);
    expect(w.says).not.toMatch(/required|invalid|must be set/i);
  });

  it('is held once one name is over it', () => {
    const w = crewWatch(
      job({ supervisorKey: 'hal', supervisorName: 'Hal Walker' }),
      [scope('Switchboard', 'Jamie'), scope('Lighting', 'Dana')],
    );
    expect(w.state).toBe('split');
    expect(w.says).toContain('Hal Walker');
  });

  it('a lead is not a supervisor', () => {
    /*
      The mistake this whole file exists to prevent. Every scope having a lead does not hold a job
      together: each lead is answerable for their own part and none of them for the join, and the
      join is where the problem always is.
    */
    const everyScopeLed = [scope('Switchboard', 'Jamie'), scope('Lighting', 'Dana')];
    expect(crewWatch(job(), everyScopeLed).state).toBe('unheld');
    expect(hasSupervisor(job())).toBe(false);
  });

  it('a supervisor of blank space is not a supervisor', () => {
    expect(hasSupervisor(job({ supervisorName: '   ' }))).toBe(false);
  });

  it('only counts the scopes on this job', () => {
    const w = crewWatch(job(), [scope('Switchboard', 'Jamie'), scope('Other job', 'Sam', 'j2')]);
    expect(w.scopes).toHaveLength(1);
    expect(w.state).toBe('single');
  });
});

describe('the list worth acting on', () => {
  it('names every job that was split and never given anybody', () => {
    const jobs = [
      job({ id: 'a', ref: 'J-A' }),
      job({ id: 'b', ref: 'J-B', supervisorName: 'Hal Walker' }),
      job({ id: 'c', ref: 'J-C' }),
    ];
    const scopes = [
      scope('One', 'Jamie', 'a'), scope('Two', 'Dana', 'a'),
      scope('One', 'Jamie', 'b'), scope('Two', 'Dana', 'b'),
      scope('Only', 'Sam', 'c'),
    ];
    expect(unheld(jobs, scopes).map(w => w.job.ref)).toEqual(['J-A']);
  });
});

describe('who is actually on it', () => {
  it('counts a person once even when they lead two scopes', () => {
    /*
      A three-person job reading as four matters: this is what the day's headcount and the Take 5
      attendance are both built from.
    */
    const people = onTheJob([scope('Switchboard', 'Jamie'), scope('Lighting', 'Jamie'), scope('Final fix', 'Dana')]);
    expect(people.map(p => p.name)).toEqual(['Jamie', 'Dana']);
  });

  it('ignores scopes nobody is on yet', () => {
    expect(onTheJob([scope('Switchboard'), scope('Lighting', 'Dana')]).map(p => p.name)).toEqual(['Dana']);
  });

  it('a scope with no lead is a note, not a fault', () => {
    /* Writing scopes down before anybody is assigned is a normal way to plan a job. */
    const scopes = [scope('Switchboard'), scope('Lighting', 'Dana')];
    expect(unled(scopes).map(s => s.name)).toEqual(['Switchboard']);
    expect(crewWatch(job({ supervisorName: 'Hal Walker' }), scopes).state).toBe('split');
  });

  it('reads as a sentence with the leads on the end', () => {
    const w = crewWatch(
      job({ supervisorName: 'Hal Walker' }),
      [scope('Switchboard', 'Jamie'), scope('Lighting', 'Dana')],
    );
    const line = crewLine(w);
    expect(line).toContain('Hal Walker');
    expect(line).toMatch(/2 crew leads: Jamie, Dana/);
  });

  it('an unheld job says the problem and nothing else', () => {
    const line = crewLine(crewWatch(job(), [scope('A', 'Jamie'), scope('B', 'Dana')]));
    expect(line).toMatch(/nobody over the whole job/i);
    expect(line).not.toMatch(/crew leads/);
  });
});

describe('the rule arrives before the refusal', () => {
  it('explains what a supervisor is FOR, not that a field is needed', () => {
    expect(WHY_ONE_SUPERVISOR).toMatch(/carry the join/i);
    expect(WHY_ONE_SUPERVISOR).toMatch(/whole job/i);
    expect(WHY_ONE_SUPERVISOR.length).toBeGreaterThan(120);
  });
});
