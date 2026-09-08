import { describe, it, expect } from 'vitest';
import { placementOf, pencilled, structureLooksReady, roleChangeFor } from '../src/lib/staff';

const roles = [
  { id: 'gm', title: 'General Manager', level: 'gm', reportsTo: null },
  { id: 'ops', title: 'Head of Operations', level: 'manager', reportsTo: 'gm' },
  { id: 'com', title: 'Head of Commercial', level: 'manager', reportsTo: 'gm' },
];
const staff = [
  { id: 's1', name: 'A. Person', userId: null },
  { id: 's2', name: 'B. Person', userId: 'u2' },
];

describe('two-stage staffing', () => {
  it('separates pencilled in from having an account', () => {
    const a = [
      { roleId: 'ops', staffId: 's1', userId: null, toDate: null },
      { roleId: 'com', staffId: 's2', userId: 'u2', toDate: null },
    ];
    expect(placementOf('ops', a)).toBe('pencilled');   // no account, no seat, no email sent
    expect(placementOf('com', a)).toBe('invited');
    expect(placementOf('gm', a)).toBe('empty');
  });

  it('queues only the people who still need an invite', () => {
    const a = [
      { roleId: 'ops', staffId: 's1', userId: null, toDate: null },
      { roleId: 'com', staffId: 's2', userId: 'u2', toDate: null },
    ];
    expect(pencilled(a, staff).map(p => p.person.name)).toEqual(['A. Person']);
  });

  it('ignores closed assignments so history never resurfaces as current', () => {
    const a = [{ roleId: 'ops', staffId: 's1', userId: null, toDate: '2026-01-01' }];
    expect(placementOf('ops', a)).toBe('empty');
    expect(pencilled(a, staff)).toHaveLength(0);
  });

  it('only calls the structure ready once every role below the GM is filled', () => {
    expect(structureLooksReady(roles, [{ roleId: 'ops', staffId: 's1', userId: null, toDate: null }])).toBe(false);
    expect(structureLooksReady(roles, [
      { roleId: 'ops', staffId: 's1', userId: null, toDate: null },
      { roleId: 'com', staffId: 's2', userId: 'u2', toDate: null },
    ])).toBe(true);
  });

  it('asks move-or-merge when a name lands in a second role, and stays quiet otherwise', () => {
    const a = [{ roleId: 'ops', staffId: 's1', userId: null, toDate: null }];
    const prompt = roleChangeFor('s1', 'com', roles, a, staff)!;
    expect(prompt.fromRoleTitle).toBe('Head of Operations');
    expect(prompt.toRoleTitle).toBe('Head of Commercial');

    expect(roleChangeFor('s2', 'com', roles, a, staff)).toBeNull();   // holds nothing yet
    expect(roleChangeFor('s1', 'ops', roles, a, staff)).toBeNull();   // same role, not a change
  });
});
