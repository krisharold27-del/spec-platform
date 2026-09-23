/**
 * The client list and the contacts — every customer the business has, in one place. Pure, no I/O.
 *
 * Kris, 23 September: *"we must have full client lists, we must have contacts and the ability to do
 * the job"*. Clients lived in two places that did not know about each other: the CRM's
 * organisations and people, and the words typed into a job's client field. A service call typed
 * straight into Jobs never reached the CRM, so neither list was the whole list.
 *
 * ── One list, built from what is already there ─────────────────────────────────────────────────
 *
 * No new table. A client is one of three things:
 *
 *   · an **organisation** in the CRM (`crm_organisations`) — a builder, a strata, a company;
 *   · a **person** in the CRM with no organisation (`crm_people`) — a homeowner;
 *   · a **name on jobs only** — typed into a job before the client list existed, or never linked.
 *
 * A job belongs to a client by its link (`jobs.organisation_id` / `jobs.person_id`) when it has one,
 * and otherwise by its client's NAME matching an organisation or a homeowner exactly (case and
 * spacing aside). Anything left over is a jobs-only client under its own name, so nothing the
 * business ever typed falls off the list. Linking those by name is one press on /clients, and
 * additive: it only ever fills a null link, and the words on the job are never rewritten.
 *
 * Money is what Jobs already knows, ex GST: invoiced is the value of jobs marked invoiced or paid,
 * owed is the value of jobs marked invoiced and not yet paid — the same "who owes what" the Jobs
 * billing tab reads. Nothing is invented where nothing was recorded.
 */
import type { Cell } from './csv';

export type ClientKind = 'organisation' | 'person' | 'jobs';

export interface OrgIn { id: string; name: string; address: string; phone: string }
export interface PersonIn { id: string; organisationId: string | null; name: string; email: string; phone: string }
export interface DealIn {
  id: string; title: string; organisationId: string | null; personId: string | null; site: string;
  valueCents: number; status: string; jobId: string | null;
}
export interface JobIn {
  id: string; ref: string; title: string; client: string; site: string; stage: string; valueCents: number;
  organisationId: string | null; personId: string | null; createdAt: string;
}

export interface Client {
  /** `org:<id>`, `person:<id>` or `name:<normalised name>` — the address of the client's page. */
  key: string;
  kind: ClientKind;
  name: string;
  phone: string;
  email: string;
  address: string;
  /** Every place work has been or is being done for them — the address first, then job and deal sites. */
  sites: string[];
  contacts: PersonIn[];
  openDeals: DealIn[];
  liveJobs: JobIn[];
  pastJobs: JobIn[];
  invoicedCents: number;
  owedCents: number;
}

/** What parseEnquiry calls a job with no client given — never a client of its own. */
export const UNNAMED_CLIENT = 'New client';

/** A name as the list compares it: case, spacing and trailing full stops aside. Nothing cleverer. */
export function normName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
}

const isNamed = (name: string) => Boolean(normName(name)) && normName(name) !== normName(UNNAMED_CLIENT);

/**
 * Which client a job is for. Its link wins; then an exact name match — an organisation first, then a
 * homeowner; then its own name. A person who belongs to an organisation brings the job to that
 * organisation, because that is the client.
 */
export function clientKeyForJob(job: Pick<JobIn, 'client' | 'organisationId' | 'personId'>, orgs: readonly OrgIn[], people: readonly PersonIn[]): string {
  if (job.organisationId && orgs.some(o => o.id === job.organisationId)) return `org:${job.organisationId}`;
  if (job.personId) {
    const p = people.find(x => x.id === job.personId);
    if (p?.organisationId && orgs.some(o => o.id === p.organisationId)) return `org:${p.organisationId}`;
    if (p) return `person:${p.id}`;
  }
  const n = normName(job.client);
  if (isNamed(job.client)) {
    const org = orgs.find(o => normName(o.name) === n);
    if (org) return `org:${org.id}`;
    const homeowner = people.find(p => !p.organisationId && normName(p.name) === n);
    if (homeowner) return `person:${homeowner.id}`;
  }
  return `name:${n || normName(UNNAMED_CLIENT)}`;
}

/** Which client a deal is for — its organisation, else its person (or that person's organisation). */
export function clientKeyForDeal(deal: Pick<DealIn, 'organisationId' | 'personId'>, orgs: readonly OrgIn[], people: readonly PersonIn[]): string | null {
  if (deal.organisationId && orgs.some(o => o.id === deal.organisationId)) return `org:${deal.organisationId}`;
  const p = deal.personId ? people.find(x => x.id === deal.personId) : undefined;
  if (p?.organisationId && orgs.some(o => o.id === p.organisationId)) return `org:${p.organisationId}`;
  return p ? `person:${p.id}` : null;
}

const LIVE_OWED = 'invoiced';
const INVOICED = new Set(['invoiced', 'paid']);

