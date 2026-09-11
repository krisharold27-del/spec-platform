import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS, LEVELS, stateOf, grantable, levelOf, STATE_LABEL, type Level,
} from '../src/lib/permissions';

const byId = (id: string) => PERMISSIONS.find(p => p.id === id)!;
const ALL: Level[] = ['director', 'gm', 'manager', 'scored', 'checklist'];

describe('the matrix', () => {
  it('covers every level for every permission', () => {
    for (const p of PERMISSIONS) {
      for (const l of ALL) expect(STATE_LABEL[stateOf(p, l)]).toBeTruthy();
    }
  });

  // A permission both built in and unavailable would be a contradiction the UI could not render.
  it('never puts a level in both always and never', () => {
    for (const p of PERMISSIONS) {
      for (const l of p.always) expect(p.never).not.toContain(l);
    }
  });

  it('names every level it references', () => {
    const known = new Set(LEVELS.map(l => l.key));
    for (const p of PERMISSIONS) {
      for (const l of [...p.always, ...p.never]) expect(known.has(l)).toBe(true);
    }
  });
});

describe('stateOf', () => {
  it('reads built in, not available, and grantable', () => {
    expect(stateOf(byId('own_scorecard'), 'scored')).toBe('always');
    expect(stateOf(byId('score_role'), 'checklist')).toBe('never');
    expect(stateOf(byId('personal_records'), 'manager')).toBe('grant');
  });

  // A checklist role is measured through the role above it, so it never sees a team — but being
  // measured by something you are not allowed to read would be indefensible.
  it('always gives a checklist role its own card, and nothing else', () => {
    expect(stateOf(byId('own_scorecard'), 'checklist')).toBe('always');
    for (const p of PERMISSIONS) {
      if (p.id === 'own_scorecard') continue;
      expect(stateOf(p, 'checklist')).not.toBe('always');
    }
  });

  it('gives every level its own card', () => {
    for (const l of ALL) expect(stateOf(byId('own_scorecard'), l)).toBe('always');
  });
});

describe('the two that are never delegable', () => {
  it('marks approving a sensitive connector and signing a period as undelegable', () => {
    expect(byId('approve_sensitive').undelegable).toBe(true);
    expect(byId('sign_period').undelegable).toBe(true);
  });

  // No administrator can hand these over, including to themselves.
  it('refuses to grant them at any level at all', () => {
    for (const l of ALL) {
      expect(grantable(byId('approve_sensitive'), l)).toBe(false);
      expect(grantable(byId('sign_period'), l)).toBe(false);
    }
  });

  it('leaves both with the board, and nowhere else', () => {
    expect(byId('approve_sensitive').always).toEqual(['director']);
    expect(byId('sign_period').always).toEqual(['director']);
  });
});

describe('grantable', () => {
  it('is true only where a permission is off by default and delegable', () => {
    expect(grantable(byId('personal_records'), 'manager')).toBe(true);
    expect(grantable(byId('own_scorecard'), 'scored')).toBe(false);
    expect(grantable(byId('score_role'), 'checklist')).toBe(false);
  });
});

describe('levelOf', () => {
  it('maps the schema levels onto the five the matrix uses', () => {
    expect(levelOf('gm')).toBe('gm');
    expect(levelOf('manager')).toBe('manager');
    expect(levelOf('supervisor')).toBe('manager');
    expect(levelOf('staff')).toBe('checklist');
    expect(levelOf('specialist')).toBe('scored');
  });

  // Board roles sit on top and are not functional; being a director is not a rung on the ladder.
  it('treats a director as a director whatever role they hold', () => {
    expect(levelOf('staff', true)).toBe('director');
    expect(levelOf('gm', true)).toBe('director');
  });
});
