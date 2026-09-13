import { describe, it, expect } from 'vitest';
import { startHere } from '../src/lib/start-here';

/*
  ── The foundation, on the page they open every morning ──────────────────────────────────────────

  The org chart is not a feature of SPEC, it is the thing SPEC stands on: roles report to roles, and
  every score rolls up the lines drawn there. Link, then Flow, then Grow — always in that order.

  And it was reachable from a one-time welcome banner and a list at the BOTTOM of My Page. Close the
  banner, come back tomorrow, and you had to scroll past your whole day to find the step you were
  supposed to do first. Kris could not find it, and he designed the method — a GM on a phone had no
  chance at all.
*/

const drawn = { onChart: 12, scoredRoles: 4, rolesWithKpis: 1 };

describe('the one thing to do next', () => {
  it('leads with the chart while nobody but the signer is on it', () => {
    const next = startHere({ onChart: 1, scoredRoles: 1, rolesWithKpis: 0 });
    expect(next?.step).toBe('chart');
    expect(next?.href).toBe('/org');
  });

  it('counts a brand-new business with nobody on the chart the same way', () => {
    expect(startHere({ onChart: 0, scoredRoles: 0, rolesWithKpis: 0 })?.step).toBe('chart');
  });

  /*
    Names, not seats. Writing the business down is free and costs nobody a licence; waiting for
    people to be INVITED would hold the prompt open for weeks and confuse "we have not drawn it"
    with "we have not paid for it".
  */
  it('stops asking as soon as the business is written down, invited or not', () => {
    expect(startHere({ onChart: 2, scoredRoles: 0, rolesWithKpis: 0 })).toBeNull();
  });

  it('then asks for the numbers, once there are roles to measure', () => {
    const next = startHere({ onChart: 12, scoredRoles: 4, rolesWithKpis: 0 });
    expect(next?.step).toBe('kpis');
    expect(next?.href).toBe('/setup/kpis');
  });

  /*
    Scaffolding for the first week, not furniture. A prompt that never goes away is a prompt people
    learn to look past — and then the next one is invisible too.
  */
  it('disappears entirely once the business is standing on its own', () => {
    expect(startHere(drawn)).toBeNull();
  });

  it('never asks two things at once', () => {
    for (const state of [
      { onChart: 0, scoredRoles: 0, rolesWithKpis: 0 },
      { onChart: 1, scoredRoles: 3, rolesWithKpis: 0 },
      { onChart: 9, scoredRoles: 3, rolesWithKpis: 0 },
      drawn,
    ]) {
      const next = startHere(state);
      // One step or none. A list of five things to do is a list nobody starts.
      expect(next === null || typeof next.step === 'string').toBe(true);
    }
  });

  it('says why it matters, not just what to press', () => {
    const next = startHere({ onChart: 1, scoredRoles: 1, rolesWithKpis: 0 })!;
    expect(next.why.length).toBeGreaterThan(80);
    expect(next.why, 'a new customer fears being billed for writing names down').toMatch(/nothing is charged|costs nobody/i);
    expect(next.action.length).toBeGreaterThan(5);
  });
});