/**
 * The whole list. `deals` must already be the ones this viewer may see — a deal is still only its
 * owner's line's to see (lib/crm-data); the client itself, its sites, contacts and jobs are the
 * business's shared list, the way a job's client always was.
 */
export function buildClients(input: { organisations: readonly OrgIn[]; people: readonly PersonIn[]; deals: readonly DealIn[]; jobs: readonly JobIn[] }): Client[] {
  const { organisations: orgs, people, deals, jobs } = input;
  const out = new Map<string, Client>();
  const blank = (key: string, kind: ClientKind, name: string): Client => ({
    key, kind, name, phone: '', email: '', address: '', sites: [], contacts: [], openDeals: [],
    liveJobs: [], pastJobs: [], invoicedCents: 0, owedCents: 0,
  });

  for (const o of orgs) {
    const c = blank(`org:${o.id}`, 'organisation', o.name);
    c.phone = o.phone; c.address = o.address;
    c.contacts = people.filter(p => p.organisationId === o.id);
    out.set(c.key, c);
  }
  for (const p of people.filter(x => !x.organisationId || !orgs.some(o => o.id === x.organisationId))) {
    const c = blank(`person:${p.id}`, 'person', p.name);
    c.phone = p.phone; c.email = p.email;
    c.contacts = [p];
    out.set(c.key, c);
  }

  for (const j of jobs) {
    const key = clientKeyForJob(j, orgs, people);
    let c = out.get(key);
    if (!c) { c = blank(key, 'jobs', isNamed(j.client) ? j.client.trim() : UNNAMED_CLIENT); out.set(key, c); }
    (j.stage === 'paid' ? c.pastJobs : c.liveJobs).push(j);
    if (INVOICED.has(j.stage)) c.invoicedCents += j.valueCents;
    if (j.stage === LIVE_OWED) c.owedCents += j.valueCents;
  }
  for (const d of deals.filter(x => x.status === 'open')) {
    const key = clientKeyForDeal(d, orgs, people);
    const c = key ? out.get(key) : undefined;
    if (c) c.openDeals.push(d);
  }

  for (const c of out.values()) {
    const keyDeals = deals.filter(d => clientKeyForDeal(d, orgs, people) === c.key);
    c.sites = uniqueSites([c.address, ...[...c.liveJobs, ...c.pastJobs].map(j => j.site), ...keyDeals.map(d => d.site)]);
    c.liveJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    c.pastJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Sites, once each, in the order first met — "12 Smith St" and "12 smith st " are one site. */
export function uniqueSites(sites: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sites) {
    const t = (s ?? '').trim();
    if (!t || seen.has(normName(t))) continue;
    seen.add(normName(t));
    out.push(t);
  }
  return out;
}

export function searchClients(list: readonly Client[], q: string): Client[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter(c => {
    const hay = [c.name, c.phone, c.email, ...c.sites, ...c.contacts.flatMap(p => [p.name, p.phone, p.email]),
      ...c.liveJobs.map(j => j.ref), ...c.pastJobs.map(j => j.ref)].filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

export const KIND_LABEL: Record<ClientKind, string> = {
  organisation: 'Organisation',
  person: 'Person',
  jobs: 'On jobs only',
};

/* ── Linking what is already there ────────────────────────────────────────────────────────────── */

/**
 * The links to fill for jobs that carry only a client's name. Only a job with NO link is touched,
 * and only when its name matches exactly one client — an organisation, or a homeowner. Two
 * organisations with the same name is a question for a person, not a guess.
 */
export function planJobLinks(
  jobs: readonly Pick<JobIn, 'id' | 'client' | 'organisationId' | 'personId'>[],
  orgs: readonly Pick<OrgIn, 'id' | 'name'>[],
  people: readonly Pick<PersonIn, 'id' | 'name' | 'organisationId'>[],
): { jobId: string; organisationId: string | null; personId: string | null }[] {
  const out: { jobId: string; organisationId: string | null; personId: string | null }[] = [];
  for (const j of jobs) {
    if (j.organisationId || j.personId || !isNamed(j.client)) continue;
    const n = normName(j.client);
    const o = orgs.filter(x => normName(x.name) === n);
    if (o.length === 1) { out.push({ jobId: j.id, organisationId: o[0].id, personId: null }); continue; }
    if (o.length > 1) continue;
    const p = people.filter(x => !x.organisationId && normName(x.name) === n);
    if (p.length === 1) out.push({ jobId: j.id, organisationId: null, personId: p[0].id });
  }
  return out;
}

/**
 * The client a new job is linked to, from what the form said: a client picked on /clients wins;
 * otherwise a typed name that matches exactly one client. Null means "make it one" — see
 * `jobs-data`'s createJob, which adds the organisation so the next job for them links on its own.
 */
export function matchClient(
  name: string,
  orgs: readonly Pick<OrgIn, 'id' | 'name'>[],
  people: readonly Pick<PersonIn, 'id' | 'name' | 'organisationId'>[],
): { organisationId: string | null; personId: string | null } | null {
  if (!isNamed(name)) return null;
  const n = normName(name);
  const o = orgs.filter(x => normName(x.name) === n);
  if (o.length) return { organisationId: o[0].id, personId: null };
  const p = people.filter(x => !x.organisationId && normName(x.name) === n);
  if (p.length) return { organisationId: null, personId: p[0].id };
  return null;
}

export const namedClient = isNamed;

/* ── Contacts ─────────────────────────────────────────────────────────────────────────────────── */

export interface Contact {
  kind: 'client' | 'supplier';
  /** crm_people id, or `supplier:<name>`. */
  id: string;
  name: string;
  phone: string;
  email: string;
  /** The client they belong to — an organisation, or themselves when they are the client. */
  clientKey: string | null;
  clientName: string;
  jobs: JobIn[];
  openDeals: DealIn[];
  /** For a supplier: how many catalogue items come from them. */
  items: number;
}

/**
 * Every person at a client, and every supplier the catalogue names. A contact's jobs are the jobs
 * linked to them directly; a homeowner's are their own client's jobs.
 */
export function buildContacts(
  clients: readonly Client[],
  people: readonly PersonIn[],
  deals: readonly DealIn[],
  jobs: readonly JobIn[],
  suppliers: readonly { name: string; items: number }[],
): Contact[] {
  const out: Contact[] = [];
  for (const p of people) {
    const client = clients.find(c => c.contacts.some(x => x.id === p.id)) ?? null;
    const own = client?.kind === 'person';
    out.push({
      kind: 'client', id: p.id, name: p.name, phone: p.phone, email: p.email,
      clientKey: client?.key ?? null, clientName: own ? 'Their own client' : client?.name ?? '',
      jobs: own && client ? [...client.liveJobs, ...client.pastJobs] : jobs.filter(j => j.personId === p.id),
      openDeals: deals.filter(d => d.status === 'open' && d.personId === p.id),
      items: 0,
    });
  }
  for (const s of suppliers) {
    if (!s.name.trim()) continue;
    out.push({
      kind: 'supplier', id: `supplier:${s.name}`, name: s.name, phone: '', email: '', clientKey: null,
      clientName: 'Supplier', jobs: [], openDeals: [], items: s.items,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function searchContacts(list: readonly Contact[], q: string): Contact[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter(c => {
    const hay = [c.name, c.phone, c.email, c.clientName, ...c.jobs.map(j => j.ref)].filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/** The suppliers named in the catalogue, once each, with how many items come from each. */
export function suppliersFrom(items: readonly { supplier: string }[]): { name: string; items: number }[] {
  const m = new Map<string, { name: string; items: number }>();
  for (const i of items) {
    const n = i.supplier.trim();
    if (!n) continue;
    const k = normName(n);
    const e = m.get(k) ?? { name: n, items: 0 };
    e.items++;
    m.set(k, e);
  }
  return [...m.values()];
}

/* ── CSV ──────────────────────────────────────────────────────────────────────────────────────── */

const dollars = (cents: number): string => (cents / 100).toFixed(2);

export const CLIENTS_HEADER = ['Client', 'Kind', 'Phone', 'Email', 'Sites', 'Contacts', 'Open deals', 'Live jobs', 'Past jobs', 'Invoiced ex GST', 'Owed ex GST'] as const;

export function clientRows(list: readonly Client[]): Cell[][] {
  return list.map(c => [
    c.name, KIND_LABEL[c.kind], c.phone, c.email, c.sites.join('; '),
    c.kind === 'person' ? '' : c.contacts.map(p => [p.name, p.phone, p.email].filter(Boolean).join(' ')).join('; '),
    c.openDeals.length, c.liveJobs.map(j => j.ref).join(' '), c.pastJobs.map(j => j.ref).join(' '),
    dollars(c.invoicedCents), dollars(c.owedCents),
  ]);
}

export const CONTACTS_HEADER = ['Name', 'Kind', 'Client', 'Phone', 'Email', 'Jobs', 'Open deals'] as const;

export function contactRows(list: readonly Contact[]): Cell[][] {
  return list.map(c => [
    c.name, c.kind === 'supplier' ? 'Supplier' : 'Client contact', c.kind === 'supplier' ? '' : c.clientName,
    c.phone, c.email, c.jobs.map(j => j.ref).join(' '), c.openDeals.map(d => d.title).join('; '),
  ]);
}

/** Parse a client key from the address bar; anything else is no client. */
export function parseClientKey(raw: string): { kind: 'org' | 'person' | 'name'; id: string } | null {
  const m = raw.match(/^(org|person|name):(.{1,200})$/);
  return m ? { kind: m[1] as 'org' | 'person' | 'name', id: m[2] } : null;
}
