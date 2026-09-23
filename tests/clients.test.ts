import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildClients, buildContacts, clientKeyForJob, clientKeyForDeal, planJobLinks, matchClient, normName,
  searchClients, searchContacts, suppliersFrom, clientRows, contactRows, parseClientKey, uniqueSites,
  CLIENTS_HEADER, UNNAMED_CLIENT, type OrgIn, type PersonIn, type DealIn, type JobIn,
} from '../src/lib/clients';

/*
  Clients and contacts — Kris, 23 September: "we must have full client lists, we must have contacts
  and the ability to do the job". One list from the CRM's organisations and people and every job's
  client, seen whole; nothing copied.
*/

const orgs: OrgIn[] = [
  { id: 'o-build', name: 'Harbour Builders', address: '1 Quay St', phone: '02 9000 0000' },
  { id: 'o-strata', name: 'Strata Plan 42', address: '', phone: '' },
];
const people: PersonIn[] = [
  { id: 'p-dana', organisationId: 'o-build', name: 'Dana', email: 'dana@example.com', phone: '0400 000 111' },
  { id: 'p-sam', organisationId: null, name: 'Sam Lee', email: '', phone: '0400 222 333' },
];
const job = (id: string, ref: string, client: string, stage: string, valueCents: number, extra: Partial<JobIn> = {}): JobIn => ({
  id, ref, title: `Job ${ref}`, client, site: '', stage, valueCents, organisationId: null, personId: null,
  createdAt: `2026-09-${ref.slice(-2)}T00:00:00Z`, ...extra,
});
const jobs: JobIn[] = [
  job('j1', 'J-1001', 'Harbour Builders', 'onsite', 500_000, { organisationId: 'o-build', site: '12 Pier Rd' }),
  job('j2', 'J-1002', 'harbour builders ', 'invoiced', 200_000, { site: '12 pier rd' }), // name only, matches
  job('j3', 'J-1003', 'Sam Lee', 'paid', 80_000), // a homeowner, by name
  job('j4', 'J-1004', 'Corner Cafe', 'invoiced', 30_000, { site: 'King St' }), // on jobs only
  job('j5', 'J-1005', 'Corner Cafe', 'enquiry', 0),
  job('j6', 'J-1006', UNNAMED_CLIENT, 'enquiry', 0),
  job('j7', 'J-1007', 'Someone', 'won', 10_000, { personId: 'p-dana' }), // a contact brings the org
];
const deals: DealIn[] = [
  { id: 'd1', title: 'Level 2 fitout', organisationId: 'o-build', personId: 'p-dana', site: 'Level 2', valueCents: 900_000, status: 'open', jobId: null },
  { id: 'd2', title: 'Old one', organisationId: 'o-build', personId: null, site: '', valueCents: 1, status: 'lost', jobId: null },
  { id: 'd3', title: 'Solar', organisationId: null, personId: 'p-sam', site: '', valueCents: 40_000, status: 'open', jobId: null },
];

const list = buildClients({ organisations: orgs, people, deals, jobs });
const get = (key: string) => list.find(c => c.key === key)!;

