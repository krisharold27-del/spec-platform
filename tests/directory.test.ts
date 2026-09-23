import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildDirectory, searchDirectory, directoryRows, licenceLine, telHref, mailHref, contactField, isoDay,
  mayEditContact, DIRECTORY_HEADER, type DirectoryInput,
} from '../src/lib/directory';
import { csvCell, toCsv, csvName } from '../src/lib/csv';

/*
  The staff list — Kris, 23 September: "we must have full staff lists". One row per PERSON, the whole
  business, leaders and pooled team members alike; the directory for everybody, Clear to Work and
  licences only down the viewer's own line.
*/

const NOW = new Date('2026-09-23T09:00:00Z');

/** GM → Ops Manager → Technicians (a team of three, one pencilled). A board role above the GM. */
function business(over: Partial<DirectoryInput> = {}): DirectoryInput {
  return {
    roles: [
      { id: 'board', title: 'Chair', reportsToRoleId: null, isTeam: false, stream: 'board' },
      { id: 'gm', title: 'General Manager', reportsToRoleId: 'board', isTeam: false, stream: 'gm' },
      { id: 'ops', title: 'Operations Manager', reportsToRoleId: 'gm', isTeam: false, stream: 'operations' },
      { id: 'sales', title: 'Sales Supervisor', reportsToRoleId: 'gm', isTeam: false, stream: 'growth' },
      { id: 'techs', title: 'Technicians', reportsToRoleId: 'ops', isTeam: true, stream: 'operations' },
    ],
    assignments: [
      { roleId: 'gm', userId: 'u-kris', staffId: null, fromDate: '2026-09-01T00:00:00Z', toDate: null },
      { roleId: 'ops', userId: 'u-ant', staffId: 's-ant', fromDate: '2026-09-02T00:00:00Z', toDate: null },
      { roleId: 'sales', userId: 'u-jo', staffId: null, fromDate: '2026-09-03T00:00:00Z', toDate: null },
      { roleId: 'techs', userId: 'u-sam', staffId: null, fromDate: '2026-09-05T00:00:00Z', toDate: null },
      { roleId: 'techs', userId: null, staffId: 's-lee', fromDate: '2026-09-06T00:00:00Z', toDate: null },
      { roleId: 'techs', userId: null, staffId: 's-max', fromDate: '2026-09-06T00:00:00Z', toDate: null },
      // Sam used to be in sales; his first day with the business is that one.
      { roleId: 'sales', userId: 'u-sam', staffId: null, fromDate: '2026-08-01T00:00:00Z', toDate: '2026-09-04T00:00:00Z' },
    ],
    staff: [
      { id: 's-ant', name: 'Anthony', userId: 'u-ant', phone: '0400 111 222', email: null, startDate: null },
      { id: 's-lee', name: 'Lee', userId: null, phone: '0400 333 444', email: 'lee@example.com', startDate: '2019-03-01' },
      { id: 's-max', name: 'Max', userId: null, phone: null, email: 'not an address', startDate: null },
      { id: 's-new', name: 'Pat', userId: null, phone: null, email: null, startDate: null },
    ],
    users: [
      { id: 'u-kris', name: 'Kris', email: 'kris@example.com', phone: '+61 400 000 001', startDate: '2015-01-01' },
      { id: 'u-ant', name: 'Anthony', email: 'ant@example.com', phone: null, startDate: null },
      { id: 'u-jo', name: 'Jo', email: 'jo@example.com', phone: null, startDate: null },
      { id: 'u-sam', name: 'Sam', email: 'sam@example.com', phone: null, startDate: null },
    ],
    obligations: [
      { what: 'White card', expiresAt: '2026-09-01', staffId: 's-lee', userId: null, roleId: null },
      { what: 'Forklift', expiresAt: '2026-10-10', staffId: null, userId: 'u-sam', roleId: null },
      { what: 'Contract', expiresAt: null, staffId: null, userId: 'u-sam', roleId: null },
      { what: 'Insurance certificate', expiresAt: '2026-09-30', staffId: null, userId: null, roleId: 'techs' },
      { what: 'Car licence', expiresAt: '2026-09-02', staffId: null, userId: 'u-jo', roleId: null },
    ],
    clearByKey: new Map([
      ['user:u-ant', { clear: 'clear' as const, label: 'Clear to work', reason: '' }],
      ['user:u-sam', { clear: 'clear' as const, label: 'Clear to work', reason: '' }],
      ['staff:s-lee', { clear: 'blocked' as const, label: 'Not clear', reason: 'White card expired' }],
      ['staff:s-max', { clear: 'unknown' as const, label: 'Not established', reason: '' }],
    ]),
    // The viewer is the Operations Manager: their own role and the technicians.
    canSee: id => id === 'ops' || id === 'techs',
    selfKey: 'user:u-ant',
    now: NOW,
    ...over,
  };
}

const byName = (list: ReturnType<typeof buildDirectory>, name: string) => list.find(p => p.name === name)!;

