import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnSystemLine } from '@/components/own-system-line';
import { ownSystemFor } from '@/lib/coverage-data';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { QuoteBuilder } from '@/components/quote-builder';
import { getCurrentUser, canManage } from '@/lib/auth';
import { refusedReason } from '@/lib/refuse';
import { pillTone, LIGHT_COLOUR } from '@/lib/today';
import { crewFor, type CrewMember } from '@/lib/jobs-data';
import {
  STAGES, jobMargin, marginLight, pipelineStats, priceQuote, labourCostCents, billable,
  workWeek, dayLabel, weekLabel, shiftWeek, priceFileState, stale, parseComponents, expandKit,
  money, money2, pctLabel, MARGIN_BENCHMARK, BILLABLE_TARGET, DEFAULT_MARKUP, WORKED_EXAMPLE,
  type Light, type QuoteLine, type Kit, type CatalogueItem, type LabourRate,
} from '@/lib/jobs';
import {
  addEnquiry, advanceJob, recordMaterials, startQuote, saveQuote, addItem, loadPriceFile, retireItem,
  addRate, addKit, bookCrew, unbookCrew, recordTime, approveWeek,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Jobs — every job, enquiry to paid (design: SPEC Jobs, 23 September).
 *
 * Eight tabs, one address. Five of them run on the business's own records: the pipeline, quotes,
 * the schedule, timesheets and the catalogue. Three — stock and buying, invoices and claims, service
 * and assets — are drawn in the shape the design gives them and say plainly that they are not set up
 * yet, with the first step. None of them shows a number SPEC did not work out from something the
 * business recorded, and nothing that has not been measured is ever painted red.
 *
 * Categories, never vendors: "your accounting system", "your job system". The business's own
 * suppliers are whatever it types — SPEC names none.
 */

const TABS = [
  { key: 'pipeline', label: 'Jobs' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'time', label: 'Timesheets' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'stock', label: 'Stock & buying' },
  { key: 'billing', label: 'Invoices & claims' },
  { key: 'service', label: 'Service & assets' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const DAY_MS = 86_400_000;
const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));

function Pill({ light, children }: { light: Light; children: React.ReactNode }) {
  return <span className="pill whitespace-nowrap" style={pillTone(light)}>{children}</span>;
}

type JobRow = typeof schema.jobs.$inferSelect;

export default async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;
  const tab: Tab = (TABS.find(t => t.key === one(sp.tab))?.key ?? 'pipeline');
  const cannot = refusedReason(sp);
  const manage = canManage(user.access);
  const own = await ownSystemFor(user.tenantId, 'jobs', tab);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  /* Everything this business has recorded for Jobs, read once and scoped by tenant in the query. */
  const [jobs, quotes, itemRows, kitRows, rateRows, jobTime] = await Promise.all([
    db.select().from(schema.jobs).where(eq(schema.jobs.tenantId, user.tenantId)).orderBy(schema.jobs.createdAt),
    db.select().from(schema.quotes).where(eq(schema.quotes.tenantId, user.tenantId)).orderBy(schema.quotes.createdAt),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)).orderBy(schema.catalogueItems.name),
    db.select().from(schema.kits).where(eq(schema.kits.tenantId, user.tenantId)).orderBy(schema.kits.name),
    db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, user.tenantId))
      .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
    db.select({ jobId: schema.timesheetEntries.jobId, minutes: schema.timesheetEntries.minutes })
      .from(schema.timesheetEntries)
      .where(and(eq(schema.timesheetEntries.tenantId, user.tenantId), isNotNull(schema.timesheetEntries.jobId))),
  ]);
  const crew = await crewFor(user);

  const items: CatalogueItem[] = itemRows.map(i => ({ id: i.id, name: i.name, unit: i.unit, supplier: i.supplier, costCents: i.costCents }));
  const kits: Kit[] = kitRows.map(k => ({
    id: k.id, name: k.name, components: parseComponents(k.components),
    labourHours: k.labourHours, labourRateId: k.labourRateId, extraCostCents: k.extraCostCents,
  }));
  const rates: LabourRate[] = rateRows.map(r => ({ id: r.id, name: r.name, costCents: r.costCents, chargeCents: r.chargeCents }));
  const standard = rates[0] ?? null;

  /* Each job's costs so far: hours from timesheets at the standard rate, materials as recorded. */
  const costed = jobs.map(j => {
    const minutes = jobTime.filter(t => t.jobId === j.id).reduce((a, t) => a + t.minutes, 0);
    const labour = standard ? labourCostCents(minutes, standard.costCents) : 0;
    return { ...j, minutes, labourCents: labour, margin: jobMargin(j.valueCents, labour, j.materialsCents) };
  });

  const tabHref = (key: string, extra: Record<string, string> = {}) =>
    `/jobs?${new URLSearchParams({ tab: key, ...extra }).toString()}`;

  return (
    <Shell
      title="Jobs"
      kicker="Jobs"
      headline="Every job, enquiry to paid."
      subtitle="Quote it, book the crew, record the time, get paid — in one place, measured against the benchmarks."
    >
      <Refused reason={cannot} />

      {manage && (
        <form action={addEnquiry} className="mb-6 flex max-w-xl items-center gap-2 rounded-full bg-surface py-1.5 pl-5 pr-1.5 shadow-sm">
          <input
            name="enquiry" required maxLength={400}
            placeholder="New enquiry: e.g. Sam Lee, switchboard upgrade, Balmain"
            aria-label="New enquiry"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none"
          />
          <SubmitButton className="h-10 w-10 shrink-0 rounded-full bg-rust text-lg text-cream" pending="…">→</SubmitButton>
        </form>
      )}

      <nav aria-label="Jobs" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={t.key === tab ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${t.key === tab ? 'bg-rust text-cream' : 'bg-surface text-ink shadow-sm hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <OwnSystemLine line={own.line} connected={own.connected} />

      {tab === 'pipeline' && (
        <Pipeline jobs={costed} openId={one(sp.job)} crew={crew} quotes={quotes} manage={manage} now={now} tabHref={tabHref} hasRate={!!standard} />
      )}
      {tab === 'quotes' && (
        <Quotes jobs={jobs} quotes={quotes} openId={one(sp.quote)} items={items} kits={kits} rates={rates} manage={manage} tenantId={user.tenantId} tabHref={tabHref} />
      )}
      {tab === 'schedule' && (
        <Schedule jobs={jobs} crew={crew} week={one(sp.week)} book={one(sp.book)} manage={manage} today={today} tenantId={user.tenantId} tabHref={tabHref} />
      )}
      {tab === 'time' && (
        <Timesheets jobs={jobs} crew={crew} week={one(sp.week)} manage={manage} today={today} tenantId={user.tenantId} tabHref={tabHref} />
      )}
      {tab === 'catalogue' && (
        <Catalogue items={itemRows} kits={kits} kitRows={kitRows} rates={rates} q={one(sp.q)} skipped={one(sp.skipped)} manage={manage} today={today} />
      )}
      {tab === 'stock' && <Register groups={stockGroups()} />}
      {tab === 'billing' && <Register groups={billingGroups(costed, now)} />}
      {tab === 'service' && <Register groups={serviceGroups()} />}

      {/*
        The way out to a job system somebody already runs, the same offer the People screen makes for
        HR. SPEC can be the whole system or read from the one the business has; manual is complete.
      */}
      <section className="mt-12 rounded-2xl bg-surface p-6">
        <h2 className="font-serif text-xl text-ink">Already run jobs in another system?</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Keep your job system connected and SPEC reads from it instead, area by area. If you do not have
          one, this is it — no second system to buy. Accounting stays in your accounting system.
        </p>
        <Link href="/connections" className="btn-secondary mt-4 inline-block">Open the connection centre</Link>
      </section>
    </Shell>
  );
}

/* ══ Jobs pipeline ════════════════════════════════════════════════════════════════════════════════ */

type Costed = JobRow & { minutes: number; labourCents: number; margin: number | null };

/** The small flag on a card — each one derived from the job's own dates and numbers. */
function flagFor(j: Costed, booked: boolean, now: Date): { text: string; light: Light } | null {
  const days = daysSince(j.stageAt, now);
  if (j.stage === 'enquiry') return days >= 1 ? { text: 'Reply today', light: 'amber' } : { text: 'New', light: 'pending' };
  if (j.stage === 'quoted' && days >= 3) return { text: 'Follow up', light: 'amber' };
  if (j.stage === 'won' && !booked) return { text: 'Needs a crew', light: 'amber' };
  if ((j.stage === 'onsite' || j.stage === 'scheduled') && marginLight(j.margin) === 'red') return { text: 'Margin slipping', light: 'red' };
  if (j.stage === 'invoiced') return { text: `${days} days`, light: days > 30 ? 'red' : days > 14 ? 'amber' : 'pending' };
  return null;
}

async function Pipeline({ jobs, openId, crew, quotes, manage, now, tabHref, hasRate }: {
  jobs: Costed[]; openId: string; crew: CrewMember[]; quotes: (typeof schema.quotes.$inferSelect)[];
  manage: boolean; now: Date; tabHref: (k: string, e?: Record<string, string>) => string; hasRate: boolean;
}) {
  const jobIds = jobs.map(j => j.id);
  const bookings = jobIds.length
    ? await db.select().from(schema.scheduleBookings)
        .where(and(eq(schema.scheduleBookings.tenantId, jobs[0].tenantId), inArray(schema.scheduleBookings.jobId, jobIds)))
    : [];
  const stats = pipelineStats(jobs);
  const oldestOwed = jobs.filter(j => j.stage === 'invoiced').reduce((a, j) => Math.max(a, daysSince(j.stageAt, now)), 0);
  const open = jobs.find(j => j.id === openId) ?? null;
  // A job that was won in the CRM links back to the deal it came from.
  const [fromDeal] = open
    ? await db.select({ id: schema.crmDeals.id, title: schema.crmDeals.title }).from(schema.crmDeals)
        .where(and(eq(schema.crmDeals.tenantId, open.tenantId), eq(schema.crmDeals.jobId, open.id)))
    : [];

  const tiles: { label: string; value: string; note: string; light: Light }[] = [
    { label: 'Quotes out', value: money(stats.quotesOutCents), note: stats.quotesOut ? `${stats.quotesOut} waiting on an answer` : 'None out right now', light: 'pending' },
    { label: 'Work on the books', value: money(stats.onBooksCents), note: `${stats.live} live ${stats.live === 1 ? 'job' : 'jobs'}`, light: 'pending' },
    {
      label: 'Average margin',
      value: stats.averageMargin === null ? '—' : pctLabel(stats.averageMargin),
      note: stats.averageMargin === null
        ? 'Not measured yet — shows once hours or materials land on a job'
        : `Benchmark ${Math.round(MARGIN_BENCHMARK * 100)}% · across ${stats.measured} ${stats.measured === 1 ? 'job' : 'jobs'}`,
      light: marginLight(stats.averageMargin),
    },
    {
      label: 'Owed to you',
      value: money(stats.owedCents),
      note: stats.owed ? `Oldest ${oldestOwed} days` : 'Nothing owed',
      // Green only once something has actually been paid — an empty business owes nothing because
      // nothing has happened yet, which is not a result.
      light: stats.owed ? (oldestOwed > 30 ? 'red' : oldestOwed > 14 ? 'amber' : 'pending') : jobs.some(j => j.stage === 'paid') ? 'green' : 'pending',
    },
  ];

  return (
    <div>
      <section aria-label="This month" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(s => (
          <div key={s.label} className="card">
            <span className="label-caps">{s.label}</span>
            <p className="mt-2 font-serif text-3xl leading-none text-ink">{s.value}</p>
            <p className="mt-2 text-xs" style={{ color: s.light === 'pending' ? undefined : pillTone(s.light).color }}>
              <span className={s.light === 'pending' ? 'text-ink-light' : ''}>{s.note}</span>
            </p>
          </div>
        ))}
      </section>

      {!jobs.length ? (
        <section className="card">
          <h2 className="font-serif text-xl text-ink">No jobs yet</h2>
          <p className="mt-2 max-w-[65ch] text-sm text-ink-light">
            Type the first enquiry in the box above — who it is for, what they want, where —
            and it lands here as an enquiry. From there it moves one step at a time: quoted, won,
            scheduled, on site, invoiced, paid.
          </p>
        </section>
      ) : (
        <section aria-label="Pipeline" className="grid auto-cols-[minmax(210px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
          {STAGES.map(st => {
            const list = jobs.filter(j => j.stage === st.key);
            return (
              <div key={st.key} className="grid min-h-[220px] content-start gap-2.5 rounded-2xl bg-ink/5 p-3.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-sm font-bold text-ink">{st.label}</span>
                  <span className="text-xs text-ink-light">{list.length ? money(list.reduce((a, j) => a + j.valueCents, 0)) : ''}</span>
                </div>
                {list.map(j => {
                  const flag = flagFor(j, bookings.some(b => b.jobId === j.id), now);
                  const ml = marginLight(j.margin);
                  return (
                    <Link
                      key={j.id}
                      href={tabHref('pipeline', { job: j.id })}
                      className={`block rounded-2xl bg-surface px-4 py-3.5 shadow-sm ${j.id === openId ? 'ring-2 ring-rust' : ''}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs text-ink-light">{j.ref}</span>
                        {flag && <Pill light={flag.light}>{flag.text}</Pill>}
                      </span>
                      <span className="mt-1.5 block text-sm font-bold leading-snug text-ink">{j.title}</span>
                      <span className="mt-1 block text-xs text-ink-light">{j.client}</span>
                      <span className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                        <strong className="text-ink">{j.valueCents ? money(j.valueCents) : 'To quote'}</strong>
                        {j.margin !== null && (
                          <span style={{ color: pillTone(ml).color }}>{pctLabel(j.margin)} margin</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {open && (
        <JobDetail
          job={open} crew={crew} manage={manage} now={now} tabHref={tabHref} hasRate={hasRate} fromDeal={fromDeal ?? null}
          bookings={bookings.filter(b => b.jobId === open.id)}
          quotes={quotes.filter(q => q.jobId === open.id)}
        />
      )}
    </div>
  );
}

function JobDetail({ job, crew, bookings, quotes, manage, now, tabHref, hasRate, fromDeal }: {
  job: Costed; crew: CrewMember[]; bookings: (typeof schema.scheduleBookings.$inferSelect)[];
  quotes: (typeof schema.quotes.$inferSelect)[]; manage: boolean; now: Date;
  tabHref: (k: string, e?: Record<string, string>) => string; hasRate: boolean;
  fromDeal: { id: string; title: string } | null;
}) {
  const stage = STAGES.find(s => s.key === job.stage) ?? STAGES[0];
  const light = marginLight(job.margin);
  const people = [...new Map(bookings.map(b => [b.personKey, b.personName])).entries()];
  const sent = quotes.filter(q => q.sentAt).at(-1);
  const days = [...new Set(bookings.map(b => b.day))].sort();

  const log: { when: string; what: string }[] = [
    { when: job.createdAt.slice(0, 10), what: fromDeal ? `Won in the CRM by ${job.createdBy}` : `Enquiry logged by ${job.createdBy}` },
    ...(sent?.sentAt ? [{ when: sent.sentAt.slice(0, 10), what: `${sent.ref} went out${sent.sentBy ? `, recorded by ${sent.sentBy}` : ''}` }] : []),
    ...(days.length ? [{ when: days[0], what: `Crew booked for ${days.length} ${days.length === 1 ? 'day' : 'days'}` }] : []),
    ...(job.minutes ? [{ when: 'So far', what: `${Math.round((job.minutes / 60) * 10) / 10} hours recorded on the job` }] : []),
    { when: job.stageAt.slice(0, 10), what: `Moved to ${stage.label}` },
  ];

  const next = (() => {
    if (!manage || job.stage === 'paid') return null;
    if (job.stage === 'enquiry') {
      return (
        <form action={startQuote}>
          <input type="hidden" name="jobId" value={job.id} />
          <SubmitButton className="btn-primary" pending="Opening…">{stage.next}</SubmitButton>
        </form>
      );
    }
    if (job.stage === 'won') return <Link href={tabHref('schedule', { book: job.id })} className="btn-primary">{stage.next}</Link>;
    return (
      <form action={advanceJob}>
        <input type="hidden" name="jobId" value={job.id} />
        <SubmitButton className="btn-primary" pending="Moving…">{stage.next}</SubmitButton>
      </form>
    );
  })();

  return (
    <section aria-label="Job detail" className="card mt-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs text-ink-light">{job.ref} · {stage.label}</span>
          <h2 className="mt-1 font-serif text-2xl text-ink">{job.title}</h2>
          <p className="mt-1 text-sm text-ink-light">{job.client}{job.site ? ` · ${job.site}` : ' · site to confirm'}</p>
          {fromDeal && (
            <Link href={`/crm?deal=${fromDeal.id}`} className="mt-1 inline-block text-xs text-rust-700 hover:underline">From the deal “{fromDeal.title}” in the CRM →</Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {next}
          <Link href={tabHref('pipeline')} className="btn-ghost">Close</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card-inset">
          <p className="label-caps mb-3">Job costing</p>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><span>Quoted</span><strong>{job.valueCents ? money(job.valueCents) : 'Not quoted yet'}</strong></div>
            <div className="flex justify-between gap-3"><span>Labour so far</span><strong>{hasRate ? money(job.labourCents) : 'No labour rate yet'}</strong></div>
            <div className="flex justify-between gap-3"><span>Materials so far</span><strong>{job.materialsCents === null ? 'Not recorded' : money(job.materialsCents)}</strong></div>
            <div className="flex justify-between gap-3"><span>Margin</span><strong>{job.margin === null ? '—' : pctLabel(job.margin)}</strong></div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ background: LIGHT_COLOUR[light], width: `${job.margin === null ? 0 : Math.max(4, Math.min(100, job.margin * 250))}%` }} />
          </div>
          <p className="mt-2.5 text-sm" style={light === 'pending' ? undefined : { color: pillTone(light).color }}>
            <span className={light === 'pending' ? 'text-ink-light' : ''}>
              {job.margin === null
                ? 'Margin shows as soon as hours and materials land on the job.'
                : light === 'green'
                  ? `Healthy. At or above the ${Math.round(MARGIN_BENCHMARK * 100)}% benchmark.`
                  : `Below the ${Math.round(MARGIN_BENCHMARK * 100)}% benchmark. Check the hours against the quote with the supervisor.`}
            </span>
          </p>
          {manage && (
            <form action={recordMaterials} className="mt-3 flex gap-2">
              <input type="hidden" name="jobId" value={job.id} />
              <input className="input min-w-0 flex-1" name="materials" inputMode="decimal"
                defaultValue={job.materialsCents === null ? '' : String(job.materialsCents / 100)}
                placeholder="Materials to date, $" aria-label="Materials to date in dollars" />
              <SubmitButton className="btn-secondary shrink-0 px-3" pending="…">Save</SubmitButton>
            </form>
          )}
          {!hasRate && (
            <p className="mt-2 text-xs text-ink-light">Labour is costed at your first labour rate — add one on the Catalogue tab.</p>
          )}
        </div>

        <div className="card-inset">
          <p className="label-caps mb-3">Crew &amp; safety</p>
          <div className="grid gap-2">
            {people.length ? people.map(([key, name]) => {
              const c = crew.find(m => m.key === key);
              return (
                <div key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span>{name}</span>
                  {c ? <Pill light={c.clear === 'blocked' ? 'red' : c.clear === 'clear' ? 'green' : 'pending'}>{c.label}</Pill>
                    : <Pill light="pending">Outside your part of the chart</Pill>}
                </div>
              );
            }) : <p className="text-sm text-ink-light">No crew booked yet</p>}
          </div>
          <p className="mt-3.5 text-xs text-ink-light">
            {people.length
              ? 'Everybody on this job was Clear to Work when they were booked. The gate is checked again at every booking.'
              : 'Book the crew and SPEC checks Clear to Work before anyone is sent.'}
          </p>
        </div>

        <div className="card-inset">
          <p className="label-caps mb-3">What happened</p>
          <div className="grid gap-2">
            {log.map((l, i) => (
              <div key={i} className="text-sm leading-5"><span className="text-ink-light">{l.when}</span> · {l.what}</div>
            ))}
            <div className="text-sm leading-5 text-ink-light">
              Invoices are raised in your accounting system; mark the job invoiced here when it goes.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══ Quotes ═══════════════════════════════════════════════════════════════════════════════════════ */

async function Quotes({ jobs, quotes, openId, items, kits, rates, manage, tenantId, tabHref }: {
  jobs: JobRow[]; quotes: (typeof schema.quotes.$inferSelect)[]; openId: string;
  items: CatalogueItem[]; kits: Kit[]; rates: LabourRate[]; manage: boolean; tenantId: string;
  tabHref: (k: string, e?: Record<string, string>) => string;
}) {
  const open = quotes.find(q => q.id === openId) ?? null;
  const quoteIds = quotes.map(q => q.id);
  const lineRows = quoteIds.length
    ? await db.select().from(schema.quoteLines)
        .where(and(eq(schema.quoteLines.tenantId, tenantId), inArray(schema.quoteLines.quoteId, quoteIds)))
        .orderBy(schema.quoteLines.position)
    : [];
  const linesOf = (quoteId: string): QuoteLine[] => lineRows.filter(l => l.quoteId === quoteId).map(l => ({
    kind: l.kind as QuoteLine['kind'], ref: l.refId, name: l.name, unitCostCents: l.unitCostCents,
    hours: l.hours, rateCostCents: l.rateCostCents, rateChargeCents: l.rateChargeCents, qty: l.qty,
  }));
  const jobOf = (id: string) => jobs.find(j => j.id === id);
  const toQuote = jobs.filter(j => j.stage === 'enquiry' && !quotes.some(q => q.jobId === j.id));

  return (
    <div className="grid gap-6">
      {open && (() => {
        const job = jobOf(open.jobId);
        const lines = linesOf(open.id);
        const t = priceQuote(lines, open.markupPct);
        return (
          <>
            <QuoteBuilder
              key={open.id + open.updatedAt}
              quoteId={open.id}
              heading={job?.title ?? 'Quote'}
              subheading={`${open.ref} · ${job?.client ?? ''}${job?.site ? ` · ${job.site}` : ''}`}
              client={job?.client ?? 'the client'}
              initialLines={lines}
              initialMarkup={open.markupPct}
              sent={open.status !== 'draft' || !manage}
              sentLine={open.sentAt
                ? `Went out ${open.sentAt.slice(0, 10)} at ${money(t.incGstCents)} inc GST. That price is fixed; a change is a revised quote.`
                : 'A draft. Only a manager can change it.'}
              items={items} kits={kits} rates={rates}
              action={saveQuote}
            />
            {manage && open.status !== 'draft' && job && (
              <form action={startQuote}>
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton className="btn-secondary" pending="Opening…">Start a revised quote</SubmitButton>
              </form>
            )}
          </>
        );
      })()}

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Quotes</h2>
          <span className="text-sm text-ink-light">{quotes.length} in all · {quotes.filter(q => q.status === 'draft').length} drafts</span>
        </div>
        {quotes.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="table-clean min-w-[640px]">
              <thead><tr><th>Quote</th><th>Job</th><th>Total inc GST</th><th>Margin</th><th>State</th></tr></thead>
              <tbody>
                {[...quotes].reverse().map(q => {
                  const job = jobOf(q.jobId);
                  const t = priceQuote(linesOf(q.id), q.markupPct);
                  return (
                    <tr key={q.id}>
                      <td><Link href={tabHref('quotes', { quote: q.id })} className="text-ink hover:text-rust">{q.ref}</Link></td>
                      <td>{job ? `${job.title} · ${job.client}` : 'Job no longer here'}</td>
                      <td>{money(t.incGstCents)}</td>
                      <td style={t.light === 'pending' ? undefined : { color: pillTone(t.light).color }}>{pctLabel(t.margin)}</td>
                      <td><Pill light={q.status === 'draft' ? 'pending' : 'green'}>{q.status === 'draft' ? 'Draft' : 'Sent'}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 max-w-[65ch] text-sm text-ink-light">
            No quotes yet. Open an enquiry on the Jobs tab and press &ldquo;Build the quote&rdquo;, or start one here.
          </p>
        )}
        {manage && toQuote.length > 0 && (
          <div className="mt-5">
            <p className="label-caps mb-2">Enquiries waiting on a quote</p>
            <div className="flex flex-wrap gap-2">
              {toQuote.map(j => (
                <form key={j.id} action={startQuote}>
                  <input type="hidden" name="jobId" value={j.id} />
                  <SubmitButton className="btn-secondary" pending="Opening…">Quote {j.ref} · {j.title}</SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}
      </section>

      {/*
        The worked example from the design. Interactive — the markup and quantities reprice it exactly
        as a real quote is priced — and never saved: it is SPEC's illustration, not the business's.
      */}
      <section>
        <p className="label-caps mb-3">Worked example · how a quote prices</p>
        <QuoteBuilder
          quoteId="example"
          heading={WORKED_EXAMPLE.title}
          subheading="Example · Q-2291 · Harris Strata · Chatswood (an invented client)"
          client="the client"
          initialLines={WORKED_EXAMPLE.lines}
          initialMarkup={WORKED_EXAMPLE.markupPct}
          sent={false}
          items={[]} kits={[]} rates={[]}
          example
        />
      </section>
    </div>
  );
}

/* ══ Schedule ═════════════════════════════════════════════════════════════════════════════════════ */

async function Schedule({ jobs, crew, week, book, manage, today, tenantId, tabHref }: {
  jobs: JobRow[]; crew: CrewMember[]; week: string; book: string; manage: boolean; today: string; tenantId: string;
  tabHref: (k: string, e?: Record<string, string>) => string;
}) {
  const days = workWeek(/^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const monday = days[0];
  const bookings = await db.select().from(schema.scheduleBookings)
    .where(and(eq(schema.scheduleBookings.tenantId, tenantId), inArray(schema.scheduleBookings.day, days)));
  const waiting = jobs.filter(j => j.stage === 'won' || j.stage === 'scheduled');
  const target = waiting.find(j => j.id === book) ?? waiting.find(j => j.stage === 'won') ?? waiting[0] ?? null;
  const unbooked = jobs.filter(j => j.stage === 'won');
  const refOf = (id: string) => jobs.find(j => j.id === id)?.ref ?? 'A job';

  return (
    <section className="card overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-ink">{weekLabel(monday)}</h2>
        <span className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={tabHref('schedule', { week: shiftWeek(monday, -1), ...(target ? { book: target.id } : {}) })} className="text-rust-700 hover:underline">← Last week</Link>
          <Link href={tabHref('schedule', { week: shiftWeek(monday, 1), ...(target ? { book: target.id } : {}) })} className="text-rust-700 hover:underline">Next week →</Link>
        </span>
      </div>

      {!crew.length ? (
        <p className="max-w-[65ch] text-sm text-ink-light">
          Nobody to book yet. The crew is the people on your part of the org chart — put them in their
          roles on the <Link href="/org" className="text-rust-700 hover:underline">org chart</Link> and they appear here, with Clear to Work checked.
        </p>
      ) : (
        <>
          {manage && target && (
            <p className="mb-3 text-sm text-ink-light">Tap an empty day to book {target.ref} there.</p>
          )}
          <div className="grid min-w-[760px] grid-cols-[170px_repeat(5,minmax(110px,1fr))] gap-2">
            <span />
            {days.map(d => <span key={d} className={`px-2 py-1 text-xs font-bold ${d === today ? 'text-rust-700' : 'text-ink'}`}>{dayLabel(d)}</span>)}
            {crew.map(c => (
              <Row key={c.key} c={c} days={days} bookings={bookings} target={target} manage={manage} monday={monday} refOf={refOf} />
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-2xl bg-cream px-4 py-3 text-sm">
        <strong>Waiting to be booked:</strong>
        {unbooked.length ? (
          <span className="flex flex-wrap gap-2">
            {unbooked.map(j => (
              <Link key={j.id} href={tabHref('schedule', { week: monday, book: j.id })}
                className={`rounded-full px-3 py-1 ${target?.id === j.id ? 'bg-ink text-cream' : 'bg-surface text-ink'}`}>
                {j.ref} {j.title}, {j.client}
              </Link>
            ))}
          </span>
        ) : (
          <span className="text-ink-light">Nothing. Every won job has a crew.</span>
        )}
      </div>
      {waiting.some(j => j.stage === 'scheduled') && (
        <p className="mt-2 text-xs text-ink-light">
          Adding days to a job already scheduled? Pick it here:{' '}
          {waiting.filter(j => j.stage === 'scheduled').map((j, i) => (
            <span key={j.id}>{i ? ', ' : ''}<Link href={tabHref('schedule', { week: monday, book: j.id })} className="text-rust-700 hover:underline">{j.ref}</Link></span>
          ))}
        </p>
      )}
    </section>
  );
}

function Row({ c, days, bookings, target, manage, monday, refOf }: {
  c: CrewMember; days: string[]; bookings: (typeof schema.scheduleBookings.$inferSelect)[];
  target: JobRow | null; manage: boolean; monday: string; refOf: (id: string) => string;
}) {
  const blocked = c.clear === 'blocked';
  return (
    <>
      <span className="grid gap-0.5 px-1 py-2">
        <span className="text-sm font-bold text-ink">{c.name}</span>
        <span className="text-xs" style={blocked ? { color: pillTone('red').color } : undefined}>
          <span className={blocked ? '' : 'text-ink-light'}>{blocked ? `Not clear to work · ${c.reason}` : c.clear === 'unknown' ? `${c.roleTitle} · not established yet` : c.roleTitle}</span>
        </span>
      </span>
      {days.map(d => {
        const b = bookings.find(x => x.personKey === c.key && x.day === d);
        const base = 'min-h-[52px] rounded-xl p-2 text-left text-sm font-semibold';
        if (b) {
          return (
            <div key={d} className={`${base} flex items-start justify-between gap-1 bg-ink/10 text-ink`}>
              <span>{refOf(b.jobId)}</span>
              {manage && (
                <form action={unbookCrew}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input type="hidden" name="week" value={monday} />
                  <button type="submit" aria-label={`Take ${c.name} off ${refOf(b.jobId)} on ${dayLabel(d)}`} className="px-1 text-ink-light hover:text-ink">×</button>
                </form>
              )}
            </div>
          );
        }
        if (blocked) {
          return <div key={d} className={base} style={{ ...pillTone('red') }}>Can&rsquo;t book</div>;
        }
        if (manage && target) {
          return (
            <form key={d} action={bookCrew} className="contents">
              <input type="hidden" name="person" value={c.key} />
              <input type="hidden" name="day" value={d} />
              <input type="hidden" name="jobId" value={target.id} />
              <input type="hidden" name="week" value={monday} />
              <button type="submit" className={`${base} bg-cream text-ink/45 hover:bg-ink/5 hover:text-ink`}>+ {target.ref}</button>
            </form>
          );
        }
        return <div key={d} className={`${base} bg-cream`} />;
      })}
    </>
  );
}

/* ══ Timesheets ═══════════════════════════════════════════════════════════════════════════════════ */

async function Timesheets({ jobs, crew, week, manage, today, tenantId, tabHref }: {
  jobs: JobRow[]; crew: CrewMember[]; week: string; manage: boolean; today: string; tenantId: string;
  tabHref: (k: string, e?: Record<string, string>) => string;
}) {
  const days = workWeek(/^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const monday = days[0];
  const keys = crew.map(c => c.key);
  const entries = keys.length
    ? await db.select().from(schema.timesheetEntries)
        .where(and(
          eq(schema.timesheetEntries.tenantId, tenantId),
          inArray(schema.timesheetEntries.day, days),
          inArray(schema.timesheetEntries.personKey, keys),
        ))
    : [];
  const waitingCount = entries.filter(e => !e.approvedAt && e.finishedAt).length;
  const live = jobs.filter(j => !['paid'].includes(j.stage));

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[60ch]">
          <h2 className="font-serif text-xl text-ink">Timesheets · {days[0] === workWeek(today)[0] ? 'this week' : weekLabel(monday).toLowerCase()}</h2>
          <p className="mt-2 text-sm text-ink-light">
            Built from Start and Finish on the phone — or typed in here. Nobody fills in a sheet. Hours on a
            job land on its costs straight away; approving them is your sign-off before payroll.
          </p>
          <p className="mt-2 flex gap-3 text-sm">
            <Link href={tabHref('time', { week: shiftWeek(monday, -1) })} className="text-rust-700 hover:underline">← Last week</Link>
            <Link href={tabHref('time', { week: shiftWeek(monday, 1) })} className="text-rust-700 hover:underline">Next week →</Link>
          </p>
        </div>
        {manage && (
          <form action={approveWeek}>
            <input type="hidden" name="week" value={monday} />
            {waitingCount
              ? <SubmitButton className="btn-secondary" pending="Approving…">Approve all</SubmitButton>
              : <span className="btn-secondary inline-block cursor-default opacity-70">{entries.length ? 'All approved ✓' : 'Nothing to approve'}</span>}
          </form>
        )}
      </div>

      {!crew.length ? (
        <p className="mt-4 text-sm text-ink-light">
          Nobody on your part of the chart yet — put people in their roles on the org chart and their time shows here.
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {crew.map(c => {
            const mine = entries.filter(e => e.personKey === c.key && e.finishedAt);
            const b = billable(mine);
            const refs = [...new Set(mine.map(e => (e.jobId ? jobs.find(j => j.id === e.jobId)?.ref : null) ?? 'Yard only'))];
            const waiting = mine.some(e => !e.approvedAt);
            return (
              <div key={c.key} className="grid grid-cols-[minmax(150px,1.4fr)_repeat(3,minmax(80px,1fr))_auto] items-center gap-3 rounded-2xl bg-cream px-4 py-3 text-sm">
                <span className="grid gap-0.5"><strong>{c.name}</strong><span className="text-xs text-ink-light">{c.roleTitle}</span></span>
                <span>{mine.length ? `${b.hours} h` : '—'}</span>
                <span style={b.light === 'pending' ? undefined : { color: pillTone(b.light).color }}>
                  <span className={b.light === 'pending' ? 'text-ink-light' : ''}>{mine.length ? `${pctLabel(b.share)} billable` : 'No time yet'}</span>
                </span>
                <span className="text-xs text-ink-light">{refs.join(', ') || '—'}</span>
                {mine.length ? <Pill light={waiting ? 'pending' : 'green'}>{waiting ? 'Waiting' : 'Approved'}</Pill> : <span />}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-light">
        Billable means time on a client&rsquo;s job. The benchmark is {Math.round(BILLABLE_TARGET * 100)}% and above; the
        target each supervisor is held to is the business&rsquo;s own, set on their KPI board.
      </p>

      {manage && crew.length > 0 && (
        <form action={recordTime} className="mt-5 grid gap-2 sm:grid-cols-[1.2fr_1.2fr_auto_auto_auto_auto]">
          <input type="hidden" name="week" value={monday} />
          <select className="input" name="person" aria-label="Who" defaultValue="" required>
            <option value="">Who?</option>
            {crew.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <select className="input" name="jobId" aria-label="Which job" defaultValue="">
            <option value="">Not on a job (yard, travel, training)</option>
            {live.map(j => <option key={j.id} value={j.id}>{j.ref} · {j.title}</option>)}
          </select>
          <input className="input" type="date" name="day" required defaultValue={days.includes(today) ? today : monday} aria-label="Day" />
          <input className="input" type="time" name="start" required aria-label="Start" />
          <input className="input" type="time" name="finish" required aria-label="Finish" />
          <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add time</SubmitButton>
        </form>
      )}
    </section>
  );
}

/* ══ Catalogue ════════════════════════════════════════════════════════════════════════════════════ */

function Catalogue({ items, kits, kitRows, rates, q, skipped, manage, today }: {
  items: (typeof schema.catalogueItems.$inferSelect)[]; kits: Kit[]; kitRows: (typeof schema.kits.$inferSelect)[];
  rates: LabourRate[]; q: string; skipped: string; manage: boolean; today: string;
}) {
  const suppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))].sort().map(name => {
    const theirs = items.filter(i => i.supplier === name);
    const latest = theirs.map(i => i.priceDate).filter((d): d is string => !!d).sort().at(-1) ?? null;
    return { name, count: theirs.length, latest, ...priceFileState(latest, today) };
  });
  const needle = q.trim().toLowerCase();
  const shown = items.filter(i => !needle || `${i.name} ${i.category} ${i.supplier}`.toLowerCase().includes(needle));
  const staleCount = items.filter(i => stale(i.lastUsedAt, i.createdAt, today)).length;
  const plain = items.map(i => ({ id: i.id, name: i.name, unit: i.unit, supplier: i.supplier, costCents: i.costCents }));

  return (
    <div className="grid gap-6">
      {skipped && (
        <p role="status" className="rounded-lg bg-surface p-4 text-sm text-ink">
          Price file loaded. {skipped} {skipped === '1' ? 'line was' : 'lines were'} skipped because they had no price SPEC could read.
        </p>
      )}

      <section aria-label="Supplier price files" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.map(s => (
          <div key={s.name} className="card">
            <span className="text-base font-bold text-ink">{s.name}</span>
            <p className="mt-1.5 text-xs text-ink-light">{s.count} {s.count === 1 ? 'item' : 'items'} in use · {s.latest ? `prices from ${s.latest}` : 'no price date'}</p>
            <span className="mt-3 inline-block"><Pill light={s.light}>{s.state}</Pill></span>
          </div>
        ))}
        {!suppliers.length && (
          <div className="card sm:col-span-2 lg:col-span-3">
            <span className="text-base font-bold text-ink">Supplier price files</span>
            <p className="mt-1.5 max-w-[65ch] text-sm text-ink-light">
              None loaded yet. First step: paste a supplier&rsquo;s price file below — one item per line, name, unit
              and cost. Load it again when a new file comes out and the prices update themselves; quotes already
              sent keep the price they went out at.
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">Catalogue</h2>
            <p className="mt-1.5 max-w-[70ch] text-sm text-ink-light">
              {items.length ? `${items.length.toLocaleString('en-AU')} items you actually use.` : 'The items you actually use, and nothing else.'}{' '}
              Supplier prices update when you load their file. SPEC flags anything not used in 12 months so the list stays lean
              {staleCount ? ` — ${staleCount} flagged now.` : '.'}
            </p>
          </div>
          <form className="flex gap-2" action="/jobs">
            <input type="hidden" name="tab" value="catalogue" />
            <input className="input max-w-[260px] rounded-full" name="q" defaultValue={q} placeholder="Search items" aria-label="Search catalogue" />
          </form>
        </div>

        {shown.length ? (
          <div className="mt-4 grid gap-1.5">
            {shown.slice(0, 300).map(i => {
              const old = stale(i.lastUsedAt, i.createdAt, today);
              return (
                <div key={i.id} className="grid grid-cols-[minmax(180px,2fr)_minmax(80px,1fr)_repeat(3,minmax(70px,0.8fr))] items-center gap-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm">
                  <span className="grid gap-0.5"><strong>{i.name}</strong><span className="text-xs text-ink-light">{i.category ? `${i.category} · ` : ''}per {i.unit}</span></span>
                  <span>{i.supplier || <span className="text-ink-light">No supplier</span>}</span>
                  <span>Cost {money2(i.costCents)}</span>
                  <span>Sell {money2(Math.round(i.costCents * (1 + DEFAULT_MARKUP / 100)))}</span>
                  <span className="flex items-center justify-end gap-2 text-xs text-ink-light">
                    {old ? (
                      manage ? (
                        <form action={retireItem}>
                          <input type="hidden" name="itemId" value={i.id} />
                          <SubmitButton className="btn-ghost px-2 py-1 text-xs" pending="…">Not used in 12 months · retire</SubmitButton>
                        </form>
                      ) : 'Not used in 12 months'
                    ) : (i.priceDate ? `Price ${i.priceDate}` : '')}
                  </span>
                </div>
              );
            })}
            <p className="mt-1 text-xs text-ink-light">Sell shown at the {DEFAULT_MARKUP}% markup. Each quote picks its own.</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-light">
            {items.length ? 'Nothing matches that search.' : 'No items yet. Add the ones you quote most below, or paste a supplier’s price file.'}
          </p>
        )}

        {manage && (
          <div className="mt-5 grid gap-4">
            <form action={addItem} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_0.7fr_0.8fr_auto]">
              <input className="input" name="name" required maxLength={160} placeholder="Double power point, white" aria-label="Item name" />
              <input className="input" name="category" maxLength={60} placeholder="Category" aria-label="Category" />
              <input className="input" name="supplier" maxLength={80} placeholder="Supplier" aria-label="Supplier" />
              <input className="input" name="unit" maxLength={30} placeholder="each" aria-label="Unit" />
              <input className="input" name="cost" required inputMode="decimal" placeholder="Cost $" aria-label="Cost in dollars" />
              <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add item</SubmitButton>
            </form>
            <details>
              <summary className="cursor-pointer text-sm text-rust-700 hover:underline">Load a supplier price file</summary>
              <form action={loadPriceFile} className="mt-3 grid gap-2">
                <input className="input max-w-sm" name="supplier" required maxLength={80} placeholder="Which supplier" aria-label="Supplier" />
                <textarea className="input min-h-[140px] font-mono text-xs" name="file" required
                  placeholder={'One item per line: name, unit, cost\nRCBO 20A 30mA, each, 42.60\nConduit 25mm 4m, length, 6.10'} aria-label="Price file" />
                <SubmitButton className="btn-secondary w-fit" pending="Loading…">Load prices</SubmitButton>
                <p className="text-xs text-ink-light">Copy the columns straight out of a spreadsheet. A line without a price is skipped and counted, never guessed.</p>
              </form>
            </details>
          </div>
        )}

        <p className="label-caps mb-2 mt-7">Kits · pre-built bundles you quote in one line</p>
        {kits.length ? (
          <div className="grid gap-1.5">
            {kits.map(k => {
              const e = expandKit(k, plain);
              const row = kitRows.find(r => r.id === k.id);
              const rate = rates.find(r => r.id === row?.labourRateId) ?? rates[0];
              return (
                <div key={k.id} className="flex flex-wrap justify-between gap-2.5 rounded-xl bg-cream px-3.5 py-2.5 text-sm">
                  <strong>{k.name}</strong>
                  <span>
                    {money(e.costCents)} materials + {k.labourHours} h labour{rate && k.labourHours ? ` at ${rate.name}` : ''}
                    {e.missing.length ? <span className="ml-2"><Pill light="amber">{e.missing.length} part{e.missing.length === 1 ? '' : 's'} no longer in the catalogue</Pill></span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-light">No kits yet. Bundle the things you always quote together — a board upgrade, a downlight point — and quote them in one line.</p>
        )}
        {manage && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-rust-700 hover:underline">Build a kit</summary>
            {items.length ? (
              <form action={addKit} className="mt-3 grid gap-2">
                <input className="input max-w-md" name="name" required maxLength={160} placeholder="Downlight, supply and install per point" aria-label="Kit name" />
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="grid grid-cols-[1fr_90px] gap-2">
                    <select className="input" name={`item${i}`} defaultValue="" aria-label={`Part ${i + 1}`}>
                      <option value="">{i === 0 ? 'First part…' : 'Another part (optional)'}</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                    <input className="input" name={`qty${i}`} inputMode="decimal" placeholder="Qty" aria-label={`Quantity of part ${i + 1}`} />
                  </div>
                ))}
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="input" name="hours" inputMode="decimal" placeholder="Labour hours" aria-label="Labour hours per kit" />
                  <select className="input" name="rateId" defaultValue="" aria-label="Labour rate">
                    <option value="">At your first labour rate</option>
                    {rates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <input className="input" name="extra" inputMode="decimal" placeholder="Sundries $" aria-label="Sundries in dollars" />
                </div>
                <SubmitButton className="btn-secondary w-fit" pending="Saving…">Save the kit</SubmitButton>
              </form>
            ) : <p className="mt-2 text-sm text-ink-light">Add a few items first — a kit is built from them.</p>}
          </details>
        )}

        <p className="label-caps mb-2 mt-7">Labour rates</p>
        {rates.length ? (
          <div className="grid gap-1.5">
            {rates.map((r, i) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2.5 rounded-xl bg-cream px-3.5 py-2.5 text-sm">
                <strong>{r.name}{i === 0 ? <span className="ml-2 text-xs font-normal text-ink-light">standard — jobs are costed at this</span> : null}</strong>
                <span>Costs {money2(r.costCents)} an hour · charged at {money2(r.chargeCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-light">No labour rates yet. Add what an hour costs you and what you charge for it — the first one is the standard jobs are costed at.</p>
        )}
        {manage && (
          <form action={addRate} className="mt-3 grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
            <input className="input" name="name" required maxLength={80} placeholder="Licensed electrician" aria-label="Rate name" />
            <input className="input" name="cost" required inputMode="decimal" placeholder="Costs you $/h" aria-label="Cost per hour in dollars" />
            <input className="input" name="charge" required inputMode="decimal" placeholder="You charge $/h" aria-label="Charge per hour in dollars" />
            <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add rate</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

/* ══ The three areas not set up yet ═══════════════════════════════════════════════════════════════ */

/*
  Drawn in the design's shape — a section per area, its purpose in one line — and honest about the
  state: nothing here is set up yet, so there are no rows, no invented counts and no red. Each says
  the first step a leader can take today, which is always something the business already has.
*/

interface Group {
  title: string;
  blurb: string;
  rows: { title: string; sub: string; state: string; light: Light }[];
  empty: string;
}

function stockGroups(): Group[] {
  return [
    {
      title: 'Van stock',
      blurb: 'What’s on each van, topped up from the warehouse. Used on a job from the phone, it comes off the van and onto the job cost.',
      rows: [],
      empty: 'Not set up yet. First step: make sure what the vans carry is in the Catalogue — van stock is counted against those items. Until then, record materials on each job from the Jobs tab.',
    },
    {
      title: 'Purchase orders',
      blurb: 'Raised from the job or the quote in one click, sent to the supplier, and matched to their bill when it arrives.',
      rows: [],
      empty: 'Not set up yet. First step: put the materials on the job’s quote — that is what a purchase order is raised from. Keep raising orders the way you do today in the meantime.',
    },
    {
      title: 'Warehouse',
      blurb: 'One place for yard stock, with stock-takes, transfers to vans and a reorder list built from what jobs will need next week.',
      rows: [],
      empty: 'Not set up yet. First step: book next week in the Schedule — the reorder list is built from the jobs on it and their quotes.',
    },
  ];
}

function billingGroups(jobs: Costed[], now: Date): Group[] {
  const owed = jobs.filter(j => j.stage === 'invoiced').sort((a, b) => a.stageAt.localeCompare(b.stageAt));
  return [
    {
      title: 'Progress claims',
      blurb: 'For the big jobs: claim by stage or by percentage complete, with retention held and released on the dates in the contract.',
      rows: [],
      empty: 'Not set up yet. First step: send the quote for the job from Quotes — a claim schedule is set against the quoted value. Claims are raised in your accounting system until then.',
    },
    {
      title: 'Variations',
      blurb: 'Extra work the client asked for, priced and signed on site before it’s done, so it’s never argued about at invoice time.',
      rows: [],
      empty: 'Not set up yet. First step: price the extra work as a revised quote on the job, so the change and its price are on record before the work is done.',
    },
    {
      title: 'Invoices & getting paid',
      blurb: 'Invoice the moment the job is signed off, in your accounting system. SPEC holds who owes what, and for how long.',
      rows: owed.map(j => {
        const days = daysSince(j.stageAt, now);
        return {
          title: `${j.ref} · ${j.client} · ${j.title}`,
          sub: `${money(j.valueCents)} ex GST · ${days} ${days === 1 ? 'day' : 'days'}`,
          state: days > 30 ? 'Call them today' : days > 14 ? 'Chase it' : 'Waiting on payment',
          light: days > 30 ? 'red' : days > 14 ? 'amber' : 'pending',
        };
      }),
      empty: 'Nothing owed. When a job is marked invoiced on the Jobs tab it appears here with how long it has been waiting.',
    },
  ];
}

function serviceGroups(): Group[] {
  return [
    {
      title: 'Service contracts & recurring work',
      blurb: 'Maintenance agreements that book themselves: the job is created, the tech is scheduled and the client is told, on the cycle in the contract.',
      rows: [],
      empty: 'Not set up yet. First step: log the next visit as an enquiry on the Jobs tab, so it is quoted and booked like any other job.',
    },
    {
      title: 'Test & tag and site assets',
      blurb: 'Every asset tested at a client site, with its result, photo and next due date. Clients get their report without asking.',
      rows: [],
      empty: 'Not set up yet. First step: put each site’s testing on the Jobs tab as a job, so the visit is costed and the crew is checked Clear to Work.',
    },
    {
      title: 'Your vehicles & plant',
      blurb: 'Rego, servicing and weekly checks for every ute, trailer and bit of plant, shared with SPEC Safety.',
      rows: [],
      empty: 'Not set up yet. First step: record each driver’s licence and each plant ticket against the person on the People screen — an expired one already stops them being booked.',
    },
  ];
}

function Register({ groups }: { groups: Group[] }) {
  return (
    <div className="grid gap-6">
      {groups.map(g => (
        <section key={g.title} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">{g.title}</h2>
            {!g.rows.length && <Pill light="pending">{g.empty.startsWith('Not set up') ? 'Not set up yet' : 'Nothing here'}</Pill>}
          </div>
          <p className="mt-2 max-w-[64ch] text-sm text-ink-light">{g.blurb}</p>
          {g.rows.length ? (
            <div className="mt-4 grid gap-2">
              {g.rows.map(r => (
                <div key={r.title} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_260px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{r.title}</span>
                    <span className="text-xs text-ink-light">{r.sub}</span>
                  </span>
                  <Pill light={r.light}>{r.state}</Pill>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">{g.empty.replace(/^Not set up yet\. /, '')}</p>
          )}
        </section>
      ))}
    </div>
  );
}