describe('one list of every client', () => {
  it('organisations, homeowners and names only on jobs — each once', () => {
    expect(list.map(c => [c.name, c.kind])).toEqual([
      ['Corner Cafe', 'jobs'], ['Harbour Builders', 'organisation'], ['New client', 'jobs'],
      ['Sam Lee', 'person'], ['Strata Plan 42', 'organisation'],
    ]);
  });

  it('a job belongs by its link, else by its exact name (case and spacing aside), else to its own name', () => {
    expect(clientKeyForJob(jobs[0], orgs, people)).toBe('org:o-build');
    expect(clientKeyForJob(jobs[1], orgs, people)).toBe('org:o-build');
    expect(clientKeyForJob(jobs[2], orgs, people)).toBe('person:p-sam');
    expect(clientKeyForJob(jobs[3], orgs, people)).toBe('name:corner cafe');
    expect(clientKeyForJob(jobs[6], orgs, people)).toBe('org:o-build');
    // "Harbour" is not "Harbour Builders": nothing cleverer than exact.
    expect(clientKeyForJob(job('x', 'J-1099', 'Harbour', 'enquiry', 0), orgs, people)).toBe('name:harbour');
  });

  it('carries sites, contacts, live and past jobs, and only open deals', () => {
    const hb = get('org:o-build');
    expect(hb.sites).toEqual(['1 Quay St', '12 Pier Rd', 'Level 2']);
    expect(hb.contacts.map(p => p.name)).toEqual(['Dana']);
    expect(hb.liveJobs.map(j => j.ref)).toEqual(['J-1007', 'J-1002', 'J-1001']);
    expect(hb.pastJobs).toEqual([]);
    expect(hb.openDeals.map(d => d.id)).toEqual(['d1']);
    expect(get('person:p-sam').pastJobs.map(j => j.ref)).toEqual(['J-1003']);
    expect(get('person:p-sam').openDeals.map(d => d.id)).toEqual(['d3']);
  });

  it('invoiced is jobs marked invoiced or paid; owed is invoiced and not yet paid — nothing invented', () => {
    expect(get('org:o-build')).toMatchObject({ invoicedCents: 200_000, owedCents: 200_000 });
    expect(get('person:p-sam')).toMatchObject({ invoicedCents: 80_000, owedCents: 0 });
    expect(get('name:corner cafe')).toMatchObject({ invoicedCents: 30_000, owedCents: 30_000 });
    expect(get('org:o-strata')).toMatchObject({ invoicedCents: 0, owedCents: 0, liveJobs: [], pastJobs: [] });
  });

  it('a deal is its organisation’s, else its person’s organisation’s, else the person’s', () => {
    expect(clientKeyForDeal(deals[0], orgs, people)).toBe('org:o-build');
    expect(clientKeyForDeal({ organisationId: null, personId: 'p-dana' }, orgs, people)).toBe('org:o-build');
    expect(clientKeyForDeal(deals[2], orgs, people)).toBe('person:p-sam');
    expect(clientKeyForDeal({ organisationId: null, personId: null }, orgs, people)).toBeNull();
  });

  it('only the deals it is given — the page passes the viewer’s own line’s', () => {
    const none = buildClients({ organisations: orgs, people, deals: [], jobs });
    expect(none.every(c => c.openDeals.length === 0)).toBe(true);
    const data = readFileSync('src/lib/clients-data.ts', 'utf8');
    expect(data).toContain('canSeeDeal(d.ownerRoleId, scope.visible, user.access)');
  });

  it('finds a client by name, site, contact, number or J-number', () => {
    expect(searchClients(list, 'pier').map(c => c.name)).toEqual(['Harbour Builders']);
    expect(searchClients(list, 'dana').map(c => c.name)).toEqual(['Harbour Builders']);
    expect(searchClients(list, 'J-1004').map(c => c.name)).toEqual(['Corner Cafe']);
    expect(searchClients(list, '0400 222')).toHaveLength(1);
  });

  it('sites once each, however they were typed', () => {
    expect(uniqueSites(['12 Pier Rd', '12 pier rd.', ' ', null, 'Level 2'])).toEqual(['12 Pier Rd', 'Level 2']);
  });
});

