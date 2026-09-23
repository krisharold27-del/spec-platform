import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { OwnSystemLine } from '@/components/own-system-line';
import { ownSystemFor } from '@/lib/coverage-data';
import { getCurrentUser, canManage } from '@/lib/auth';
import { refusedReason } from '@/lib/refuse';
import { loadClients, type ClientsView } from '@/lib/clients-data';
import {
  searchClients, searchContacts, planJobLinks, namedClient, KIND_LABEL,
  type Client, type Contact, type JobIn,
} from '@/lib/clients';
import { telHref, mailHref } from '@/lib/directory';
import { STAGES, money } from '@/lib/jobs';
import { startWork, addClient, updateClient, addContact, updateContact, linkJobClients } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Clients — every customer the business has, and everyone at them, in one place.
 *
 * Kris, 23 September: *"we must have full client lists, we must have contacts and the ability to do
 * the job"*. Its own address rather than a fifth tab on the CRM, because the CRM is the selling that
 * happens before there is a job — and plenty of clients never pass through it: the service call typed
 * straight into Jobs, the builder who rings with the next one. The list is the CRM's organisations
 * and people and every job's client, seen whole (lib/clients); nothing is copied. From any client or
 * contact, one press starts a job or a quote for them, already knowing who it is for.
 */

