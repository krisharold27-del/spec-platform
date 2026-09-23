'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { createJob } from '@/lib/jobs-data';
import { startQuote } from '@/app/jobs/actions';
import { parseClientKey, planJobLinks, normName, namedClient } from '@/lib/clients';

/**
 * Every write on the client list.
 *
 * The same gate as Jobs and the CRM — a manager, in a business that can be written to — and every id
 * that arrives from a form is re-read with this business's tenant_id first. The rows are the CRM's
 * own (`crm_organisations`, `crm_people`) and Jobs' own (`jobs`): the client list is a way of seeing
 * them whole, never a second copy.
 */

async function writer() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
const now = () => new Date().toISOString();

function back(extra: Record<string, string> = {}, cannot?: string): never {
  const q = new URLSearchParams(extra);
  if (cannot) q.set('cannot', cannot);
  const s = q.toString();
  redirect(`/clients${s ? `?${s}` : ''}`);
}

async function org(tenantId: string, id: string) {
  const [row] = await db.select().from(schema.crmOrganisations)
    .where(and(eq(schema.crmOrganisations.id, id), eq(schema.crmOrganisations.tenantId, tenantId)));
  return row ?? null;
}
async function person(tenantId: string, id: string) {
  const [row] = await db.select().from(schema.crmPeople)
    .where(and(eq(schema.crmPeople.id, id), eq(schema.crmPeople.tenantId, tenantId)));
  return row ?? null;
}

/**
 * Who a client key names, re-read from this business: the words a job carries for them, and the
 * links it should have. A contact at an organisation brings the job to the organisation, with the
 * contact beside it.
 */
async function resolve(tenantId: string, key: string): Promise<{ name: string; organisationId: string | null; personId: string | null; address: string } | null> {
  const k = parseClientKey(key);
  if (!k) return null;
  if (k.kind === 'org') {
    const o = await org(tenantId, k.id);
    return o ? { name: o.name, organisationId: o.id, personId: null, address: o.address } : null;
  }
  if (k.kind === 'person') {
    const p = await person(tenantId, k.id);
    if (!p) return null;
    const o = p.organisationId ? await org(tenantId, p.organisationId) : null;
    return o
      ? { name: o.name, organisationId: o.id, personId: p.id, address: o.address }
      : { name: p.name, organisationId: null, personId: p.id, address: '' };
  }
  // A name that is only on jobs: the words the business typed, read back from one of those jobs.
  const jobs = await db.select({ client: schema.jobs.client }).from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId));
  const hit = jobs.find(j => normName(j.client) === k.id);
  return hit && namedClient(hit.client) ? { name: hit.client.trim(), organisationId: null, personId: null, address: '' } : null;
}

/**
 * One press from a client or a contact: a job, or a job with its quote open. Nothing the business
 * has already told SPEC is asked again — the client, the contact and the site come from the list;
 * what the work is may be typed, and when it is not the job says whose it is until somebody does.
 */
export async function startWork(formData: FormData) {
  const user = await writer();
  const key = str(formData, 'client', 240);
  const from = str(formData, 'from', 20) === 'contacts' ? 'contacts' : 'clients';
  const who = await resolve(user.tenantId, key);
  if (!who) back({ tab: from }, 'That client is not on this business’s list.');

  const title = str(formData, 'title', 160) || `Work for ${who.name}`;
  const site = str(formData, 'site', 160) || who.address;
  const { id } = await createJob({
    tenantId: user.tenantId, stage: 'enquiry', title, client: who.name.slice(0, 120), site,
    organisationId: who.organisationId, personId: who.personId, createdBy: user.name,
  });
  revalidatePath('/clients');
  revalidatePath('/jobs');
  if (str(formData, 'intent', 10) === 'quote') {
    const fd = new FormData();
    fd.set('jobId', id);
    await startQuote(fd); // opens the quote builder on the new job
  }
  redirect(`/jobs?${new URLSearchParams({ tab: 'pipeline', job: id })}`);
}

/** A client the business has not got on its list yet. Typing a name it has opens that one. */
export async function addClient(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 160);
  if (!name) back({}, 'A client needs a name.');
  const all = await db.select({ id: schema.crmOrganisations.id, name: schema.crmOrganisations.name })
    .from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, user.tenantId));
  const same = all.find(o => normName(o.name) === normName(name));
  if (same) back({ client: `org:${same.id}` });
  const id = randomUUID();
  await db.insert(schema.crmOrganisations).values({
    id, tenantId: user.tenantId, name, address: str(formData, 'address', 200), phone: str(formData, 'phone', 40),
    createdBy: user.name, createdAt: now(),
  });
  revalidatePath('/clients');
  revalidatePath('/crm');
  back({ client: `org:${id}` });
}