describe('the whole business, one row a person', () => {
  const list = buildDirectory(business());

  it('lists every person — leaders, every member of a pooled team, and names not on the chart yet', () => {
    expect(list.map(p => p.name)).toEqual(['Anthony', 'Jo', 'Kris', 'Lee', 'Max', 'Pat', 'Sam']);
  });

  it('a pencilled name who was later invited is one person, not two', () => {
    expect(list.filter(p => p.name === 'Anthony')).toHaveLength(1);
    expect(byName(list, 'Anthony').key).toBe('user:u-ant');
    expect(byName(list, 'Anthony').staffId).toBe('s-ant');
  });

  it('says who each person reports to, by name and role, and marks a team', () => {
    expect(byName(list, 'Sam').roles).toEqual([{ roleId: 'techs', title: 'Technicians', reportsTo: 'Anthony — Operations Manager', isTeam: true }]);
    expect(byName(list, 'Anthony').roles[0].reportsTo).toBe('Kris — General Manager');
    // The chair's role has nobody in it — its title stands in.
    expect(byName(list, 'Kris').roles[0].reportsTo).toBe('Chair');
    expect(byName(list, 'Pat').roles).toEqual([]);
  });

  it('takes the phone from the login, else from the staff row it was invited from; never a non-address as email', () => {
    expect(byName(list, 'Anthony').phone).toBe('0400 111 222');
    expect(byName(list, 'Anthony').email).toBe('ant@example.com');
    expect(byName(list, 'Max').email).toBeNull();
    expect(byName(list, 'Lee').email).toBe('lee@example.com');
  });

  it('a stated start date wins; otherwise the first day on the chart, and it says which', () => {
    expect(byName(list, 'Kris')).toMatchObject({ startDate: '2015-01-01', startFrom: 'stated' });
    expect(byName(list, 'Lee')).toMatchObject({ startDate: '2019-03-01', startFrom: 'stated' });
    expect(byName(list, 'Sam')).toMatchObject({ startDate: '2026-08-01', startFrom: 'chart' });
    expect(byName(list, 'Pat')).toMatchObject({ startDate: null, startFrom: null });
  });
});

describe('only me and above', () => {
  const list = buildDirectory(business());

  it('shows Clear to Work and licences for the viewer and the people beneath them', () => {
    expect(byName(list, 'Lee').clear).toEqual({ state: 'blocked', label: 'Not clear', reason: 'White card expired' });
    expect(byName(list, 'Anthony').clear?.state).toBe('clear');
    expect(byName(list, 'Max').clear?.label).toBe('Not established');
  });

  it('never sideways and never above — null, not a guess', () => {
    for (const n of ['Jo', 'Kris', 'Pat']) {
      expect(byName(list, n).clear, n).toBeNull();
      expect(byName(list, n).licences, n).toBeNull();
      expect(byName(list, n).canOpenCard, n).toBe(false);
    }
    // Jo has an expired licence — and the Operations Manager, who is sideways, is not shown it.
    expect(JSON.stringify(byName(list, 'Jo'))).not.toContain('Car licence');
  });

  it('licences: the person’s own and their role’s, expired first, current ones left out', () => {
    // The contract does not expire, so it is not on the list; the role's certificate is.
    expect(byName(list, 'Sam').licences!.map(l => [l.what, l.state])).toEqual([
      ['Insurance certificate', 'expiring'], ['Forklift', 'expiring'],
    ]);
    expect(byName(list, 'Lee').licences!.map(l => l.state)).toEqual(['expired', 'expiring']);
    expect(licenceLine(byName(list, 'Lee').licences)).toBe('White card expired 2026-09-01; Insurance certificate expires 2026-09-30');
    expect(licenceLine(null)).toBe('');
    expect(licenceLine([])).toBe('Nothing expiring');
  });

  it('never sideways inside a pooled team: one technician does not read another’s licences', () => {
    const sam = buildDirectory(business({ canSee: id => id === 'techs', selfKey: 'user:u-sam', ownRoleId: 'techs' }));
    expect(byName(sam, 'Sam').licences).not.toBeNull();
    expect(byName(sam, 'Lee').clear).toBeNull();
    expect(byName(sam, 'Lee').licences).toBeNull();
    expect(byName(sam, 'Max').clear).toBeNull();
    // The Operations Manager, above the team, still sees every one of them.
    const ops = buildDirectory(business({ ownRoleId: 'ops' }));
    expect(byName(ops, 'Lee').clear?.state).toBe('blocked');
  });

  it('the Clear to Work shown is the schedule’s own answer (crewFor), not a second calculation', () => {
    const lib = readFileSync('src/lib/directory-data.ts', 'utf8');
    expect(lib).toContain('crewFor(user)');
    expect(lib).toContain('clearByKey: new Map(crew.map(');
    expect(readFileSync('src/lib/directory.ts', 'utf8')).not.toContain('getScorecard');
  });

  it('the CSV leaves the gated columns blank outside the line', () => {
    const rows = directoryRows(list);
    const jo = rows.find(r => r[0] === 'Jo')!;
    expect(jo[DIRECTORY_HEADER.indexOf('Clear to work')]).toBe('');
    expect(jo[DIRECTORY_HEADER.indexOf('Licences')]).toBe('');
    const lee = rows.find(r => r[0] === 'Lee')!;
    expect(lee[DIRECTORY_HEADER.indexOf('Clear to work')]).toBe('Not clear');
    expect(lee[DIRECTORY_HEADER.indexOf('Role')]).toBe('Technicians');
    expect(rows.find(r => r[0] === 'Pat')![1]).toBe('Not on the chart yet');
  });
});