describe('linking what is already there — additive', () => {
  it('fills only a null link, and only on an exact, single match', () => {
    const plan = planJobLinks(jobs, orgs, people);
    expect(plan).toEqual([
      { jobId: 'j2', organisationId: 'o-build', personId: null },
      { jobId: 'j3', organisationId: null, personId: 'p-sam' },
    ]);
    // Two organisations of one name is a question for a person, not a guess.
    expect(planJobLinks([jobs[3]], [...orgs, { id: 'a', name: 'Corner Cafe' }, { id: 'b', name: 'corner cafe' }], people)).toEqual([]);
    // Never a job with no client given.
    expect(planJobLinks([jobs[5]], [...orgs, { id: 'n', name: UNNAMED_CLIENT }], people)).toEqual([]);
  });

  it('a new job’s typed name matches the list, or is made a client — never "New client"', () => {
    expect(matchClient('HARBOUR BUILDERS', orgs, people)).toEqual({ organisationId: 'o-build', personId: null });
    expect(matchClient('sam lee', orgs, people)).toEqual({ organisationId: null, personId: 'p-sam' });
    expect(matchClient('Dana', orgs, people)).toBeNull(); // a contact at a company is not a client of her own
    expect(matchClient(UNNAMED_CLIENT, orgs, people)).toBeNull();
    expect(normName('  Harbour   Builders. ')).toBe('harbour builders');
  });

  it('the one creation path links every new job to its client', () => {
    const data = readFileSync('src/lib/jobs-data.ts', 'utf8');
    expect(data).toContain('matchClient(input.client, orgs, people)');
    expect(data).toContain('organisationId, personId,');
    const crm = readFileSync('src/app/crm/actions.ts', 'utf8');
    expect(crm).toContain('personId: person?.id ?? null');
  });

  it('the link press never rewrites a job’s words or moves a linked job', () => {
    const actions = readFileSync('src/app/clients/actions.ts', 'utf8');
    const link = actions.slice(actions.indexOf('export async function linkJobClients'));
    expect(link).toContain('isNull(schema.jobs.organisationId), isNull(schema.jobs.personId)');
    expect(link).not.toMatch(/set\(\{[^}]*client:/);
  });
});

describe('contacts', () => {
  const contacts = buildContacts(list, people, deals, jobs, suppliersFrom([
    { supplier: 'Sparky Wholesale' }, { supplier: 'sparky wholesale' }, { supplier: '' }, { supplier: 'Cable Co' },
  ]));

  it('every person at a client and every supplier the catalogue names, with their jobs and deals', () => {
    expect(contacts.map(c => [c.name, c.kind, c.clientName])).toEqual([
      ['Cable Co', 'supplier', 'Supplier'],
      ['Dana', 'client', 'Harbour Builders'],
      ['Sam Lee', 'client', 'Their own client'],
      ['Sparky Wholesale', 'supplier', 'Supplier'],
    ]);
    const dana = contacts.find(c => c.name === 'Dana')!;
    expect(dana.jobs.map(j => j.ref)).toEqual(['J-1007']);
    expect(dana.openDeals.map(d => d.id)).toEqual(['d1']);
    expect(dana.clientKey).toBe('org:o-build');
    expect(contacts.find(c => c.name === 'Sam Lee')!.jobs.map(j => j.ref)).toEqual(['J-1003']);
    expect(contacts.find(c => c.name === 'Sparky Wholesale')!.items).toBe(2);
    expect(searchContacts(contacts, 'harbour').map(c => c.name)).toEqual(['Dana']);
  });

  it('CSV rows for both lists', () => {
    const rows = clientRows(list);
    const hb = rows.find(r => r[0] === 'Harbour Builders')!;
    expect(hb[CLIENTS_HEADER.indexOf('Owed ex GST')]).toBe('2000.00');
    expect(hb[CLIENTS_HEADER.indexOf('Contacts')]).toBe('Dana 0400 000 111 dana@example.com');
    expect(contactRows(contacts).find(r => r[0] === 'Dana')).toEqual(['Dana', 'Client contact', 'Harbour Builders', '0400 000 111', 'dana@example.com', 'J-1007', 'Level 2 fitout']);
  });
});

describe('the page and its actions', () => {
  const page = readFileSync('src/app/clients/page.tsx', 'utf8');
  const actions = readFileSync('src/app/clients/actions.ts', 'utf8');

  it('reads a client key from the address and nothing else', () => {
    expect(parseClientKey('org:abc')).toEqual({ kind: 'org', id: 'abc' });
    expect(parseClientKey('name:corner cafe')).toEqual({ kind: 'name', id: 'corner cafe' });
    expect(parseClientKey('drop table')).toBeNull();
    expect(parseClientKey('org:')).toBeNull();
  });

  it('one press starts a job or a quote, through the one creation path', () => {
    expect(page).toContain('name="intent" value="job"');
    expect(page).toContain('name="intent" value="quote"');
    expect(actions).toContain('createJob(');
    expect(actions).toContain('startQuote(fd)');
  });

  it('every write starts at the manager gate and re-reads ids with the tenant', () => {
    const writes = actions.match(/export async function \w+/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(6);
    for (const w of writes) {
      const body = actions.slice(actions.indexOf(w)).split('\nexport async function')[0];
      expect(body, w).toContain('await writer()');
    }
    expect(actions).toContain('eq(schema.crmOrganisations.tenantId, tenantId)');
  });

  it('tap to call and tap to email — SPEC composes and sends nothing', () => {
    expect(page).toContain('telHref(');
    expect(page).toContain('mailHref(');
    expect(page).not.toMatch(/mailto:[^'"`]*\?/);
    expect(page).not.toMatch(/from '@\/lib\/email'/);
  });
});