/** A client's address and phone. The name is what jobs and deals are filed under, so it is kept. */
export async function updateClient(formData: FormData) {
  const user = await writer();
  const key = parseClientKey(str(formData, 'client', 240));
  if (key?.kind === 'org') {
    const o = await org(user.tenantId, key.id);
    if (o) {
      await db.update(schema.crmOrganisations)
        .set({ address: str(formData, 'address', 200), phone: str(formData, 'phone', 40) })
        .where(and(eq(schema.crmOrganisations.id, o.id), eq(schema.crmOrganisations.tenantId, user.tenantId)));
    }
  } else if (key?.kind === 'person') {
    const p = await person(user.tenantId, key.id);
    if (p) {
      await db.update(schema.crmPeople)
        .set({ phone: str(formData, 'phone', 40), email: str(formData, 'email', 160) })
        .where(and(eq(schema.crmPeople.id, p.id), eq(schema.crmPeople.tenantId, user.tenantId)));
    }
  }
  revalidatePath('/clients');
  back(key ? { client: `${key.kind}:${key.id}` } : {});
}

/** A person at a client — or, with no client, a homeowner who is their own client. */
export async function addContact(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 120);
  const clientKey = str(formData, 'client', 240);
  const stay: Record<string, string> = clientKey ? { client: clientKey } : { tab: 'contacts' };
  if (!name) back(stay, 'A contact needs a name.');
  const k = parseClientKey(clientKey);
  const o = k?.kind === 'org' ? await org(user.tenantId, k.id) : null;
  await db.insert(schema.crmPeople).values({
    id: randomUUID(), tenantId: user.tenantId, organisationId: o?.id ?? null, name,
    email: str(formData, 'email', 160), phone: str(formData, 'phone', 40), createdBy: user.name, createdAt: now(),
  });
  revalidatePath('/clients');
  revalidatePath('/crm');
  back(stay);
}

export async function updateContact(formData: FormData) {
  const user = await writer();
  const p = await person(user.tenantId, str(formData, 'personId'));
  const clientKey = str(formData, 'client', 240);
  if (p) {
    const name = str(formData, 'name', 120) || p.name;
    await db.update(schema.crmPeople)
      .set({ name, phone: str(formData, 'phone', 40), email: str(formData, 'email', 160) })
      .where(and(eq(schema.crmPeople.id, p.id), eq(schema.crmPeople.tenantId, user.tenantId)));
  }
  revalidatePath('/clients');
  back(clientKey ? { client: clientKey } : { tab: 'contacts' });
}

/**
 * Put every job's client on the list — one press, additive.
 *
 * A job carrying only a name is linked to the client of that exact name when there is exactly one;
 * a name nobody has yet becomes a client, once, and every job with that name links to it. Only a
 * null link is ever filled: a job already linked is never moved, and the words on a job are never
 * rewritten. A job with no client given stays as it is.
 */
export async function linkJobClients() {
  const user = await writer();
  const t = user.tenantId;
  const [orgs, people] = await Promise.all([
    db.select({ id: schema.crmOrganisations.id, name: schema.crmOrganisations.name })
      .from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, t)),
    db.select({ id: schema.crmPeople.id, name: schema.crmPeople.name, organisationId: schema.crmPeople.organisationId })
      .from(schema.crmPeople).where(eq(schema.crmPeople.tenantId, t)),
  ]);
  const unlinked = await db.select({ id: schema.jobs.id, client: schema.jobs.client, organisationId: schema.jobs.organisationId, personId: schema.jobs.personId })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, t), isNull(schema.jobs.organisationId), isNull(schema.jobs.personId)));

  // Names nobody has yet become clients first, so the same plan then links every one of them.
  const planned = new Set(planJobLinks(unlinked, orgs, people).map(l => l.jobId));
  const fresh = new Map<string, string>();
  for (const j of unlinked) {
    if (planned.has(j.id) || !namedClient(j.client)) continue;
    const n = normName(j.client);
    if (fresh.has(n) || orgs.filter(o => normName(o.name) === n).length > 1) continue;
    const id = randomUUID();
    fresh.set(n, id);
    await db.insert(schema.crmOrganisations).values({ id, tenantId: t, name: j.client.trim().slice(0, 160), createdBy: user.name, createdAt: now() });
    orgs.push({ id, name: j.client.trim() });
  }

  let linked = 0;
  for (const l of planJobLinks(unlinked, orgs, people)) {
    await db.update(schema.jobs).set({ organisationId: l.organisationId, personId: l.personId })
      .where(and(eq(schema.jobs.id, l.jobId), eq(schema.jobs.tenantId, t), isNull(schema.jobs.organisationId), isNull(schema.jobs.personId)));
    linked++;
  }
  revalidatePath('/clients');
  revalidatePath('/crm');
  back({ linked: String(linked), added: String(fresh.size) });
}