describe('finding somebody', () => {
  const list = buildDirectory(business());
  it('by name, role, boss, or any way the number is typed', () => {
    expect(searchDirectory(list, 'techn').map(p => p.name)).toEqual(['Lee', 'Max', 'Sam']);
    expect(searchDirectory(list, 'anthony operations').map(p => p.name)).toEqual(['Anthony', 'Lee', 'Max', 'Sam']);
    expect(searchDirectory(list, '0400333444').map(p => p.name)).toEqual(['Lee']);
    expect(searchDirectory(list, '')).toHaveLength(list.length);
  });
});

describe('who may change whose details', () => {
  const list = buildDirectory(business());
  const scope = { canEdit: (id: string) => id === 'ops' || id === 'techs' };
  const viewer = (access: string) => ({ access });

  it('themselves, and a manager for the people in their line', () => {
    expect(mayEditContact(byName(list, 'Anthony'), viewer('readonly'), { canEdit: () => false }, 'user:u-ant')).toBe(true);
    expect(mayEditContact(byName(list, 'Lee'), viewer('full'), scope, 'user:u-ant')).toBe(true);
    expect(mayEditContact(byName(list, 'Jo'), viewer('full'), scope, 'user:u-ant')).toBe(false);
    expect(mayEditContact(byName(list, 'Kris'), viewer('administrator'), scope, 'user:u-ant')).toBe(false);
  });

  it('an administrator for somebody not on the chart yet, who is nobody’s line', () => {
    expect(mayEditContact(byName(list, 'Pat'), viewer('administrator'), scope, 'user:u-ant')).toBe(true);
    expect(mayEditContact(byName(list, 'Pat'), viewer('full'), scope, 'user:u-ant')).toBe(false);
  });

  it('the action re-checks on the server and never changes a login’s sign-in address', () => {
    const actions = readFileSync('src/app/people/actions.ts', 'utf8');
    const save = actions.slice(actions.indexOf('export async function saveStaffContact'));
    expect(save).toContain('mayEditContact(person, user, scope, selfKey)');
    expect(save).toContain('assertWritable(user.tenantId)');
    expect(save).not.toMatch(/schema\.users\)\.set\(\{[^}]*email/);
  });
});

describe('tap to call, tap to email', () => {
  it('dials a number however it was typed', () => {
    expect(telHref('0400 111 222')).toBe('tel:0400111222');
    expect(telHref('+61 (4) 00-000-001')).toBe('tel:+61400000001');
    expect(telHref('call me')).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it('opens the person’s own mail app at the address — no subject, no body, nothing SPEC wrote', () => {
    expect(mailHref('lee@example.com')).toBe('mailto:lee@example.com');
    expect(mailHref('not an address')).toBeNull();
    expect(mailHref('a b@c.d')).toBeNull();
    expect(mailHref('lee@example.com')).not.toMatch(/[?&](subject|body)=/);
  });

  it('keeps form fields bounded and dates real', () => {
    expect(contactField('  0400  ', 40)).toBe('0400');
    expect(contactField('', 40)).toBeNull();
    expect(contactField('x'.repeat(99), 40)).toHaveLength(40);
    expect(isoDay('2026-09-23')).toBe('2026-09-23');
    expect(isoDay('23/09/2026')).toBeNull();
    expect(isoDay('')).toBeNull();
  });
});

describe('CSV out', () => {
  it('quotes what would split a row, and doubles quotes', () => {
    expect(csvCell('Smith, Jones & Co')).toBe('"Smith, Jones & Co"');
    expect(csvCell('The "Big" Job')).toBe('"The ""Big"" Job"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('never lets a spreadsheet run a client’s name as a formula — but leaves a phone number alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('+61 400 000 001')).toBe('+61 400 000 001');
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc");
  });

  it('writes a whole file a spreadsheet opens with its accents intact', () => {
    const f = toCsv(['Name', 'Phone'], [['Zoë', '0400'], ['A, B', null]]);
    expect(f.startsWith('﻿')).toBe(true);
    expect(f).toBe('﻿Name,Phone\r\nZoë,0400\r\n"A, B",\r\n');
    expect(csvName('Staff', '2026-09-23T10:00:00Z')).toBe('staff-2026-09-23.csv');
  });
});