const TABS = [
  { key: 'clients', label: 'Clients' },
  { key: 'contacts', label: 'Contacts' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const stageLabel = (s: string) => STAGES.find(x => x.key === s)?.label ?? s;

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;
  const tab: Tab = TABS.find(t => t.key === one(sp.tab))?.key ?? 'clients';
  const q = one(sp.q).slice(0, 80);
  const openKey = one(sp.client).slice(0, 240);
  const cannot = refusedReason(sp);
  const manage = canManage(user.access);
  const own = await ownSystemFor(user.tenantId, 'clients', tab);
  const view = await loadClients(user);
  // A contact at an organisation opens the organisation — that is the client.
  const open = openKey
    ? view.clients.find(c => c.key === openKey)
      ?? view.clients.find(c => c.kind === 'organisation' && c.contacts.some(p => `person:${p.id}` === openKey))
      ?? null
    : null;

  const linked = one(sp.linked);
  const added = one(sp.added);

  return (
    <Shell
      title="Clients"
      kicker="Clients"
      headline="Every client, and everyone at them."
      subtitle="Sites, contacts, deals, jobs and what is owed — and one press to start the next job."
    >
      <Refused reason={cannot} />
      {linked && (
        <p className="mb-5 rounded-xl bg-surface px-4 py-3 text-sm text-ink-light">
          {linked === '0' ? 'Every job was already on the list.' : `${linked} ${linked === '1' ? 'job' : 'jobs'} linked to their client${added && added !== '0' ? `, ${added} of them new to the list` : ''}.`}
        </p>
      )}

      <nav aria-label="Clients" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`/clients${t.key === 'clients' ? '' : `?tab=${t.key}`}`}
            aria-current={t.key === tab && !open ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${t.key === tab && !open ? 'bg-rust text-cream' : 'bg-surface text-ink shadow-sm hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <OwnSystemLine line={own.line} connected={own.connected} />

      {open ? <ClientDetail c={open} view={view} manage={manage} />
        : openKey ? <p className="card text-sm text-ink-light">That client is not on this business&rsquo;s list. <Link href="/clients" className="text-rust-700 hover:underline">Back to every client</Link></p>
        : tab === 'contacts' ? <ContactsTab view={view} q={q} manage={manage} />
        : <ClientsTab view={view} q={q} manage={manage} />}
    </Shell>
  );
}

/* ══ The list ═════════════════════════════════════════════════════════════════════════════════════ */

function Search({ tab, q, placeholder, csv }: { tab: Tab; q: string; placeholder: string; csv: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form action="/clients" method="get" className="flex min-w-0 max-w-md flex-1 gap-2">
        {tab !== 'clients' && <input type="hidden" name="tab" value={tab} />}
        <input className="input min-w-0 flex-1" type="search" name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} />
        <button className="btn-secondary" type="submit">Search</button>
      </form>
      <a href={`${csv}${q ? `?${new URLSearchParams({ q })}` : ''}`} className="btn-ghost" download>Download CSV</a>
    </div>
  );
}

function ClientsTab({ view, q, manage }: { view: ClientsView; q: string; manage: boolean }) {
  const list = searchClients(view.clients, q);
  const onlyNames = view.jobs.filter(j => !j.organisationId && !j.personId && namedClient(j.client));
  const linkable = planJobLinks(onlyNames, view.organisations, view.people).length;
  const owed = view.clients.reduce((t, c) => t + c.owedCents, 0);

  return (
    <div>
      <section aria-label="At a glance" className="mb-6 grid gap-3 sm:grid-cols-3">
        <Tile label="Clients" value={String(view.clients.length)} note={`${view.clients.filter(c => c.liveJobs.length).length} with work on now`} />
        <Tile label="Contacts" value={String(view.people.length)} note="People at clients, and homeowners" />
        <Tile label="Owed" value={money(owed)} note="Invoiced and not yet paid, ex GST" />
      </section>

      {manage && onlyNames.length > 0 && (
        <section className="card mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[60ch] text-sm text-ink-light">
            {onlyNames.length} {onlyNames.length === 1 ? 'job carries' : 'jobs carry'} only a client&rsquo;s name
            {linkable ? ` — ${linkable} of them match a client already on the list` : ''}. One press puts every one of
            them on the list; nothing on the jobs is rewritten.
          </p>
          <form action={linkJobClients}>
            <SubmitButton className="btn-secondary" pending="Linking…">Put them on the list</SubmitButton>
          </form>
        </section>
      )}

      <Search tab="clients" q={q} placeholder="Search clients, sites, contacts, J-numbers" csv="/clients/clients.csv" />

      {manage && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-serif text-lg text-ink">Add a client</summary>
          <form action={addClient} className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1.5fr_1fr_auto]">
            <input className="input" name="name" required maxLength={160} placeholder="Name" aria-label="Client name" />
            <input className="input" name="address" maxLength={200} placeholder="Address" aria-label="Address" />
            <input className="input" type="tel" name="phone" maxLength={40} placeholder="Phone" aria-label="Phone" />
            <SubmitButton className="btn-secondary" pending="Adding…">Add</SubmitButton>
          </form>
        </details>
      )}

      {!list.length ? (
        <p className="card text-sm text-ink-light">
          {q ? 'Nothing matches that.' : 'No clients yet. Every job and every deal adds its client here — or add one above.'}
        </p>
      ) : (
        <ul className="card grid gap-3">
          {list.map(c => {
            const tel = telHref(c.phone);
            return (
              <li key={c.key} className="grid gap-1 border-b border-ink/10 pb-3 last:border-0 last:pb-0 md:grid-cols-[1.4fr_1.4fr_1fr_auto] md:items-center">
                <span className="min-w-0">
                  <Link href={`/clients?${new URLSearchParams({ client: c.key })}`} className="font-semibold text-ink hover:text-rust">{c.name}</Link>
                  <span className="block text-xs text-ink-light">
                    {KIND_LABEL[c.kind]}
                    {c.kind === 'organisation' && c.contacts.length ? ` · ${c.contacts.length} ${c.contacts.length === 1 ? 'contact' : 'contacts'}` : ''}
                  </span>
                </span>
                <span className="text-sm text-ink-light">
                  {tel ? <a href={tel} className="text-rust-700 hover:underline">{c.phone}</a> : null}
                  {tel && c.sites[0] ? ' · ' : ''}
                  {c.sites[0] ?? (tel ? '' : '—')}
                  {c.sites.length > 1 ? ` +${c.sites.length - 1} more` : ''}
                </span>
                <span className="text-xs text-ink-light">
                  {c.liveJobs.length} live · {c.pastJobs.length} past{c.openDeals.length ? ` · ${c.openDeals.length} open ${c.openDeals.length === 1 ? 'deal' : 'deals'}` : ''}
                </span>
                <span className="text-sm">{c.owedCents ? <>Owes <strong>{money(c.owedCents)}</strong></> : <span className="text-ink-light">Nothing owed</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-light">
        The client list is the CRM&rsquo;s organisations and people and every job&rsquo;s client, seen whole. Open deals
        are the ones in your part of the chart.
      </p>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="label-caps">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-light">{note}</p>
    </div>
  );
}

/* ══ One client ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Start a job or a quote for them — the one press. The client, contact and site come from the list;
 * what the work is may be typed and need not be.
 */
function StartWork({ clientKey, sites, from, compact = false }: { clientKey: string; sites: string[]; from: 'clients' | 'contacts'; compact?: boolean }) {
  return (
    <form action={startWork} className={compact ? 'flex flex-wrap gap-2' : 'grid gap-2 sm:grid-cols-[1.4fr_1.2fr_auto_auto]'}>
      <input type="hidden" name="client" value={clientKey} />
      <input type="hidden" name="from" value={from} />
      {!compact && <input className="input" name="title" maxLength={160} placeholder="What the work is (optional)" aria-label="What the work is" />}
      {!compact && (sites.length > 1 ? (
        <select className="input" name="site" defaultValue={sites[0]} aria-label="Site">
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input className="input" name="site" maxLength={160} defaultValue={sites[0] ?? ''} placeholder="Site, if known" aria-label="Site" />
      ))}
      <SubmitButton className={compact ? 'btn-secondary px-3 py-1.5 text-xs' : 'btn-primary'} name="intent" value="job" pending="Starting…">Start a job</SubmitButton>
      <SubmitButton className={compact ? 'btn-ghost px-3 py-1.5 text-xs' : 'btn-secondary'} name="intent" value="quote" pending="Opening…">Start a quote</SubmitButton>
    </form>
  );
}

function JobList({ jobs, empty }: { jobs: JobIn[]; empty: string }) {
  if (!jobs.length) return <p className="text-sm text-ink-light">{empty}</p>;
  return (
    <ul className="grid gap-1.5 text-sm">
      {jobs.map(j => (
        <li key={j.id} className="flex flex-wrap justify-between gap-2">
          <Link href={`/jobs?${new URLSearchParams({ tab: 'pipeline', job: j.id })}`} className="min-w-0 text-ink hover:text-rust">
            {j.ref} · {j.title}{j.site ? <span className="text-ink-light"> · {j.site}</span> : null}
          </Link>
          <span className="text-xs text-ink-light">{stageLabel(j.stage)}{j.valueCents ? ` · ${money(j.valueCents)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}

function ClientDetail({ c, view, manage }: { c: Client; view: ClientsView; manage: boolean }) {
  const tel = telHref(c.phone);
  const mail = mailHref(c.email);
  const contacts = c.kind === 'organisation' ? c.contacts : [];
  return (
    <section aria-label="Client" className="card shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs text-ink-light">{KIND_LABEL[c.kind]}</span>
          <h2 className="mt-1 font-serif text-2xl text-ink">{c.name}</h2>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
            {tel && <a href={tel} className="inline-flex min-h-[32px] items-center text-rust-700 hover:underline">Call {c.phone}</a>}
            {mail && <a href={mail} className="inline-flex min-h-[32px] items-center text-rust-700 hover:underline">Email {c.email}</a>}
            {!tel && !mail && <span className="text-ink-light">No phone or email recorded</span>}
          </p>
        </div>
        <Link href="/clients" className="btn-ghost">Every client</Link>
      </div>

      {manage && (
        <div className="card-inset mt-5">
          <p className="label-caps mb-2">Do the work</p>
          <StartWork clientKey={c.key} sites={c.sites} from="clients" />
          {c.kind === 'jobs' && (
            <p className="mt-2 text-xs text-ink-light">They are only on jobs so far — starting one puts them on the client list.</p>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="card-inset">
          <p className="label-caps mb-2">Sites</p>
          {c.sites.length ? (
            <ul className="grid gap-1 text-sm">{c.sites.map(s => <li key={s}>{s}</li>)}</ul>
          ) : <p className="text-sm text-ink-light">No site recorded yet.</p>}
          {manage && c.kind !== 'jobs' && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-rust-700 hover:underline">Change details</summary>
              <form action={updateClient} className="mt-2 grid gap-2">
                <input type="hidden" name="client" value={c.key} />
                {c.kind === 'organisation'
                  ? <input className="input" name="address" defaultValue={c.address} maxLength={200} placeholder="Address" aria-label="Address" />
                  : <input className="input" type="email" name="email" defaultValue={c.email} maxLength={160} placeholder="Email" aria-label="Email" />}
                <input className="input" type="tel" name="phone" defaultValue={c.phone} maxLength={40} placeholder="Phone" aria-label="Phone" />
                <SubmitButton className="btn-secondary justify-self-start" pending="Saving…">Save</SubmitButton>
              </form>
            </details>
          )}
        </div>

        <div className="card-inset">
          <p className="label-caps mb-2">Money</p>
          <div className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3"><span>Invoiced</span><strong>{c.invoicedCents ? money(c.invoicedCents) : '—'}</strong></div>
            <div className="flex justify-between gap-3"><span>Owed now</span><strong>{c.owedCents ? money(c.owedCents) : 'Nothing'}</strong></div>
            <div className="flex justify-between gap-3"><span>Open deals</span><strong>{c.openDeals.length ? money(c.openDeals.reduce((t, d) => t + d.valueCents, 0)) : '—'}</strong></div>
          </div>
          <p className="mt-2 text-xs text-ink-light">Ex GST, from jobs marked invoiced and paid. Invoices themselves are raised in your accounting system.</p>
        </div>

        {c.kind === 'organisation' && (
          <div className="card-inset">
            <p className="label-caps mb-2">Contacts</p>
            {contacts.length ? (
              <ul className="grid gap-2">
                {contacts.map(p => <ContactLine key={p.id} p={p} clientKey={c.key} manage={manage} />)}
              </ul>
            ) : <p className="text-sm text-ink-light">Nobody recorded at {c.name} yet.</p>}
            {manage && (
              <form action={addContact} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input type="hidden" name="client" value={c.key} />
                <input className="input" name="name" required maxLength={120} placeholder="Name" aria-label="Contact name" />
                <input className="input" type="tel" name="phone" maxLength={40} placeholder="Phone" aria-label="Contact phone" />
                <input className="input" type="email" name="email" maxLength={160} placeholder="Email" aria-label="Contact email" />
                <SubmitButton className="btn-secondary" pending="Adding…">Add</SubmitButton>
              </form>
            )}
          </div>
        )}

        <div className="card-inset">
          <p className="label-caps mb-2">Open deals</p>
          {c.openDeals.length ? (
            <ul className="grid gap-1.5 text-sm">
              {c.openDeals.map(d => (
                <li key={d.id} className="flex justify-between gap-2">
                  <Link href={`/crm?deal=${d.id}`} className="text-ink hover:text-rust">{d.title}</Link>
                  <span className="text-xs text-ink-light">{money(d.valueCents)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-light">No open deals in your part of the chart.</p>}
        </div>

        <div className="card-inset md:col-span-2">
          <p className="label-caps mb-2">Jobs on now</p>
          <JobList jobs={c.liveJobs} empty="Nothing on now." />
          <p className="label-caps mb-2 mt-4">Past jobs</p>
          <JobList jobs={c.pastJobs} empty="None paid and closed yet." />
        </div>
      </div>
      {view.deals.length === 0 && c.kind !== 'jobs' && (
        <p className="mt-4 text-xs text-ink-light">Selling to them before there is a job? <Link href="/crm" className="text-rust-700 hover:underline">Add a deal in the CRM</Link>.</p>
      )}
    </section>
  );
}

function ContactLine({ p, clientKey, manage }: { p: { id: string; name: string; phone: string; email: string }; clientKey: string; manage: boolean }) {
  const tel = telHref(p.phone);
  const mail = mailHref(p.email);
  return (
    <li className="text-sm">
      <span className="font-semibold text-ink">{p.name}</span>
      <span className="flex flex-wrap gap-x-3">
        {tel ? <a href={tel} className="inline-flex min-h-[32px] items-center text-rust-700 hover:underline">{p.phone}</a> : null}
        {mail ? <a href={mail} className="inline-flex min-h-[32px] items-center break-all text-rust-700 hover:underline">{p.email}</a> : null}
        {!tel && !mail && <span className="text-xs text-ink-light">No phone or email recorded</span>}
      </span>
      {manage && (
        <details>
          <summary className="cursor-pointer text-xs text-rust-700 hover:underline">Change</summary>
          <form action={updateContact} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="hidden" name="personId" value={p.id} />
            <input type="hidden" name="client" value={clientKey} />
            <input className="input" name="name" defaultValue={p.name} maxLength={120} aria-label="Name" />
            <input className="input" type="tel" name="phone" defaultValue={p.phone} maxLength={40} placeholder="Phone" aria-label="Phone" />
            <input className="input" type="email" name="email" defaultValue={p.email} maxLength={160} placeholder="Email" aria-label="Email" />
            <SubmitButton className="btn-secondary" pending="Saving…">Save</SubmitButton>
          </form>
        </details>
      )}
    </li>
  );
}

/* ══ Contacts ═════════════════════════════════════════════════════════════════════════════════════ */

function ContactsTab({ view, q, manage }: { view: ClientsView; q: string; manage: boolean }) {
  const list = searchContacts(view.contacts, q);
  const orgs = view.clients.filter(c => c.kind === 'organisation');
  return (
    <div>
      <Search tab="contacts" q={q} placeholder="Search names, clients, numbers" csv="/clients/contacts.csv" />
      {manage && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-serif text-lg text-ink">Add a contact</summary>
          <form action={addContact} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <input className="input" name="name" required maxLength={120} placeholder="Name" aria-label="Contact name" />
            <input className="input" type="tel" name="phone" maxLength={40} placeholder="Phone" aria-label="Phone" />
            <input className="input" type="email" name="email" maxLength={160} placeholder="Email" aria-label="Email" />
            <select className="input" name="client" defaultValue="" aria-label="Which client">
              <option value="">Their own client (a homeowner)</option>
              {orgs.map(o => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
            <SubmitButton className="btn-secondary" pending="Adding…">Add</SubmitButton>
          </form>
        </details>
      )}
      {!list.length ? (
        <p className="card text-sm text-ink-light">{q ? 'Nobody matches that.' : 'No contacts yet. Add one here, on a client, or with a deal.'}</p>
      ) : (
        <ul className="card grid gap-3">
          {list.map(c => <ContactRow key={c.id} c={c} manage={manage} />)}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-light">
        Tap a number to call it and an address to write from your own mail — SPEC sends nothing. Suppliers are the
        ones your catalogue names; the catalogue keeps their name only.
      </p>
    </div>
  );
}

function ContactRow({ c, manage }: { c: Contact; manage: boolean }) {
  const tel = telHref(c.phone);
  const mail = mailHref(c.email);
  return (
    <li className="grid gap-1.5 border-b border-ink/10 pb-3 last:border-0 last:pb-0 md:grid-cols-[1.2fr_1.3fr_1.3fr] md:items-start">
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{c.name}</span>
        <span className="block text-xs text-ink-light">
          {c.kind === 'supplier' ? `Supplier · ${c.items} ${c.items === 1 ? 'item' : 'items'} in the catalogue`
            : c.clientKey ? <Link href={`/clients?${new URLSearchParams({ client: c.clientKey })}`} className="hover:text-rust">{c.clientName}</Link>
            : c.clientName}
        </span>
      </span>
      <span className="flex flex-wrap gap-x-3 text-sm">
        {tel ? <a href={tel} className="inline-flex min-h-[36px] items-center text-rust-700 hover:underline">Call {c.phone}</a> : null}
        {mail ? <a href={mail} className="inline-flex min-h-[36px] items-center break-all text-rust-700 hover:underline">Email {c.email}</a> : null}
        {!tel && !mail && <span className="text-xs text-ink-light">No phone or email recorded</span>}
      </span>
      <span className="grid gap-1.5">
        {(c.jobs.length > 0 || c.openDeals.length > 0) && (
          <span className="flex flex-wrap gap-1.5">
            {c.jobs.slice(0, 6).map(j => (
              <Link key={j.id} href={`/jobs?${new URLSearchParams({ tab: 'pipeline', job: j.id })}`} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink hover:underline">{j.ref}</Link>
            ))}
            {c.openDeals.map(d => (
              <Link key={d.id} href={`/crm?deal=${d.id}`} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink hover:underline">{d.title}</Link>
            ))}
          </span>
        )}
        {manage && c.kind === 'client' && <StartWork clientKey={`person:${c.id}`} sites={[]} from="contacts" compact />}
      </span>
    </li>
  );
}
