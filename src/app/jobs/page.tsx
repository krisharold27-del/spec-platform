import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnSystemLine } from '@/components/own-system-line';
import { ownSystemFor } from '@/lib/coverage-data';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { CopyBox } from '@/components/copy-box';
import { quoteWatch, chaseDraft, worthGoingBackFor, tenderWatch, growthLine } from '@/lib/growth';
import { Refused } from '@/components/refused';
import { QuoteBuilder } from '@/components/quote-builder';
import { getCurrentUser, canManage } from '@/lib/auth';
import { refusedReason } from '@/lib/refuse';
import { pillTone, LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { crewFor, type CrewMember } from '@/lib/jobs-data';
import { photoHref, photoLine } from '@/lib/photos';
import { catalogueHealth, catalogueAlert, KEEP_IT_SHORT } from '@/lib/catalogue-health';
import { wipRow, wipStats, wipLine, byWipAttention, wipMoney, WIP_LABEL } from '@/lib/wip';
import { runForward, cashStats, cashAdvice, cashLine, cashLabel, DEFAULT_BUFFER_CENTS, type Week } from '@/lib/cashflow';
import { seatOf, tabsFor, maySeeTab, stripMoney, insteadGoTo } from '@/lib/sight';
import { crewWatch, crewLine, unheld, WHY_ONE_SUPERVISOR } from '@/lib/crews';
import { noAccessCount, repeaters } from '@/lib/no-access';
import { overlapping, cardLine } from '@/lib/rate-cards';
import { hireWatch, shouldBeBack, plantLine } from '@/lib/plant';
import {
  outstanding, certificateLine, isSetUp, TERRITORIES, SUGGESTED_NAME,
  CONFIRM_THE_NAME, WHY_THE_WINDOW_IS_YOURS, type CertificateSetup, type Territory,
} from '@/lib/certificates';
import { seatFor } from '@/lib/seat-of';
import { reworkStats, reworkLine, reworkMoney, pattern, CAUSES, causeLabel, recoverFrom, REWORK_TARGET, RETURNING_RULE, unpaidRework, carriedLine, carriedCents, RECOVERY_GOES_STALE_DAYS } from '@/lib/rework';
import { reviewStats, reviewLine, needsReply, isComplaint, thankYou, mayAsk } from '@/lib/reviews';
import { ACES, runOf, runLine, boardScore, towards, under, ACE_STANDARD, type BoardLine, type AceMonth } from '@/lib/ace';
import { JobPhoto } from '@/components/job-photo';
import { recordLabel } from '@/lib/tech-day';
import {
  STAGES, jobMargin, marginLight, marginSlip, slippedCount, pipelineStats, priceQuote, labourCostCents, billable,
  workWeek, dayLabel, weekLabel, shiftWeek, priceFileState, stale, parseComponents, expandKit,
  money, money2, pctLabel, MARGIN_BENCHMARK, BILLABLE_TARGET, DEFAULT_MARKUP, WORKED_EXAMPLE,
  type Light, type QuoteLine, type Kit, type CatalogueItem, type LabourRate,
} from '@/lib/jobs';
import {
  addEnquiry, advanceJob, recordMaterials, startQuote, saveQuote, addItem, loadPriceFile, retireItem,
  addRate, addKit, bookCrew, unbookCrew, recordTime, adjustTime,
  raiseOrder, recordBill, acceptBill, orderArrived,
  raiseBill, agreeVariation, sendBill, sendReminder, markPaid, releaseRetention,
  addRecurring, recordDone, bookRecurring, setSource, markQuoted, setStock, orderTheShortfall, setKitPack,
  addTender,
  addTool,
  logCallback, setReviewLink, askForReview, recordQuoteChase, addScope, setSupervisor,
  setCertificateSetup, issueCertificate, lodgeCertificate, excuseCertificate,
  addRateCard, addRateLine, putOnHire, offHire,
} from './actions';

import {
  match, isLate, byAttention, purchasingStats, purchasingLine, orderStateLabel, type OrderRow,
} from '@/lib/purchasing';
import {
  moneyStats, moneyLine, moneyLabel, chase, maySend, billKindLabel,
  BILL_KINDS, BILL_STATE_LABEL, isBillState,
} from '@/lib/billing-job';
import {
  RECUR_KINDS, recurStats, recurLine, byDue, dueStateOf, dueLine, needsBooking, DUE_LABEL,
} from '@/lib/recurring';
import {
  leadStats, leadLine, waitingForQuote, bySource, SOURCES, QUOTE_TARGET_DAYS, type Lead,
} from '@/lib/leads';
import {
  stockStats, stockLine, byShortage, stockStateOf, STOCK_LABEL, reorderList, shortBy, placesIn,
} from '@/lib/stock';
import { packState, parseChecklist, vanList } from '@/lib/prebuild';
import { Recommends, SwitchCards } from '@/components/recommends';
import { weekFor, payRunFor, angusConnected } from '@/lib/timesheets-data';
import { ALLOWANCES, parseAllowances, allowanceLabel, approveTopic, maySend as maySendWeek, destinationFor, sentLine } from '@/lib/timesheets';

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

/*
  ── Twenty tabs, under three groups, in the order work flows ────────────────────────────────────
 *
 * Nine tabs in one row was already the most crowded thing in SPEC, and design 17 brings it to
 * twenty. A row of twenty is not navigation, it is a wall — so they sit under the three things a
 * trade business actually does, in order: **win the work**, **do the work**, **get paid and keep
 * them**. The group row is on top and only that group's tabs show beneath it.
 *
 * That ordering is the point rather than the tidying. A business does not think "I need the
 * catalogue screen", it thinks "I have not been paid" — and everything about being paid is now in
 * one place instead of scattered between Invoices, Service and the board.
 *
 * Taken from `GROUPS` and `TABS` in designs/SPEC Jobs.dc.html, key for key, so a tab renamed in the
 * design is a tab renamed here. `tests/jobs-tabs.test.ts` reads the design file and fails if the two
 * drift — the keys are what every deep link in the product is built from (My Page's "Your job
 * today" steps open `?tab=`), so a silent rename breaks links nobody would think to check.
 */
const TABS = [
  { key: 'pipeline', label: 'Jobs' },
  { key: 'leads', label: 'Leads' },
  { key: 'tenders', label: 'Tenders' },
  { key: 'takeoff', label: 'Takeoff' },
  { key: 'customers', label: 'Customers' },
  { key: 'ace', label: 'Sales Ace' },
  { key: 'jobace', label: 'Jobs Ace' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'prebuilds', label: 'Pre-builds' },
  { key: 'howlong', label: 'How long?' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'time', label: 'Timesheets' },
  { key: 'catalogue', label: 'Materials' },
  { key: 'stock', label: 'Stock & buying' },
  { key: 'tools', label: 'Tools & equipment' },
  { key: 'billing', label: 'Invoices & claims' },
  { key: 'wip', label: 'Work in progress' },
  { key: 'cash', label: 'Cash flow' },
  { key: 'service', label: 'Repeat work' },
  { key: 'rework', label: 'Callbacks & rework' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'growth', label: 'Keep work coming' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'rates', label: 'Rates & hire' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export const TAB_GROUPS = [
  { key: 'win', label: 'Win the work', tabs: ['growth', 'leads', 'tenders', 'takeoff', 'customers', 'rates', 'ace', 'quotes', 'prebuilds', 'howlong'] },
  { key: 'do', label: 'Do the work', tabs: ['pipeline', 'jobace', 'schedule', 'time', 'catalogue', 'stock', 'tools'] },
  { key: 'paid', label: 'Get paid and keep them', tabs: ['billing', 'certificates', 'wip', 'cash', 'service', 'rework', 'reviews'] },
] as const;

/** The group a tab belongs to. Do the work when the tab is not one anybody knows — the middle of the day. */
const groupOf = (tab: string) =>
  TAB_GROUPS.find(g => (g.tabs as readonly string[]).includes(tab)) ?? TAB_GROUPS[1];

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

  /*
    ── What this person may SEE, which is not what they may change ─────────────────────────────

    Kris, 25 September: a subcontractor sees their own work only, and for employees, money is
    leadership. Until now this screen was gated on being signed in and nothing else — every tab
    rendered for everybody, so any login could read every margin, the cash position and the whole
    customer list. Nobody decided that; it is what happens when permission is built as "may I press
    this" and sight is left to whatever the page happens to render.
  */
  const seat = await seatFor(user);
  const allowed = tabsFor(seat, TABS);
  if (!maySeeTab(seat, tab)) {
    /*
      Sent to their own work rather than shown a locked door. Somebody who has followed a link from
      a colleague has not done anything wrong, and a refusal that ends the journey teaches people
      the product is against them.
    */
    redirect(`${insteadGoTo(seat)}?instead=jobs`);
  }

  const own = await ownSystemFor(user.tenantId, 'jobs', tab);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  /* Everything this business has recorded for Jobs, read once and scoped by tenant in the query. */
  const [allJobs, quotes, itemRows, kitRows, rateRows, jobTime, orderRows, billRows, recurRows, stockRows, callbackRows, reviewRows, toolRows, tenderRows, chaseRows, noAccessRows, rateCardRows, rateLineRows, hireRows] = await Promise.all([
    db.select().from(schema.jobs).where(eq(schema.jobs.tenantId, user.tenantId)).orderBy(schema.jobs.createdAt),
    db.select().from(schema.quotes).where(eq(schema.quotes.tenantId, user.tenantId)).orderBy(schema.quotes.createdAt),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)).orderBy(schema.catalogueItems.name),
    db.select().from(schema.kits).where(eq(schema.kits.tenantId, user.tenantId)).orderBy(schema.kits.name),
    db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, user.tenantId))
      .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
    db.select({ jobId: schema.timesheetEntries.jobId, minutes: schema.timesheetEntries.minutes })
      .from(schema.timesheetEntries)
      .where(and(eq(schema.timesheetEntries.tenantId, user.tenantId), isNotNull(schema.timesheetEntries.jobId))),
    db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, user.tenantId))
      .orderBy(schema.purchaseOrders.createdAt),
    db.select().from(schema.jobBills).where(eq(schema.jobBills.tenantId, user.tenantId))
      .orderBy(schema.jobBills.createdAt),
    db.select().from(schema.recurringWork).where(eq(schema.recurringWork.tenantId, user.tenantId))
      .orderBy(schema.recurringWork.nextDueAt),
    db.select().from(schema.stockLevels).where(eq(schema.stockLevels.tenantId, user.tenantId)),
    /* Design 17's fourth group and the two registers it brought with it. */
    db.select().from(schema.callbacks).where(eq(schema.callbacks.tenantId, user.tenantId))
      .orderBy(schema.callbacks.createdAt),
    db.select().from(schema.reviews).where(eq(schema.reviews.tenantId, user.tenantId))
      .orderBy(schema.reviews.createdAt),
    db.select().from(schema.tools).where(eq(schema.tools.tenantId, user.tenantId))
      .orderBy(schema.tools.name),
    db.select().from(schema.tenders).where(eq(schema.tenders.tenantId, user.tenantId))
      .orderBy(schema.tenders.dueAt),
    db.select().from(schema.quoteChases).where(eq(schema.quoteChases.tenantId, user.tenantId)),
    db.select().from(schema.noAccessVisits).where(eq(schema.noAccessVisits.tenantId, user.tenantId))
      .orderBy(schema.noAccessVisits.createdAt),
    db.select().from(schema.rateCards).where(eq(schema.rateCards.tenantId, user.tenantId)),
    db.select().from(schema.rateCardLines).where(eq(schema.rateCardLines.tenantId, user.tenantId)),
    db.select().from(schema.plantHires).where(eq(schema.plantHires.tenantId, user.tenantId))
      .orderBy(schema.plantHires.onHireAt),
  ]);
  const crew = await crewFor(user);

  /* Every minute worked, whatever job it was on — the denominator the rework rate is a share of. */
  const workedMinutes = jobTime.reduce((t, e) => t + (e.minutes ?? 0), 0);

  /* The two things this business sets for itself: where reviews go, and the floor under its cash. */
  const [tenantRow] = await db.select({
    name: schema.tenants.name,
    certificateName: schema.tenants.certificateName,
    certificateTerritory: schema.tenants.certificateTerritory,
    certificateWithinDays: schema.tenants.certificateWithinDays,
    noAccessHours: schema.tenants.noAccessHours,
    reviewLink: schema.tenants.reviewLink,
    cashBufferCents: schema.tenants.cashBufferCents,
  }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));

  /*
    Taken out of the rows rather than hidden in the markup. Filtering the TABS is not enough on its
    own — the board itself carries a value on every card, so a team member reading the pipeline
    would still be reading the order book — and a number that reaches the page and is styled away
    is a number that is still in the page.
  */
  const jobs = stripMoney(allJobs, seat);

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

      {/*
        The group row, then that group's tabs. Twenty tabs in one row is a wall rather than
        navigation; three words a tradie already uses is a way in. Opening a group lands on its
        first tab, so a press always goes somewhere.
      */}
      <nav aria-label="Jobs" className="mb-6 grid gap-3">
        <div className="flex flex-wrap gap-2">
          {TAB_GROUPS.map(g => {
            /* A group with nothing in it for this seat is not drawn at all. */
            const mine = g.tabs.filter(k => maySeeTab(seat, k));
            if (mine.length === 0) return null;
            const here = g.key === groupOf(tab).key;
            return (
              <Link
                key={g.key}
                href={tabHref(mine[0])}
                aria-current={here ? 'true' : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${here ? 'bg-ink text-white' : 'bg-surface text-ink-light shadow-sm hover:bg-cream'}`}
              >
                {g.label}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {groupOf(tab).tabs.filter(key => maySeeTab(seat, key)).map(key => {
            const t = TABS.find(x => x.key === key)!;
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                aria-current={t.key === tab ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${t.key === tab ? 'bg-rust text-cream' : 'bg-surface text-ink shadow-sm hover:bg-cream'}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
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
        <Catalogue items={itemRows} kits={kits} kitRows={kitRows} rates={rates} q={one(sp.q)} skipped={one(sp.skipped)} rises={one(sp.rises)} rose={one(sp.rose)} manage={manage} today={today} />
      )}
      {/* Claude recommends the labour rate, beside the rates it would change. */}
      {tab === 'catalogue' && <div className="mt-6"><Recommends topic="labour_rate" back="/jobs?tab=catalogue" /></div>}
      {tab === 'leads' && <Leads jobs={jobs} manage={manage} now={now} />}
      {tab === 'stock' && <Stock orders={orderRows} jobs={jobs} manage={manage} today={today} levels={stockRows} items={items} />}
      {tab === 'billing' && <Billing bills={billRows} jobs={jobs} manage={manage} now={now} />}
      {tab === 'service' && <Recurring rows={recurRows} manage={manage} today={today} />}
      {tab === 'prebuilds' && (
        <Catalogue items={itemRows} kits={kits} kitRows={kitRows} rates={rates} q={one(sp.q)} skipped={one(sp.skipped)} rises={one(sp.rises)} rose={one(sp.rose)} manage={manage} today={today} only="kits" />
      )}
      {tab === 'customers' && <Customers jobs={jobs} tenantId={user.tenantId} />}
      {tab === 'wip' && <WorkInProgress jobs={costed} bills={billRows} manage={manage} tabHref={tabHref} />}
      {tab === 'cash' && <CashFlow tenantId={user.tenantId} bills={billRows} orders={orderRows} today={today} />}
      {tab === 'rework' && (
        <Rework rows={callbackRows} jobs={jobs} crew={crew} manage={manage} minutes={workedMinutes}
          noAccessRows={noAccessRows}
          noAccessHours={tenantRow?.noAccessHours ? Number(tenantRow.noAccessHours) : null} />
      )}
      {tab === 'reviews' && <Reviews rows={reviewRows} jobs={jobs} manage={manage} link={tenantRow?.reviewLink ?? null} />}
      {tab === 'rates' && (
        <RatesAndPlant jobs={jobs} cards={rateCardRows} lines={rateLineRows} hires={hireRows}
          manage={manage} today={today} />
      )}
      {tab === 'certificates' && (
        <Certificates jobs={jobs} manage={manage} setup={{
          territory: (tenantRow?.certificateTerritory ?? null) as Territory | null,
          name: tenantRow?.certificateName ?? null,
          withinDays: tenantRow?.certificateWithinDays ?? null,
        }} />
      )}
      {tab === 'growth' && (
        <KeepWorkComing jobs={jobs} chases={chaseRows} tenders={tenderRows} manage={manage}
          business={tenantRow?.name ?? 'us'} now={now} />
      )}
      {tab === 'tools' && <Tools rows={toolRows} crew={crew} manage={manage} today={today} />}
      {tab === 'tenders' && <Tenders rows={tenderRows} manage={manage} today={today} />}
      {tab === 'takeoff' && <Takeoff kits={kits} items={itemRows} manage={manage} />}
      {tab === 'howlong' && <HowLong jobs={costed} quotes={quotes} />}
      {tab === 'ace' && <AceBoard kind="sales" tenantId={user.tenantId} jobs={costed} quotes={quotes} today={today} />}
      {tab === 'jobace' && <AceBoard kind="jobs" tenantId={user.tenantId} jobs={costed} quotes={quotes} today={today} />}

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

  /*
    What the crew recorded on site: the SWMS they signed, the photos, the materials, the client's
    signature. Fetched for the OPEN job only — this is a board, and reading every record for every
    job to show one job's is a query that gets slower as the business grows.

    The photos matter here more than anywhere else. Until a file store was connected SPEC kept only
    the caption, so the office had an evidence chain it could read and never look at.
  */
  const dayRecords = open
    ? await db.select({
        id: schema.jobRecords.id, kind: schema.jobRecords.kind, who: schema.jobRecords.who,
        what: schema.jobRecords.what, fileRef: schema.jobRecords.fileRef, atTime: schema.jobRecords.atTime,
      }).from(schema.jobRecords)
        .where(and(eq(schema.jobRecords.tenantId, open.tenantId), eq(schema.jobRecords.jobId, open.id)))
        .orderBy(schema.jobRecords.atTime)
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
                      {/*
                        Said WHILE the job is running, which is the only version of this that
                        changes an outcome. The same number at invoicing is a post mortem; on
                        Tuesday with three days of labour to go it is a decision.
                      */}
                      {(() => {
                        const slip = marginSlip(j);
                        return slip.slipped
                          ? <span className="mt-1.5 block text-xs" style={{ color: pillTone(slip.light).color }}>{slip.says}</span>
                          : null;
                      })()}
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
          dayRecords={dayRecords}
        />
      )}
    </div>
  );
}

function JobDetail({ job, crew, bookings, quotes, manage, now, tabHref, hasRate, fromDeal, dayRecords }: {
  job: Costed; crew: CrewMember[]; bookings: (typeof schema.scheduleBookings.$inferSelect)[];
  quotes: (typeof schema.quotes.$inferSelect)[]; manage: boolean; now: Date;
  tabHref: (k: string, e?: Record<string, string>) => string; hasRate: boolean;
  fromDeal: { id: string; title: string } | null;
  /** What the crew recorded on the phone for this job — see `FromSite`. */
  dayRecords: { id: string; kind: string; who: string; what: string; fileRef: string | null; atTime: string }[];
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
          <p className="mt-1 text-sm text-ink-light">
            {job.organisationId || job.personId
              ? <Link href={`/clients?${new URLSearchParams({ client: job.organisationId ? `org:${job.organisationId}` : `person:${job.personId}` })}`} className="hover:text-rust">{job.client}</Link>
              : job.client}
            {job.site ? ` · ${job.site}` : ' · site to confirm'}
          </p>
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
          {/*
            Book somebody from the staff list without leaving the job. The same action as the grid,
            so the same server-side Clear to Work gate: somebody not clear is refused there, not here —
            the disabled option is a courtesy, never the check.
          */}
          {manage && job.stage !== 'paid' && crew.length > 0 && (
            <form action={bookCrew} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="from" value="job" />
              <select className="input sm:col-span-2" name="person" required defaultValue="" aria-label="Who to book">
                <option value="" disabled>Book somebody…</option>
                {crew.map(c => (
                  <option key={c.key} value={c.key} disabled={c.clear === 'blocked'}>
                    {c.name} · {c.roleTitle}{c.clear === 'blocked' ? ' — not clear to work' : c.clear === 'unknown' ? ' — not established' : ''}
                  </option>
                ))}
              </select>
              <input className="input" type="date" name="day" required defaultValue={now.toISOString().slice(0, 10)} aria-label="Which day" />
              <SubmitButton className="btn-secondary shrink-0" pending="Booking…">Book</SubmitButton>
            </form>
          )}
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

        <FromSite records={dayRecords} />
      </div>
    </section>
  );
}

/**
 * What the crew recorded on site, and the photos themselves.
 *
 * ── Why the office sees this at all ──────────────────────────────────────────────────────────────
 *
 * The phone has recorded the SWMS, the photos, the materials and the client's signature for a
 * while, and none of it had anywhere to be read. An evidence chain nobody can open is a filing
 * cabinet nobody has the key to: it is only worth keeping if somebody can produce it when the
 * argument happens — a variation the client disputes, an insurer asking what the board looked like
 * before the work started.
 *
 * Each picture is served from `/api/photo/<record id>`, which checks this business owns the record
 * before it streams anything. The stored path is never in the page, so there is no address here for
 * anybody to try their luck with.
 *
 * A record with no file is one taken before the store was connected. It keeps its place in the
 * chain and says plainly that the picture stayed on the phone, rather than showing a broken frame.
 */
function FromSite({ records }: {
  records: { id: string; kind: string; who: string; what: string; fileRef: string | null; atTime: string }[];
}) {
  if (!records.length) return null;
  const photos = records.filter(r => r.kind === 'photo');
  const rest = records.filter(r => r.kind !== 'photo');

  return (
    <div className="card-inset lg:col-span-2">
      <p className="label-caps mb-3">From site</p>

      {photos.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map(p => (
            <figure key={p.id} className="grid gap-1">
              {p.fileRef ? (
                <JobPhoto src={photoHref(p.id)} alt={p.what || `Photo on this job by ${p.who}`} />
              ) : (
                <div className="grid aspect-square w-full place-items-center rounded-lg border border-ink/10 bg-cream px-2 text-center text-xs text-ink-light">
                  Picture stayed on the phone
                </div>
              )}
              <figcaption className="text-xs leading-4 text-ink-light">{photoLine(p)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        {rest.map(r => (
          <div key={r.id} className="text-sm leading-5">
            <span className="text-ink-light">{r.atTime.slice(0, 10)}</span> · {recordLabel(r.kind)}
            {r.what ? ` — ${r.what}` : ''} <span className="text-ink-light">· {r.who}</span>
          </div>
        ))}
      </div>
    </div>
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
  /*
    ── Crews on a job ───────────────────────────────────────────────────────────────────────────

    Kris, 25 September: "multi crew is common - split scopes with one supervisor overall". The
    booking model already allowed several people on one job — its uniqueness rule is on person and
    day, not job — so what is added here is the half that was missing: the parts a job is split
    into, and the one name over all of them.
  */
  const scopeRows = await db.select().from(schema.jobScopes)
    .where(eq(schema.jobScopes.tenantId, tenantId))
    .orderBy(schema.jobScopes.position);
  const scopes = scopeRows.map(r => ({
    id: r.id, jobId: r.jobId, name: r.name, leadKey: r.leadKey, leadName: r.leadName,
  }));
  const supervised = jobs.map(j => ({
    id: j.id, ref: j.ref, supervisorKey: j.supervisorKey ?? null, supervisorName: j.supervisorName ?? null,
  }));
  const noSupervisor = unheld(supervised, scopes);

  const waiting = jobs.filter(j => j.stage === 'won' || j.stage === 'scheduled');
  const target = waiting.find(j => j.id === book) ?? waiting.find(j => j.stage === 'won') ?? waiting[0] ?? null;
  const unbooked = jobs.filter(j => j.stage === 'won');
  const refOf = (id: string) => jobs.find(j => j.id === id)?.ref ?? 'A job';

  const targetWatch = target ? crewWatch(
    { id: target.id, ref: target.ref, supervisorKey: target.supervisorKey ?? null, supervisorName: target.supervisorName ?? null },
    scopes,
  ) : null;

  return (
    <>
    {noSupervisor.length > 0 && (
      /*
        Above the week, not below it. A job that has been split and never given anybody is a problem
        that only shows itself on the day the scopes disagree — by which time the answer is whoever
        happens to pick up the phone.
      */
      <section className="card mb-4" style={{ background: LIGHT_COLOUR.amber }}>
        <h3 className="font-serif text-lg" style={{ color: LIGHT_INK.amber }}>
          {noSupervisor.length} split {noSupervisor.length === 1 ? 'job has' : 'jobs have'} nobody over the whole of it
        </h3>
        <p className="mt-1 max-w-[74ch] text-[13.5px] leading-[20px]" style={{ color: LIGHT_INK.amber }}>
          {WHY_ONE_SUPERVISOR}
        </p>
        <ul className="mt-3 grid gap-1.5">
          {noSupervisor.map(w => (
            <li key={w.job.id} className="text-[13px]" style={{ color: LIGHT_INK.amber }}>
              <Link href={tabHref('schedule', { book: w.job.id })} className="underline">{w.job.ref}</Link>
              {' — '}{w.scopes.map(sc => sc.name).join(', ')}
            </li>
          ))}
        </ul>
      </section>
    )}

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

    {target && targetWatch && manage && (
      /*
        Splitting the job, on the same screen as booking crew onto it — because splitting a job and
        crewing it are one thought, and a business sent somewhere else to do the second half of one
        thought does the first half and stops.
      */
      <section className="card mt-4">
        <h3 className="font-serif text-lg text-ink">Crews on {target.ref}</h3>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">{crewLine(targetWatch)}</p>

        {targetWatch.scopes.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {targetWatch.scopes.map(sc => (
              <li key={sc.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-cream px-4 py-2.5">
                <span className="text-sm text-ink">{sc.name}</span>
                <span className="text-[13px] text-ink-light">{sc.leadName ?? 'nobody on it yet'}</span>
              </li>
            ))}
          </ul>
        )}

        <form action={addScope} className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
          <input type="hidden" name="jobId" value={target.id} />
          <input className="input" name="name" placeholder="Switchboard" aria-label="What part of the job" required />
          <select className="input" name="leadName" aria-label="Who runs this part">
            <option value="">Who runs it</option>
            {crew.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
          </select>
          <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Split it</SubmitButton>
        </form>

        {/*
          A separate form on purpose. A supervisor is not a property of a scope — that is the
          confusion this whole thing turns on — and one form asking for both would invite somebody
          to name a different supervisor with every part they added.
        */}
        <form action={setSupervisor} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="jobId" value={target.id} />
          <select className="input" name="supervisorName"
            defaultValue={target.supervisorName ?? ''} aria-label="Who is over the whole job">
            <option value="">Over the whole job…</option>
            {crew.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
          </select>
          <SubmitButton className="btn-secondary shrink-0" pending="Saving…">
            {target.supervisorName ? 'Change who carries it' : 'Put somebody over it'}
          </SubmitButton>
        </form>
      </section>
    )}
    </>
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
  /*
    SiteVIP's half of payroll, in four steps on one screen — timesheet, reconcile, approve, send.
    Kris, 25 September: the basics only (who, which job, where, when, breaks, travel, allowances);
    SiteVIP never works out tax, super or payslips. See lib/timesheets.

    The week shown for booking is Monday to Friday; a pay week is Monday to Sunday, so reconcile,
    approve and send read all seven days.
  */
  const days = workWeek(/^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const monday = days[0];
  const keys = crew.map(c => c.key);
  const [mine, business, run, connected] = await Promise.all([
    weekFor(tenantId, monday, keys),
    weekFor(tenantId, monday),
    payRunFor(tenantId, monday),
    angusConnected(tenantId),
  ]);
  const entries = mine.entries;
  const live = jobs.filter(j => !['paid'].includes(j.stage));
  const send = maySendWeek(business.entries, run?.exportedAt ?? null);
  const to = destinationFor(connected);
  const flagged = new Set(mine.flags.flatMap(f => f.entryIds));
  const toAdjust = entries.filter(e => !e.approvedAt && flagged.has(e.id));
  const refOf = (id: string | null) => (id ? jobs.find(j => j.id === id)?.ref ?? 'a job' : 'no job');
  const back = `/jobs?tab=time&week=${monday}`;

  return (
    <section className="card">
      <div className="max-w-[64ch]">
        <h2 className="font-serif text-xl text-ink">Timesheets · {days[0] === workWeek(today)[0] ? 'this week' : weekLabel(monday).toLowerCase()}</h2>
        <p className="mt-2 text-sm text-ink-light">
          Who worked, on which job, where and when — from Start and Finish on the phone, or typed in here.
          Reconcile it, approve it, and send it to your payroll system. SiteVIP never works out tax, super
          or payslips; your payroll system does that.
        </p>
        <p className="mt-2 flex gap-3 text-sm">
          <Link href={tabHref('time', { week: shiftWeek(monday, -1) })} className="text-rust-700 hover:underline">← Last week</Link>
          <Link href={tabHref('time', { week: shiftWeek(monday, 1) })} className="text-rust-700 hover:underline">Next week →</Link>
        </p>
      </div>

      {/* ── 1 · The timesheet ─────────────────────────────────────────────────────────────── */}
      {!crew.length ? (
        <p className="mt-4 text-sm text-ink-light">
          Nobody on your part of the chart yet — put people in their roles on the org chart and their time shows here.
        </p>
      ) : (
        <div className="mt-4 grid gap-2" data-timesheet>
          {crew.map(c => {
            const theirs = entries.filter(e => e.personKey === c.key && e.finishedAt);
            const b = billable(theirs.map(e => ({ minutes: e.minutes, billable: Boolean(e.jobId) })));
            const refs = [...new Set(theirs.map(e => refOf(e.jobId)).map(r => (r === 'no job' ? 'Yard only' : r)))];
            const waiting = theirs.some(e => !e.approvedAt);
            const tags = [...new Set(theirs.flatMap(e => parseAllowances(e.allowances)))];
            return (
              <div key={c.key} className="grid grid-cols-[minmax(150px,1.4fr)_repeat(3,minmax(80px,1fr))_auto] items-center gap-3 rounded-2xl bg-cream px-4 py-3 text-sm">
                <span className="grid gap-0.5"><strong>{c.name}</strong><span className="text-xs text-ink-light">{c.roleTitle}</span></span>
                <span>{theirs.length ? `${b.hours} h` : '—'}</span>
                <span style={b.light === 'pending' ? undefined : { color: pillTone(b.light).color }}>
                  <span className={b.light === 'pending' ? 'text-ink-light' : ''}>{theirs.length ? `${pctLabel(b.share)} billable` : 'No time yet'}</span>
                </span>
                <span className="text-xs text-ink-light">{refs.join(', ') || '—'}{tags.length ? ` · ${tags.map(allowanceLabel).join(', ')}` : ''}</span>
                {theirs.length ? <Pill light={waiting ? 'pending' : 'green'}>{waiting ? 'Waiting' : 'Approved'}</Pill> : <span />}
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
        <form action={recordTime} className="mt-5 grid gap-2 sm:grid-cols-[1.2fr_1.2fr_auto_auto_auto]" data-record-time>
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
          <input className="input" type="number" name="breakMinutes" min={0} max={600} placeholder="Break (min)" aria-label="Break in minutes" />
          <input className="input" type="number" name="travelMinutes" min={0} max={600} placeholder="Travel (min)" aria-label="Travel in minutes" />
          <span className="flex flex-wrap items-center gap-3 text-sm">
            {ALLOWANCES.map(a => (
              <label key={a.key} className="flex items-center gap-1.5"><input type="checkbox" name="allowance" value={a.key} /> {a.label}</label>
            ))}
          </span>
          <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add time</SubmitButton>
        </form>
      )}

      {/* ── 2 · Reconcile ─────────────────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="mt-8" data-reconcile>
          <h3 className="font-serif text-lg text-ink">Reconcile</h3>
          {mine.flags.length ? (
            <ul className="mt-2 grid gap-1.5 text-sm">
              {mine.flags.map((f, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2" data-flag={f.kind}>
                  {/* Never red (the contract's words, and rule 9): held back is amber, worth a look is grey. */}
                  <Pill light={f.blocking ? 'amber' : 'pending'}>{f.blocking ? 'Held back' : 'Is this correct?'}</Pill>
                  <span><b>{f.who}</b>{f.day ? ` · ${f.day}` : ''} — {f.says}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink">Every entry matches a booking, has its break and sits inside an ordinary week.</p>
          )}
          {manage && toAdjust.length > 0 && (
            <div className="mt-3 grid gap-2">
              {toAdjust.map(e => (
                <details key={e.id} className="rounded-xl bg-cream px-4 py-2.5 text-sm" data-adjust={e.id}>
                  <summary className="cursor-pointer">Adjust {e.personName} · {e.day} · {refOf(e.jobId)} · {e.startedAt}–{e.finishedAt ?? 'running'}</summary>
                  <form action={adjustTime} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="entryId" value={e.id} />
                    <input type="hidden" name="week" value={monday} />
                    <input className="input w-28" type="time" name="start" defaultValue={e.startedAt} aria-label="Start" />
                    <input className="input w-28" type="time" name="finish" defaultValue={e.finishedAt ?? ''} required aria-label="Finish" />
                    <input className="input w-28" type="number" name="breakMinutes" min={0} defaultValue={e.breakMinutes} aria-label="Break in minutes" />
                    <input className="input w-28" type="number" name="travelMinutes" min={0} defaultValue={e.travelMinutes} aria-label="Travel in minutes" />
                    {ALLOWANCES.map(a => (
                      <label key={a.key} className="flex items-center gap-1.5">
                        <input type="checkbox" name="allowance" value={a.key} defaultChecked={parseAllowances(e.allowances).includes(a.key)} /> {a.label}
                      </label>
                    ))}
                    <SubmitButton className="btn-secondary px-3 py-1.5 text-xs">Save</SubmitButton>
                  </form>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3 · Approve — the same Claude recommends step as everywhere else ──────────────── */}
      {manage && crew.length > 0 && (
        <div className="mt-8" data-approve>
          <h3 className="mb-2 font-serif text-lg text-ink">Approve</h3>
          <Recommends topic={approveTopic(monday)} back={back} />
        </div>
      )}

      {/* ── 4 · Send ──────────────────────────────────────────────────────────────────────── */}
      {manage && (
        <div className="mt-8" data-send={to}>
          <h3 className="font-serif text-lg text-ink">Send for processing</h3>
          <p className="mt-1 text-sm text-ink-light">
            {run?.exportedAt
              ? sentLine(run.sentTo, run.exportedAt)
              : to === 'angus_shield'
                ? 'Connected to Angus Shield: approved hours go to its pay run as you approve them. No export step.'
                : 'The approved week goes to your payroll system as a file it imports: person, date, job, site, start, finish, break, travel, paid hours and allowances.'}
          </p>
          {send.ok && to === 'export' ? (
            <form action="/jobs/timesheet-export" method="post" className="mt-2">
              <input type="hidden" name="week" value={monday} />
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                Send to your payroll system
              </button>
            </form>
          ) : (
            !run?.exportedAt && to === 'export' && <p className="mt-1 text-sm text-ink">{send.why}</p>
          )}
          {run?.exportedAt && run.sentTo !== 'angus_shield' && (
            <a href={`/jobs/timesheet-export?week=${monday}`} className="mt-2 inline-block text-sm text-rust-700 hover:underline">Download the file again</a>
          )}
        </div>
      )}

      {/* Did you know — Angus Shield for the processing side. Never instead of the path above. */}
      {manage && <div className="mt-8"><SwitchCards areas={['payroll']} back={back} /></div>}
    </section>
  );
}

/* ══ Catalogue ════════════════════════════════════════════════════════════════════════════════════ */

function Catalogue({ items, kits, kitRows, rates, q, skipped, rises, rose, manage, today, only }: {
  items: (typeof schema.catalogueItems.$inferSelect)[]; kits: Kit[]; kitRows: (typeof schema.kits.$inferSelect)[];
  rates: LabourRate[]; q: string; skipped: string; rises: string; rose: string; manage: boolean; today: string;
  /**
   * Which half of this screen to show.
   *
   * Design 17 splits what was one Catalogue tab into two: **Materials** (the items, the supplier
   * price files, the labour rates) and **Pre-builds** (the kits, and the job pack a kit produces).
   * They were always two jobs sharing a screen — a storeman keeping prices right, and an estimator
   * building a quote — so they are two doors onto one set of rows rather than two copies of it.
   */
  only?: 'kits' | 'items';
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

      {/*
        The import always replaced the costs quietly. A jump of more than 5% is the one worth
        stopping on: every quote already out with that item on it is now wrong, and nobody finds
        that out by reading a catalogue.
      */}
      {rises && (
        <p role="alert" className="rounded-lg p-4 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 14%, transparent)` }}>
          <b>{rises} {rises === '1' ? 'price went' : 'prices went'} up by more than 5%{rose ? `: ${rose}` : ''}.</b>{' '}
          Any quote already out carrying those is now wrong — worth checking before they are accepted.
        </p>
      )}

      {only !== 'kits' && (
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
      )}

      {/*
        ── When the list itself is the problem ──────────────────────────────────────────────────

        Kris: "the catalogue must always be streamlined and the system must alert the business if
        speeds slow due to excess items". Nobody decides to let a catalogue reach nine thousand
        lines — somebody imports a supplier's whole file and every search is slower from then on,
        quoting takes longer, and the tech on site stops recording materials because finding them
        is a nuisance.

        Shown only when the list is BOTH big and mostly unused. A big list that is all in use is a
        busy business; a small dead one is a business that has not started. And it shows nothing at
        all when there is nothing to say — an alert that is always on the page is furniture.
      */}
      {only !== 'kits' && catalogueAlert(catalogueHealth(items, today)) && (
        <p className="rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 12%, transparent)` }}>
          <b>This list is slowing everybody down.</b>{' '}
          {catalogueAlert(catalogueHealth(items, today))}{' '}
          {KEEP_IT_SHORT.join(' ')}
        </p>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-ink">{only === 'kits' ? 'Pre-builds' : 'Materials'}</h2>
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

        {only !== 'items' && (
        <>
        <p className="label-caps mb-2 mt-7">Kits · pre-built bundles you quote in one line</p>
        {kits.length ? (
          <div className="grid gap-1.5">
            {kits.map(k => {
              const e = expandKit(k, plain);
              const row = kitRows.find(r => r.id === k.id);
              const rate = rates.find(r => r.id === row?.labourRateId) ?? rates[0];
              return (
                <div key={k.id} className="rounded-xl bg-cream px-3.5 py-2.5 text-sm">
                  <div className="flex flex-wrap justify-between gap-2.5">
                    <strong>{k.name}</strong>
                    <span>
                      {money(e.costCents)} materials + {k.labourHours} h labour{rate && k.labourHours ? ` at ${rate.name}` : ''}
                      {e.missing.length ? <span className="ml-2"><Pill light="amber">{e.missing.length} part{e.missing.length === 1 ? '' : 's'} no longer in the catalogue</Pill></span> : null}
                    </span>
                  </div>

                  {/*
                    ── What turns a kit into a pre-build ───────────────────────────────────────

                    A kit prices the work. A pre-build also tells the crew how to do it: which
                    SWMS applies, what to check before leaving, and what to load. The van list is
                    not stored — it IS the kit's components, and keeping a second copy would mean
                    two lists that disagree the first time somebody edits the kit.
                  */}
                  {(() => {
                    const pack = packState({ swms: row?.swms ?? null, checklist: row?.checklist ?? null, components: k.components });
                    const checks = parseChecklist(row?.checklist);
                    const load = vanList(k.components, plain);
                    return (
                      <div className="mt-2 border-t border-cream-border pt-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <Pill light={pack.ready ? 'green' : 'amber'}>
                            {pack.ready ? 'Pre-build — job pack ready' : 'Kit — not a pre-build yet'}
                          </Pill>
                          {!pack.ready && (
                            <span className="text-xs text-ink-light">Still needs {pack.missing.join(', ')}.</span>
                          )}
                        </span>
                        {(row?.swms || checks.length > 0 || load.length > 0) && (
                          <div className="mt-2 grid gap-1 text-xs text-ink-light sm:grid-cols-3">
                            <span><b className="text-ink">SWMS:</b> {row?.swms || 'none named'}</span>
                            <span><b className="text-ink">Before leaving:</b> {checks.length ? `${checks.length} checks` : 'none set'}</span>
                            <span><b className="text-ink">On the van:</b> {load.length ? load.map(l => `${l.qty}× ${l.name}`).join(', ') : 'nothing listed'}</span>
                          </div>
                        )}
                        {manage && (
                          <form action={setKitPack} className="mt-2 grid gap-1.5 sm:grid-cols-4">
                            <input type="hidden" name="id" value={k.id} />
                            <input name="swms" defaultValue={row?.swms ?? ''} placeholder="Which SWMS applies" className="input py-1.5 text-xs" />
                            <input name="checklist" defaultValue={checks.join('\n')} placeholder="What to check before leaving, one per line" className="input py-1.5 text-xs sm:col-span-2" />
                            <SubmitButton className="btn-secondary px-3 py-1 text-xs">Save the pack</SubmitButton>
                          </form>
                        )}
                      </div>
                    );
                  })()}
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

        </>
        )}

        {only !== 'kits' && (<>
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
        </>)}
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

/**
 * Stock & buying — the purchase orders, and the two things still to come.
 *
 * The tab used to be three headings with nothing behind them. Purchase orders is now real; van
 * stock and the warehouse keep their honest "not set up yet" notes rather than being dressed up.
 */
function Stock({ orders, jobs, manage, today, levels, items }: {
  orders: (typeof schema.purchaseOrders.$inferSelect)[];
  jobs: JobRow[];
  manage: boolean;
  today: string;
  levels: (typeof schema.stockLevels.$inferSelect)[];
  items: CatalogueItem[];
}) {
  const rows: OrderRow[] = orders.map(o => ({
    id: o.id, ref: o.ref, supplier: o.supplier, state: o.state,
    totalCents: o.totalCents, billTotalCents: o.billTotalCents, expectedAt: o.expectedAt,
    jobRef: jobs.find(j => j.id === o.jobId)?.ref ?? null,
  }));
  const stats = purchasingStats(rows, today);
  const sorted = byAttention(rows, today);
  const cash = (c: number) => `$${(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-6">
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Purchase orders</h2>
          <p className="text-sm text-ink-light">{purchasingLine(stats)}</p>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Raised against the job the materials are for, then checked against the supplier’s bill when
          it arrives. A bill higher than its order holds payment — a price rise on a job quoted at
          the old price comes straight off the margin.
        </p>

        {sorted.length === 0 && (
          <p className="mt-4 text-sm text-ink-light">No orders yet. Raise the first one below.</p>
        )}

        <ul className="mt-4 grid gap-2">
          {sorted.map(o => {
            const full = orders.find(x => x.id === o.id)!;
            const verdict = match(o.totalCents, o.billTotalCents);
            const late = isLate(o, today);
            const light: Light = verdict.holds ? 'red' : late ? 'amber' : o.state === 'closed' ? 'green' : 'pending';
            return (
              <li key={o.id} className="rounded-2xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {o.ref} · {o.supplier}
                      {o.jobRef && <span className="text-ink-light"> · {o.jobRef}</span>}
                    </p>
                    <p className="text-sm text-ink-light">
                      {[full.what, `Ordered ${cash(o.totalCents)}`,
                        o.billTotalCents !== null ? `billed ${cash(o.billTotalCents)}` : null,
                        o.expectedAt ? `due ${o.expectedAt}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {verdict.state !== 'no_bill' && (
                      <p className="mt-1 text-sm" style={{ color: verdict.holds ? LIGHT_INK.red : LIGHT_INK.green }}>
                        {verdict.says}
                      </p>
                    )}
                    {late && <p className="mt-1 text-sm" style={{ color: LIGHT_INK.amber }}>Due {o.expectedAt} and not arrived.</p>}
                    {full.note && <p className="mt-1 text-sm text-ink-light">Accepted: {full.note}</p>}
                  </div>
                  <Pill light={light}>{orderStateLabel(o.state)}</Pill>
                </div>

                {manage && o.state !== 'closed' && (
                  <div className="mt-3 grid gap-2 border-t border-cream-border pt-3">
                    {o.state === 'sent' && (
                      <form action={orderArrived}>
                        <input type="hidden" name="id" value={o.id} />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Materials arrived</SubmitButton>
                      </form>
                    )}
                    {o.billTotalCents === null ? (
                      <form action={recordBill} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={o.id} />
                        <input name="billRef" placeholder="Their invoice number" className="input py-1.5 text-sm" />
                        <input name="billTotal" required placeholder="What they billed" className="input w-40 py-1.5 text-sm" />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Record the bill</SubmitButton>
                      </form>
                    ) : (
                      <form action={acceptBill} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={o.id} />
                        {verdict.holds && (
                          <input name="note" required placeholder="Why the extra is accepted" className="input flex-1 py-1.5 text-sm" />
                        )}
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">
                          {verdict.holds ? 'Accept and close' : 'Close it'}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {manage && (
          <form action={raiseOrder} className="mt-5 grid gap-2 border-t border-cream-border pt-5 sm:grid-cols-5">
            <input name="supplier" required placeholder="Supplier" className="input" />
            <input name="what" placeholder="What you ordered" className="input sm:col-span-2" />
            <input name="total" required placeholder="Amount" className="input" />
            <select name="jobId" defaultValue="" className="input">
              <option value="">No job</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.ref} · {j.title}</option>)}
            </select>
            <label className="text-xs text-ink-light sm:col-span-2">
              Expected
              <input type="date" name="expectedAt" className="input mt-1 w-full py-1.5 text-sm" />
            </label>
            <div className="sm:col-span-5">
              <SubmitButton className="btn-secondary px-5 py-2">Raise the order</SubmitButton>
            </div>
          </form>
        )}
      </section>

      <VanAndYard levels={levels} items={items} manage={manage} today={today} />
    </div>
  );
}

/**
 * Van stock and the yard, and the reorder list that falls out of them.
 *
 * Two headings that said "not set up yet" became one register, because the reorder list IS the
 * feature. SPEC asks for the only two numbers it needs — how many are here, and how few is too few
 * — and works out the rest.
 */
function VanAndYard({ levels, items, manage, today }: {
  levels: (typeof schema.stockLevels.$inferSelect)[];
  items: CatalogueItem[];
  manage: boolean;
  today: string;
}) {
  const stats = stockStats(levels, today);
  const sorted = byShortage(levels, today);
  const short = reorderList(levels);
  const nameOf = (id: string) => items.find(i => i.id === id)?.name ?? 'An item';

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Van stock and the yard</h2>
        <p className="text-sm text-ink-light">{stockLine(stats)}</p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">
        How many are here, and how few is too few. Everything else is worked out — including the
        reorder list, and the order it turns into.
      </p>

      {items.length === 0 && (
        <p className="mt-4 text-sm text-ink-light">
          Stock is counted against the Catalogue. Add what the vans carry there first.
        </p>
      )}

      {short.length > 0 && (
        <div className="mt-4 rounded-2xl bg-cream px-4 py-3">
          <p className="font-semibold text-ink">To reorder</p>
          <ul className="mt-1 grid gap-1 text-sm text-ink-light">
            {short.map(l => (
              <li key={`${l.itemId}-${l.place}`}>
                <b className="text-ink">{l.buy} × {nameOf(l.itemId)}</b> · {l.place} — {l.qty} on hand, minimum {l.minQty}
              </li>
            ))}
          </ul>
          {manage && (
            <form action={orderTheShortfall} className="mt-3 flex flex-wrap items-end gap-2">
              <input name="supplier" placeholder="Supplier" className="input py-1.5 text-sm" />
              <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Raise the order</SubmitButton>
            </form>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table-clean min-w-[560px]">
            <thead><tr><th>Item</th><th>Where</th><th>On hand</th><th>Minimum</th><th>State</th></tr></thead>
            <tbody>
              {sorted.map(l => {
                const state = stockStateOf(l, today);
                return (
                  <tr key={l.id}>
                    <td><strong>{nameOf(l.itemId)}</strong></td>
                    <td>{l.place}</td>
                    <td>{l.qty}</td>
                    <td>{l.minQty || '—'}</td>
                    <td>
                      <Pill light={state === 'out' ? 'red' : state === 'low' ? 'amber' : state === 'ok' ? 'green' : 'pending'}>
                        {STOCK_LABEL[state]}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manage && items.length > 0 && (
        <form action={setStock} className="mt-5 grid gap-2 border-t border-cream-border pt-5 sm:grid-cols-5">
          <select name="itemId" required defaultValue="" className="input sm:col-span-2">
            <option value="" disabled>Which item</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input name="place" list="stock-places" defaultValue="Yard" placeholder="Where" className="input" />
          <input name="qty" required placeholder="On hand" className="input" />
          <input name="minQty" placeholder="Minimum" className="input" />
          <datalist id="stock-places">
            <option value="Yard" />
            {placesIn(levels).map(p => <option key={p} value={p} />)}
          </datalist>
          <div className="sm:col-span-5">
            <SubmitButton className="btn-secondary px-5 py-2">Count it</SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Invoices & claims — variations, progress claims with their retention, and what is owed.
 *
 * Three empty headings became one list, because they are one fact: a sum against this job that
 * somebody owes or will owe. What differs is the rule before it can be sent, and that lives in
 * lib/billing-job.
 */
function Billing({ bills, jobs, manage, now }: {
  bills: (typeof schema.jobBills.$inferSelect)[];
  jobs: JobRow[];
  manage: boolean;
  now: Date;
}) {
  const stats = moneyStats(bills, now);
  const refOf = (jobId: string) => jobs.find(j => j.id === jobId)?.ref ?? '';

  return (
    <div className="grid gap-6">
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Invoices, claims and variations</h2>
          <p className="text-sm text-ink-light">{moneyLine(stats)}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Owed to you', value: moneyLabel(stats.owedCents), tone: stats.overdueCents > 0 ? LIGHT_COLOUR.amber : LIGHT_COLOUR.green },
            { label: 'Held in retention', value: moneyLabel(stats.retentionCents), tone: LIGHT_COLOUR.pending },
            { label: 'Need chasing', value: String(stats.chasesDue), tone: stats.chasesDue ? LIGHT_COLOUR.red : LIGHT_COLOUR.green },
          ].map(x => (
            <div key={x.label} className="rounded-2xl bg-cream px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-ink-light">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.tone }} />{x.label}
              </span>
              <p className="font-serif text-2xl text-ink">{x.value}</p>
            </div>
          ))}
        </div>

        {bills.length === 0 && (
          <p className="mt-4 text-sm text-ink-light">Nothing raised yet. Add the first one below.</p>
        )}

        <ul className="mt-4 grid gap-2">
          {bills.map(b => {
            const c = chase(b, now);
            const send = maySend(b);
            const light: Light = b.state === 'paid' ? 'green'
              : c.due !== null ? 'red'
                : b.state === 'draft' && b.kind === 'variation' ? 'amber' : 'pending';
            return (
              <li key={b.id} className="rounded-2xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {billKindLabel(b.kind).replace(/s$/, '')} · {b.what}
                      {refOf(b.jobId) && <span className="text-ink-light"> · {refOf(b.jobId)}</span>}
                    </p>
                    <p className="text-sm text-ink-light">
                      {[moneyLabel(b.amountCents),
                        b.retentionCents > 0 ? `${moneyLabel(b.retentionCents)} retention${b.releasedAt ? ' (released)' : ' held'}` : null,
                        b.agreedBy ? `agreed by ${b.agreedBy}` : null,
                        c.says || null].filter(Boolean).join(' · ')}
                    </p>
                    {!send.ok && send.why && b.state === 'draft' && (
                      <p className="mt-1 text-sm" style={{ color: LIGHT_INK.amber }}>{send.why}</p>
                    )}
                  </div>
                  <Pill light={light}>{BILL_STATE_LABEL[(isBillState(b.state) ? b.state : 'draft')]}</Pill>
                </div>

                {manage && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-cream-border pt-3">
                    {b.kind === 'variation' && b.state === 'draft' && (
                      <form action={agreeVariation} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={b.id} />
                        <input name="agreedBy" required placeholder="Who agreed it, on site" className="input py-1.5 text-sm" />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">They agreed it</SubmitButton>
                      </form>
                    )}
                    {send.ok && (
                      <form action={sendBill}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Send it</SubmitButton>
                      </form>
                    )}
                    {c.due !== null && (
                      <form action={sendReminder}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Send the {c.due}-day reminder</SubmitButton>
                      </form>
                    )}
                    {b.state === 'sent' && (
                      <form action={markPaid}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Paid</SubmitButton>
                      </form>
                    )}
                    {b.retentionCents > 0 && !b.releasedAt && (
                      <form action={releaseRetention}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Release the retention</SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {manage && jobs.length > 0 && (
          <form action={raiseBill} className="mt-5 grid gap-2 border-t border-cream-border pt-5 sm:grid-cols-5">
            <select name="kind" defaultValue="invoice" className="input">
              {BILL_KINDS.map(k => <option key={k.key} value={k.key}>{k.label.replace(/s$/, '')}</option>)}
            </select>
            <select name="jobId" required defaultValue="" className="input">
              <option value="" disabled>Which job</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.ref} · {j.title}</option>)}
            </select>
            <input name="what" required placeholder="What it is for" className="input" />
            <input name="amount" required placeholder="Amount" className="input" />
            <input name="retentionPct" placeholder="Retention % (claims)" className="input" />
            <div className="sm:col-span-5">
              <SubmitButton className="btn-secondary px-5 py-2">Raise it</SubmitButton>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/**
 * Service & assets — maintenance agreements and tested items, on one register.
 *
 * Three empty headings became one list, because "next due" is the whole feature. The register is
 * not the point; the date arriving before somebody notices is.
 */
function Recurring({ rows, manage, today }: {
  rows: (typeof schema.recurringWork.$inferSelect)[];
  manage: boolean;
  today: string;
}) {
  const live = rows.filter(r => r.active);
  const stats = recurStats(live, today);
  const sorted = byDue(live, today);

  return (
    <div className="grid gap-6">
      {RECUR_KINDS.map(k => {
        const mine = sorted.filter(r => r.kind === k.key);
        return (
          <section key={k.key} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">{k.label}</h2>
              <p className="text-sm text-ink-light">{recurLine(recurStats(mine, today))}</p>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-ink-light">{k.blurb}</p>

            {mine.length === 0 && (
              <p className="mt-4 text-sm text-ink-light">Nothing on the register yet.</p>
            )}

            <ul className="mt-4 grid gap-2">
              {mine.map(r => {
                const state = dueStateOf(r, today);
                const light: Light = state === 'failed' || state === 'overdue' ? 'red'
                  : state === 'due_soon' || state === 'never_done' ? 'amber' : 'green';
                return (
                  <li key={r.id} className="rounded-2xl bg-cream px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {r.title}{r.forWhom && <span className="text-ink-light"> · {r.forWhom}</span>}
                        </p>
                        <p className="text-sm text-ink-light">
                          {dueLine(r, today)} Every {r.everyMonths} months.
                          {r.bookedJobId ? ' Job raised.' : ''}
                        </p>
                      </div>
                      <Pill light={light}>{DUE_LABEL[state]}</Pill>
                    </div>

                    {manage && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-cream-border pt-3">
                        {needsBooking(r, today) && (
                          <form action={bookRecurring}>
                            <input type="hidden" name="id" value={r.id} />
                            <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Raise the job</SubmitButton>
                          </form>
                        )}
                        <form action={recordDone} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="date" name="doneAt" defaultValue={today} className="input py-1.5 text-sm" aria-label="Done on" />
                          {r.kind === 'asset' && (
                            <select name="result" defaultValue="pass" className="input py-1.5 text-sm" aria-label="Result">
                              <option value="pass">Passed</option>
                              <option value="fail">Failed</option>
                            </select>
                          )}
                          <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Done</SubmitButton>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {manage && (
              <form action={addRecurring} className="mt-5 grid gap-2 border-t border-cream-border pt-5 sm:grid-cols-5">
                <input type="hidden" name="kind" value={k.key} />
                <input name="title" required placeholder={k.key === 'asset' ? 'What the item is' : 'What the agreement covers'} className="input sm:col-span-2" />
                <input name="forWhom" placeholder={k.key === 'asset' ? 'Where it lives' : 'Which client'} className="input" />
                <label className="text-xs text-ink-light">
                  Every (months)
                  <input name="everyMonths" defaultValue={12} className="input mt-1 w-full py-1.5 text-sm" />
                </label>
                <label className="text-xs text-ink-light">
                  Last done
                  <input type="date" name="lastDoneAt" className="input mt-1 w-full py-1.5 text-sm" />
                </label>
                <div className="sm:col-span-5">
                  <SubmitButton className="btn-secondary px-5 py-2">Add it</SubmitButton>
                </div>
              </form>
            )}
          </section>
        );
      })}
      <p className="text-sm text-ink-light">
        Total across both: {stats.overdue} overdue, {stats.failed} failed, {stats.toBook} to book.
      </p>
    </div>
  );
}

/**
 * Leads — where the work came from, and what is still waiting for a quote.
 *
 * Built entirely from the Jobs board, because a lead IS an enquiry. Two columns on the job it
 * already is, rather than a second list that drifts from the first.
 */
function Leads({ jobs, manage, now }: { jobs: JobRow[]; manage: boolean; now: Date }) {
  const leads: Lead[] = jobs.map(j => ({
    id: j.id, ref: j.ref, title: j.title, client: j.client, stage: j.stage,
    source: j.source, createdAt: j.createdAt, quotedAt: j.quotedAt, valueCents: j.valueCents,
  }));
  const stats = leadStats(leads, now);
  const waiting = waitingForQuote(leads, now);
  const sources = bySource(leads);

  return (
    <div className="grid gap-6">
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Waiting for a quote</h2>
          <p className="text-sm text-ink-light">{leadLine(stats)}</p>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Oldest first. Work quoted on day four is usually work somebody else has already won, so the
          number that matters is how long the oldest one has been sitting — not how many there are.
        </p>

        {waiting.length === 0 && (
          <p className="mt-4 text-sm text-ink-light">Nothing waiting. Every enquiry has been quoted.</p>
        )}

        <ul className="mt-4 grid gap-2">
          {waiting.map(w => (
            <li key={w.lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
              <span className="min-w-0">
                <span className="font-semibold text-ink">{w.lead.ref} · {w.lead.title}</span>
                <span className="block text-sm text-ink-light">
                  {w.lead.client} · {w.says}{w.lead.source ? ` · ${w.lead.source}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Pill light={w.light}>{w.days === 0 ? 'Today' : `${w.days}d`}</Pill>
                {manage && (
                  <>
                    {!w.lead.source && (
                      <form action={setSource} className="flex items-center gap-1.5">
                        <input type="hidden" name="jobId" value={w.lead.id} />
                        <select name="source" defaultValue="" className="input py-1 text-xs" aria-label="Where it came from">
                          <option value="" disabled>Where from?</option>
                          {SOURCES.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                        <SubmitButton className="btn-secondary px-3 py-1 text-xs">Save</SubmitButton>
                      </form>
                    )}
                    <form action={markQuoted}>
                      <input type="hidden" name="jobId" value={w.lead.id} />
                      <SubmitButton className="btn-secondary px-3 py-1 text-xs">Quote sent</SubmitButton>
                    </form>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Where the work comes from</h2>
          <p className="text-sm text-ink-light">
            {stats.speed === null
              ? 'Speed to quote shows once something has been quoted.'
              : `Quoting in ${stats.speed} days on average, against a ${QUOTE_TARGET_DAYS}-day target.`}
          </p>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Sorted by what was won, not by what came in — the useful question is which source is worth
          answering first on a Monday.
        </p>
        {sources.length === 0 ? (
          <p className="mt-4 text-sm text-ink-light">No enquiries yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="table-clean min-w-[520px]">
              <thead><tr><th>Source</th><th>Came in</th><th>Quoted</th><th>Won</th><th>Value won</th></tr></thead>
              <tbody>
                {sources.map(r => (
                  <tr key={r.source}>
                    <td><strong>{r.source}</strong></td>
                    <td>{r.came}</td><td>{r.quoted}</td><td>{r.won}</td>
                    <td>{r.wonCents ? money(r.wonCents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ══ Design 17 · Get paid and keep them ═══════════════════════════════════════════════════════════ */

/**
 * Work in progress — every open job's work against its billing.
 *
 * The rules are in lib/wip and tested there; this is the screen. It leads on whatever is costing
 * money rather than on the biggest number, and a job whose margin has gone asks for a VARIATION
 * rather than a claim — an invoice does not fix a job that has stopped making money.
 */
function WorkInProgress({ jobs, bills, manage, tabHref }: {
  jobs: Costed[];
  bills: (typeof schema.jobBills.$inferSelect)[];
  manage: boolean;
  tabHref: (k: string, e?: Record<string, string>) => string;
}) {
  /*
    Only jobs that are actually running. An enquiry has nothing to be under-billed on, and a paid
    job's gap is history — putting either on this screen makes the list longer and the answer worse.
  */
  const open = jobs.filter(j => ['won', 'scheduled', 'onsite', 'invoiced'].includes(j.stage));

  const rows = byWipAttention(open.map(j => {
    const billed = bills.filter(b => b.jobId === j.id && (b.state === 'sent' || b.state === 'paid'))
      .reduce((t, b) => t + b.amountCents, 0);
    return wipRow({
      id: j.id,
      ref: j.ref,
      title: j.title,
      // What the job was won at. `valueCents` is the quoted value the board already costs against,
      // so WIP and the margin on the board can never disagree about the same job.
      quotedCents: j.valueCents,
      costCents: j.labourCents + (j.materialsCents ?? 0),
      billedCents: billed,
      done: progressOf(j),
    });
  }));
  const stats = wipStats(rows);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Work in progress</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Every open job: what has been done, what has been billed, and whether it is still making
          money. The gap between the first two is where a trade business&rsquo;s money sits, and
          nobody keeps it in their head.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{wipLine(stats)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Still to deliver', value: wipMoney(stats.toDeliverCents), note: 'on open jobs', light: 'pending' as Light },
            { label: 'Under-billed', value: wipMoney(stats.underBilledCents), note: stats.underBilledCents ? 'done, not yet billed' : 'all billed', light: (stats.underBilledCents ? 'amber' : 'green') as Light },
            { label: 'Billed ahead', value: wipMoney(stats.aheadCents), note: 'owed back in work', light: 'pending' as Light },
            { label: 'Margin at risk', value: String(stats.atRisk), note: stats.atRisk ? 'raise the variation now' : 'none', light: (stats.atRisk ? 'red' : 'green') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl text-ink">{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
          No jobs are running yet. This fills itself from the board — nothing to type here.
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map(r => (
            <section key={r.id} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm text-ink">{r.ref} · {r.title}</strong>
                <Pill light={r.state === 'at_risk' ? 'red' : r.state === 'under_billed' ? 'amber' : 'green'}>
                  {WIP_LABEL[r.state]}
                </Pill>
              </div>

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-cream">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(Math.max(0, Math.min(1, r.done)) * 100)}%`,
                    background: LIGHT_COLOUR[r.state === 'at_risk' ? 'red' : r.state === 'under_billed' ? 'amber' : 'green'],
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                {[
                  ['Quoted', wipMoney(r.quotedCents)],
                  ['Done', `${Math.round(r.done * 100)}%`],
                  ['Cost so far', wipMoney(r.costCents)],
                  ['Billed', wipMoney(r.billedCents)],
                  ['Forecast margin', `${Math.round(r.margin * 100)}%`],
                ].map(([label, value]) => (
                  <span key={label} className="grid gap-0.5">
                    <span className="text-xs text-ink-light">{label}</span>
                    <strong className="text-sm text-ink">{value}</strong>
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="flex-[1_1_280px] text-sm text-ink-light">{r.advice}</span>
                {manage && r.action && (
                  <Link href={tabHref('billing', { job: r.id })} className="btn-secondary shrink-0 text-sm">
                    {r.action}
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How far through a job is.
 *
 * From the stage, which is coarse and honest: a job on site is further along than a job just won.
 * The precise version — hours against the hours the quote was built from — needs the quote's own
 * labour hours carried onto the job, and SPEC does not hold them yet. A made-up percentage would
 * make every number on this screen look exact and be wrong, so it stays coarse until it can be
 * better.
 */
function progressOf(j: Costed): number {
  return j.stage === 'invoiced' ? 1 : j.stage === 'onsite' ? 0.6 : j.stage === 'scheduled' ? 0.2 : 0.05;
}

/**
 * Thirteen weeks of money in and out, and the week it runs short.
 *
 * SPEC does not become the accounting system: the balance and the bills come from the business's
 * own, which stays the financial system. What SPEC adds is the half only it knows — the schedule,
 * the claims earned and not raised, the supplier bills it is holding — and that combination is the
 * whole point. An accountant can say what happened; only the schedule says what is about to.
 */
async function CashFlow({ tenantId, bills, orders, today }: {
  tenantId: string;
  bills: (typeof schema.jobBills.$inferSelect)[];
  orders: (typeof schema.purchaseOrders.$inferSelect)[];
  today: string;
}) {
  const [tenant] = await db.select({ buffer: schema.tenants.cashBufferCents })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const buffer = tenant?.buffer ?? DEFAULT_BUFFER_CENTS;

  const owedToYou = bills.filter(b => b.state === 'sent')
    .reduce((t, b) => t + b.amountCents - b.retentionCents, 0);
  const youOwe = orders.filter(o => o.state === 'billed' || o.state === 'received')
    .reduce((t, o) => t + (o.billTotalCents ?? o.totalCents), 0);

  /*
    Thirteen weeks built from what SPEC actually holds: invoices land in the week they are due,
    supplier bills in the week they were expected. Nothing is invented — a week with nothing in it
    shows nothing rather than a guess, and the screen says where the numbers came from.
  */
  const monday = mondayOf(today);
  const weeks: Week[] = Array.from({ length: 13 }, (_, i) => {
    const startsAt = addDays(monday, i * 7);
    const ends = addDays(startsAt, 7);
    const inCents = bills
      .filter(b => b.state === 'sent' && b.sentAt && due(b.sentAt) >= startsAt && due(b.sentAt) < ends)
      .reduce((t, b) => t + b.amountCents - b.retentionCents, 0);
    const outCents = orders
      .filter(o => o.expectedAt && o.expectedAt >= startsAt && o.expectedAt < ends)
      .reduce((t, o) => t + (o.billTotalCents ?? o.totalCents), 0);
    return { n: i + 1, startsAt, inCents, outCents };
  });

  const opening = 0;
  const balances = runForward(opening, weeks, buffer);
  const stats = cashStats(opening, balances, owedToYou, youOwe);
  const tallest = Math.max(1, ...balances.map(w => Math.max(w.inCents, w.outCents)));

  /* The two levers a trade business actually has in a fortnight, with what each is worth. */
  const fixes = [
    owedToYou > 0 && { says: `Collect the ${cashLabel(owedToYou)} already invoiced.`, worthCents: owedToYou, where: '/jobs?tab=billing' },
  ].filter(Boolean) as { says: string; worthCents: number; where: string }[];

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Cash flow</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Thirteen weeks — a quarter. Far enough out that something can still be done about it, near
          enough that the numbers are real work rather than a forecast somebody invented.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{cashLine(stats, buffer)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Owed to you', value: cashLabel(owedToYou), note: 'invoices sent, not paid', light: (owedToYou ? 'amber' : 'green') as Light },
            { label: 'You owe', value: cashLabel(youOwe), note: 'supplier bills in hand', light: 'pending' as Light },
            { label: 'Lowest week', value: cashLabel(stats.lowestCents), note: stats.lowestWeek ? `week ${stats.lowestWeek} of 13` : 'nothing scheduled', light: (stats.goesShort ? 'red' : 'green') as Light },
            { label: 'Your buffer', value: cashLabel(buffer), note: 'set for this business', light: 'pending' as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl text-ink" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="label-caps mb-3">Thirteen weeks</p>
        <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
          {balances.map(w => (
            <div key={w.n} className="grid min-w-[44px] justify-items-center gap-1">
              <div className="flex h-[130px] items-end gap-0.5">
                <div className="w-3.5 rounded-t" style={{ height: `${Math.round(w.inCents / tallest * 130)}px`, background: LIGHT_COLOUR.green }} title={`In ${cashLabel(w.inCents)}`} />
                <div className="w-3.5 rounded-t" style={{ height: `${Math.round(w.outCents / tallest * 130)}px`, background: LIGHT_COLOUR.amber }} title={`Out ${cashLabel(w.outCents)}`} />
              </div>
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                style={w.short ? { background: 'color-mix(in srgb, var(--red) 14%, transparent)', color: LIGHT_INK.red } : undefined}
              >
                {cashLabel(w.balanceCents)}
              </span>
              <span className="text-[11px] text-ink-light">W{w.n}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">{cashAdvice(stats, fixes, buffer)}</p>
        <p className="mt-2 text-xs text-ink-light">
          Money in is what SPEC has invoiced; money out is the supplier bills it is holding. Your
          accounting system stays the financial system — connect it on Connections and the opening
          balance and the rest of the bills come from there.
        </p>
      </section>
    </div>
  );
}

/** Monday of the week a date falls in. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** When an invoice sent on this day is expected in. The usual 30 days, until terms are recorded. */
const due = (sentAt: string) => addDays(sentAt.slice(0, 10), 30);

/**
 * Callbacks and rework — going back to a job that should have been finished.
 *
 * Filed under Compliance rather than Earnings on purpose: going back twice is not a money problem
 * with a money fix, it is work that was not done right, and the fix is a checklist or a
 * conversation. See the note at the top of lib/rework.
 */
function Rework({ rows, jobs, crew, manage, minutes, noAccessRows, noAccessHours }: {
  rows: (typeof schema.callbacks.$inferSelect)[];
  jobs: JobRow[];
  crew: CrewMember[];
  manage: boolean;
  minutes: number;
  noAccessRows: (typeof schema.noAccessVisits.$inferSelect)[];
  noAccessHours: number | null;
}) {
  const refOf = (id: string) => jobs.find(j => j.id === id)?.ref ?? 'Job';
  const calls = rows.map(r => ({
    id: r.id, jobRef: refOf(r.jobId), cause: r.cause, hours: r.minutes / 60,
    costCents: r.costCents, recoveredCents: r.recoveredCents, who: r.who, at: r.createdAt.slice(0, 10),
  }));
  const stats = reworkStats(calls, minutes / 60);
  const found = pattern(calls);
  /*
    Kris, 25 September: "anything re work or call back that isnt paid is a key power meter
    detractor". Revenue here is what has actually been billed, so the share is against money that
    exists rather than against a pipeline.
  */
  const billedCents = jobs
    .filter(j => j.stage === 'invoiced' || j.stage === 'paid')
    .reduce((t, j) => t + (j.valueCents ?? 0), 0);
  const unpaid = unpaidRework(calls, billedCents);

  /*
    No-access sits here rather than in a tab of its own, because it is the same conversation: time
    paid for that earned nothing. A seventh place to look would mean it is never looked at.
  */
  const refFor = (id: string) => jobs.find(j => j.id === id);
  const visits = noAccessRows.map(r => ({
    id: r.id, jobId: r.jobId, jobRef: refFor(r.jobId)?.ref ?? 'A job',
    client: refFor(r.jobId)?.client ?? '', at: r.createdAt, who: r.who, because: r.because,
  }));
  const lockedOut = noAccessCount(visits, noAccessHours);
  const again = repeaters(visits);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Callbacks &amp; rework</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          The cost nobody sees: on a timesheet, going back to a job looks like ordinary work. The
          only way it becomes a number is by being counted on its own. Anything here that never got
          paid for comes off gross profit with nothing on the other side of the entry — which is why
          it moves one of the Power Meter&rsquo;s five heavy hitters rather than a shared measure.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{reworkLine(stats)}</p>
        <p className="mt-1.5 text-sm text-ink">{carriedLine(unpaid, stats.hours)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Rework rate', value: `${Math.round(stats.rate * 1000) / 10}%`, note: `target under ${Math.round(REWORK_TARGET * 100)}%`, light: (stats.overTarget ? 'red' : 'green') as Light },
            { label: 'Callbacks', value: String(stats.callbacks), note: `${Math.round(stats.hours)} hours going back`, light: 'pending' as Light },
            { label: 'Cost', value: reworkMoney(stats.costCents), note: 'labour and materials', light: 'pending' as Light },
            /*
              Not "recovered" — what was NOT. The old tile said how much came back, which reads as
              good news beside a figure that is entirely bad news, and left the number Kris calls
              the detractor as something you had to work out by subtracting.
            */
            { label: 'Never paid for', value: reworkMoney(unpaid.carriedCents), note: 'done twice, earned once', light: (unpaid.carriedCents ? 'red' : 'green') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>

        {unpaid.byDefault.length > 0 && (
          /*
            The sharpest thing on the screen, and it was invisible until now: these are not mistakes
            about who was at fault — the fault was recorded correctly. They are claims and invoices
            that were never raised, which means the business already decided it was owed this money
            and then did not ask for it. Unlike the rest of rework, this half can be got back.
          */
          <section className="mt-4 rounded-2xl p-5" style={{ background: LIGHT_COLOUR.amber }}>
            <p className="font-serif text-[17px]" style={{ color: LIGHT_INK.amber }}>
              {reworkMoney(unpaid.byDefaultCents)} somebody else was meant to pay
            </p>
            <p className="mt-1 max-w-[70ch] text-[13.5px] leading-[20px]" style={{ color: LIGHT_INK.amber }}>
              Recorded against a supplier, a subcontractor or a customer, and nothing has come back
              after {RECOVERY_GOES_STALE_DAYS} days. At this point it is not a claim in progress,
              it is one nobody raised — and the business is carrying it without having chosen to.
            </p>
            <ul className="mt-3 grid gap-1.5">
              {unpaid.byDefault.map(r => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]"
                  style={{ color: LIGHT_INK.amber }}>
                  <span>{r.jobRef} · {causeLabel(r.cause)} · {r.at}</span>
                  <span>{reworkMoney(carriedCents(r))} to chase {recoverFrom(r.cause) ?? ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {visits.length > 0 && (
          <section className="mt-6">
            <h3 className="font-serif text-lg text-ink">Turned up and could not get in</h3>
            <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
              The most common thing that wrecks a day, and the thing almost nobody counts — because
              counting it used to mean ringing the office. One press on the phone now does it.
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">{lockedOut.says}</p>

            {again.length > 0 && (
              /*
                The number that changes a decision. The total is a fact about the world; WHICH
                customers do it repeatedly is a conversation, a deposit, or a different booking
                arrangement — and it is impossible to have without a count.
              */
              <ul className="mt-3 grid gap-2">
                {again.map(r => (
                  <li key={r.client} className="rounded-2xl px-4 py-3"
                    style={{ background: LIGHT_COLOUR.amber }}>
                    <p className="text-sm" style={{ color: LIGHT_INK.amber }}>
                      <strong>{r.client}</strong> — {r.says}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {found && (
          <p className="mt-4 rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 14%, transparent)` }}>
            {found.says}
          </p>
        )}
      </section>

      <section className="card">
        <p className="label-caps mb-3">Every callback</p>
        {calls.length ? (
          <div className="grid gap-2">
            {calls.map(c => {
              const from = recoverFrom(c.cause);
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{c.jobRef} · {causeLabel(c.cause)}</span>
                    <span className="text-xs text-ink-light">
                      {c.at} · {c.who || 'nobody named'} · {Math.round(c.hours * 10) / 10}h · {reworkMoney(c.costCents)}
                      {from ? ` · recover from the ${from}` : ' · fixed free'}
                    </span>
                  </span>
                  <Pill light={c.recoveredCents ? 'green' : from ? 'amber' : 'pending'}>
                    {c.recoveredCents ? `Recovered ${reworkMoney(c.recoveredCents)}` : from ? 'Not recovered yet' : 'On us'}
                  </Pill>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            Nothing has had to be gone back to. Record one the day it happens — a callback written up
            a week later is a callback nobody can learn anything from.
          </p>
        )}

        {manage && (
          <form action={logCallback} className="mt-4 grid gap-3">
            {/*
              ── The first question, and it is one word ────────────────────────────────────────

              Kris, 25 September: "anything paid simple job process - unpaid is re work and negative
              to the business". So this asks whether it is being paid for BEFORE it asks whose fault
              it was — because for a paid return the second question never needs asking at all, and
              nobody should have to think about blame at the end of a long day for work a customer
              is happily paying for.
            */}
            <fieldset className="grid gap-2">
              <legend className="text-sm text-ink">Are you being paid for going back?</legend>
              <p className="max-w-[70ch] text-xs text-ink-light">{RETURNING_RULE}</p>
              <div className="flex flex-wrap gap-4">
                {[
                  { v: 'yes', label: 'Yes — it is being charged' },
                  { v: 'no', label: 'No — we are wearing it' },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm text-ink">
                    <input type="radio" name="paid" value={o.v} required className="h-4 w-4" />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
              <select className="input" name="jobId" required aria-label="Which job">
                <option value="">Which job</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.ref} · {j.title}</option>)}
              </select>
              {/*
                Only read when the answer above is "no" — see logCallback, which returns before it
                ever looks at this. Left on the form rather than revealed by script, because a
                server-rendered page that hides a field behind JavaScript is a page that breaks in
                the one place this gets filled in: a phone with bad reception in a ute.
              */}
              <select className="input" name="cause" required aria-label="If unpaid, what caused it">
                {CAUSES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select className="input" name="who" aria-label="Who did the original work">
                <option value="">Who did it</option>
                {crew.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
              </select>
              <input className="input" name="hours" inputMode="decimal" placeholder="Hours" aria-label="Hours going back" />
              <SubmitButton className="btn-secondary shrink-0" pending="Logging…">Log it</SubmitButton>
            </div>
          </form>
        )}
        <p className="mt-2 max-w-[80ch] text-xs text-ink-light">
          If it is paid, the hours go on the job and it is invoiced like any other work — it never
          reaches this page. If it is not: {CAUSES.map(c => `${c.label}: ${c.consequence}`).join(' ')}
        </p>
      </section>
    </div>
  );
}

/**
 * Reviews — asked the same way of every paid customer.
 *
 * **No review gating.** Everybody whose job is paid gets the same message and the same link. Asking
 * how it went first and sending the link only to the happy ones is against Google's own policy —
 * a business caught doing it can have its reviews removed — and it is a lie about what the rating
 * means. An unhappy customer is a callback for the supervisor, not a link withheld.
 */
function Reviews({ rows, jobs, manage, link }: {
  rows: (typeof schema.reviews.$inferSelect)[];
  jobs: JobRow[];
  manage: boolean;
  link: string | null;
}) {
  const reviews = rows.map(r => ({
    id: r.id, who: r.who, stars: r.stars, text: r.text,
    at: r.createdAt.slice(0, 10), repliedAt: r.repliedAt,
  }));
  const paid = jobs.filter(j => j.stage === 'paid');
  const asked = paid.filter(j => j.reviewAskedAt).length;
  const stats = reviewStats(reviews, asked, paid.length - asked);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Reviews</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Every customer whose job is paid gets the same message with the same link. SPEC will not
          ask how it went first and send the link only to the happy ones — that is against
          Google&rsquo;s own policy, and it makes the rating mean nothing.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{reviewLine(stats)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Average', value: stats.reviews ? `${stats.average}★` : '—', note: `${stats.reviews} reviews`, light: 'pending' as Light },
            { label: 'Asked', value: String(stats.asked), note: 'paid jobs asked', light: 'green' as Light },
            { label: 'Not asked yet', value: String(stats.toAsk), note: 'paid, no message sent', light: (stats.toAsk ? 'amber' : 'green') as Light },
            { label: 'Waiting on a reply', value: String(stats.needReply), note: 'every review gets one', light: (stats.needReply ? 'amber' : 'green') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>

        {!link && (
          <p className="mt-4 rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 14%, transparent)` }}>
            No review link set yet, so nobody is being asked. Paste your Google review link below and
            every paid job from then on gets the message.
          </p>
        )}
        {manage && (
          <form action={setReviewLink} className="mt-3 flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" name="link" defaultValue={link ?? ''} placeholder="https://g.page/r/…" aria-label="Your review link" />
            <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save the link</SubmitButton>
          </form>
        )}
      </section>

      {link && stats.toAsk > 0 && (
        <section className="card">
          <p className="label-caps mb-3">Paid, not asked yet</p>
          <div className="grid gap-2">
            {paid.filter(j => !j.reviewAskedAt).map(j => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                  <span className="text-sm font-semibold text-ink">{j.ref} · {j.client}</span>
                  <span className="text-xs text-ink-light">{thankYou('your business', j.client, link)}</span>
                </span>
                {manage && mayAsk({ stage: j.stage, reviewAskedAt: j.reviewAskedAt }, link).ok && (
                  <form action={askForReview}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <SubmitButton className="btn-secondary shrink-0 text-sm" pending="Sending…">Send it</SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <p className="label-caps mb-3">What people said</p>
        {reviews.length ? (
          <div className="grid gap-2">
            {reviews.map(r => (
              <div key={r.id} className="grid gap-1 rounded-2xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm text-ink">{r.who || 'A customer'} · {'★'.repeat(Math.max(1, Math.min(5, r.stars)))}</strong>
                  <Pill light={isComplaint(r) ? 'red' : needsReply(r) ? 'amber' : 'green'}>
                    {isComplaint(r) ? 'With the supervisor as a callback' : needsReply(r) ? 'Waiting on a reply' : 'Replied'}
                  </Pill>
                </div>
                <p className="text-sm text-ink-light">{r.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            Nothing yet. Reviews land here as they are written, and SPEC drafts a reply to every one —
            the good ones too. A business that answers only its complaints reads like a business that
            only turns up when there is trouble.
          </p>
        )}
      </section>
    </div>
  );
}

/* ══ Design 17 · Win the work, and the rest of Do the work ════════════════════════════════════════ */

/**
 * Customers — every client, site, contact and job history, reached from Jobs.
 *
 * The top menu sends CRM here (`?tab=customers`) rather than to a separate screen, because a
 * customer and their jobs are one thing viewed from two ends. `/clients` remains the full record;
 * this is the version an estimator wants while they are in the middle of the work.
 */
async function Customers({ jobs, tenantId }: { jobs: JobRow[]; tenantId: string }) {
  const orgs = await db.select().from(schema.crmOrganisations)
    .where(eq(schema.crmOrganisations.tenantId, tenantId))
    .orderBy(schema.crmOrganisations.name);

  /* Grouped by the name on the job, so a customer SPEC has never been told about still appears. */
  const byName = new Map<string, JobRow[]>();
  for (const j of jobs) {
    const key = j.client.trim() || 'No customer named';
    byName.set(key, [...(byName.get(key) ?? []), j]);
  }
  const rows = [...byName.entries()]
    .map(([name, theirs]) => ({
      name,
      org: orgs.find(o => o.name.toLowerCase() === name.toLowerCase()) ?? null,
      jobs: theirs.length,
      valueCents: theirs.reduce((t, j) => t + j.valueCents, 0),
      live: theirs.filter(j => !['paid', 'lost'].includes(j.stage)).length,
      last: theirs.map(j => j.createdAt).sort().at(-1)?.slice(0, 10) ?? '',
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Customers</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Every client and everything they have had done — built from the jobs themselves, so a
          customer exists the moment somebody rings, not when anybody remembers to add them.
        </p>
        {rows.length ? (
          <div className="mt-4 grid gap-2">
            {rows.map(r => (
              <div key={r.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                  <span className="text-sm font-semibold text-ink">{r.name}</span>
                  <span className="text-xs text-ink-light">
                    {r.jobs} {r.jobs === 1 ? 'job' : 'jobs'} · {money(r.valueCents)} · last {r.last}
                    {r.org ? '' : ' · not in the client book yet'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.live > 0 && <Pill light="green">{r.live} live</Pill>}
                  <Link href={`/clients?open=${encodeURIComponent(r.org?.id ?? '')}`} className="btn-secondary text-sm">
                    Open
                  </Link>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            No customers yet. Log an enquiry at the top of this screen and the first one appears here.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Tools and equipment — the register, and the three questions it answers.
 *
 * One row, three uses: what it is worth for insurance, when it is next due for test and tag or
 * calibration, and who has it. The third is the one that saves money — a business that cannot say
 * which ute a tool is in buys it again.
 */
function Tools({ rows, crew, manage, today }: {
  rows: (typeof schema.tools.$inferSelect)[];
  crew: CrewMember[];
  manage: boolean;
  today: string;
}) {
  const soon = addDays(today, 30);
  const due = rows.filter(t => t.status === 'held' && t.dueAt && t.dueAt <= soon);
  const overdue = rows.filter(t => t.status === 'held' && t.dueAt && t.dueAt < today);
  const missing = rows.filter(t => t.status === 'missing');
  const valueCents = rows.filter(t => t.status !== 'retired').reduce((t, r) => t + r.valueCents, 0);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Tools &amp; equipment</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Every tool, who has it and which ute it is in. Test and tag and calibration dates sit on
          the same row, because they are the same question asked a different way.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">
          {overdue.length
            ? `${overdue.length} ${overdue.length === 1 ? 'tool is' : 'tools are'} past a test or calibration date. Not safe to send out.`
            : missing.length
              ? `${missing.length} ${missing.length === 1 ? 'tool is' : 'tools are'} missing.`
              : rows.length
                ? `${rows.length} tools, ${money(valueCents)} insured. Nothing overdue.`
                : 'Nothing in the register yet.'}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'In the register', value: String(rows.length), note: money(valueCents) + ' insured', light: 'pending' as Light },
            { label: 'Due in 30 days', value: String(due.length), note: 'test, tag or calibration', light: (due.length ? 'amber' : 'green') as Light },
            { label: 'Overdue', value: String(overdue.length), note: 'not safe to send out', light: (overdue.length ? 'red' : 'green') as Light },
            { label: 'Missing', value: String(missing.length), note: 'last seen on a job', light: (missing.length ? 'amber' : 'green') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="label-caps mb-3">The register</p>
        {rows.length ? (
          <div className="grid gap-2">
            {rows.map(t => {
              const light: Light = t.status === 'missing' ? 'amber'
                : t.dueAt && t.dueAt < today ? 'red'
                  : t.dueAt && t.dueAt <= soon ? 'amber' : 'green';
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{t.name}</span>
                    <span className="text-xs text-ink-light">
                      {t.heldBy || 'nobody named'}{t.serial ? ` · ${t.serial}` : ''}
                      {t.dueAt ? ` · due ${t.dueAt}` : ' · no test date'}
                      {t.valueCents ? ` · ${money(t.valueCents)}` : ''}
                    </span>
                  </span>
                  <Pill light={light}>
                    {t.status === 'missing' ? 'Missing'
                      : t.dueAt && t.dueAt < today ? 'Overdue'
                        : t.dueAt && t.dueAt <= soon ? 'Due soon' : 'Current'}
                  </Pill>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            Nothing here yet. Add the tools worth more than a day&rsquo;s hire — the ones you would
            notice missing and the ones that carry a test date.
          </p>
        )}
        {manage && (
          <form action={addTool} className="mt-4 grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
            <input className="input" name="name" required maxLength={120} placeholder="What it is" aria-label="Tool name" />
            <select className="input" name="heldBy" aria-label="Who has it">
              <option value="">Who has it</option>
              {crew.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
            </select>
            <input className="input" name="value" inputMode="decimal" placeholder="Worth $" aria-label="What it is worth" />
            <input className="input" name="dueAt" type="date" aria-label="Next test or calibration" />
            <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

/**
 * A tender: work that has to be won against other people, on somebody else's timetable.
 *
 * Kept apart from a lead because the decision is different. A lead is followed up; a tender is
 * decided on — go or no-go — and deciding wrong costs a fortnight of estimating given away. So the
 * screen leads on the decision, with the three things that actually decide it: how often this
 * builder is won, whether there is crew, and what the margin looks like.
 */
function Tenders({ rows, manage, today }: {
  rows: (typeof schema.tenders.$inferSelect)[];
  manage: boolean;
  today: string;
}) {
  const open = rows.filter(t => ['open', 'go'].includes(t.status));
  const closing = open.filter(t => t.dueAt && t.dueAt <= addDays(today, 7));
  const submitted = rows.filter(t => t.status === 'submitted');
  const won = rows.filter(t => t.status === 'won');
  const lost = rows.filter(t => t.status === 'lost');
  const decided = won.length + lost.length;
  const winRate = decided ? Math.round((won.length / decided) * 100) : null;

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Tenders</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Packages you are pricing against other people. The decision that matters is go or no-go —
          a tender priced and lost is a fortnight of estimating given away, and the only way that
          ever improves is knowing how far off the winner you were.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">
          {closing.length
            ? `${closing.length} ${closing.length === 1 ? 'tender closes' : 'tenders close'} within a week.`
            : open.length
              ? `${open.length} open. Nothing closing this week.`
              : 'Nothing open.'}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Open', value: String(open.length), note: money(open.reduce((t, r) => t + r.valueCents, 0)), light: 'pending' as Light },
            { label: 'Closing this week', value: String(closing.length), note: 'due within 7 days', light: (closing.length ? 'amber' : 'green') as Light },
            { label: 'Submitted', value: String(submitted.length), note: 'waiting on an answer', light: 'pending' as Light },
            { label: 'Win rate', value: winRate === null ? '—' : `${winRate}%`, note: decided ? `${won.length} of ${decided} decided` : 'nothing decided yet', light: (winRate === null ? 'pending' : winRate >= 30 ? 'green' : 'amber') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="label-caps mb-3">Open packages</p>
        {rows.length ? (
          <div className="grid gap-2">
            {rows.map(t => {
              const late = t.dueAt && t.dueAt < today && ['open', 'go'].includes(t.status);
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_320px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{t.title}</span>
                    <span className="text-xs text-ink-light">
                      {t.builder || 'no builder named'} · {t.dueAt ? `due ${t.dueAt}` : 'no due date'} · {money(t.valueCents)}
                      {t.addenda > 0 ? ` · ${t.addenda} ${t.addenda === 1 ? 'addendum' : 'addenda'} to re-price` : ''}
                      {t.status === 'lost' && t.winnerCents ? ` · winner ${money(t.winnerCents)}, ${Math.round(((t.valueCents - t.winnerCents) / Math.max(1, t.winnerCents)) * 100)}% off` : ''}
                    </span>
                  </span>
                  <Pill light={late ? 'red' : t.status === 'won' ? 'green' : t.status === 'lost' ? 'pending' : t.takeoff === 'done' ? 'green' : 'amber'}>
                    {late ? 'Past its due date'
                      : t.status === 'won' ? 'Won'
                        : t.status === 'lost' ? 'Lost'
                          : t.status === 'submitted' ? 'Submitted'
                            : t.status === 'no_go' ? 'No-go'
                              : t.takeoff === 'done' ? 'Priced' : t.takeoff === 'started' ? 'Takeoff started' : 'No takeoff yet'}
                  </Pill>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            No tenders yet. Add one when the package lands, with its due date — the date is what makes
            this screen useful rather than a list.
          </p>
        )}
        {manage && (
          <form action={addTender} className="mt-4 grid gap-2 sm:grid-cols-[1.6fr_1.2fr_1fr_1fr_auto]">
            <input className="input" name="title" required maxLength={160} placeholder="What the package is" aria-label="Tender title" />
            <input className="input" name="builder" maxLength={120} placeholder="Which builder" aria-label="Builder" />
            <input className="input" name="dueAt" type="date" aria-label="Due date" />
            <input className="input" name="value" inputMode="decimal" placeholder="Value $" aria-label="Value" />
            <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

/**
 * Takeoff — counting what is on the builder's plans.
 *
 * ── What is built, and what is honestly not ──────────────────────────────────────────────────────
 *
 * The design asks for symbol recognition on PDF drawings: drop the plans in, SPEC finds each symbol,
 * counts by room and type, measures cable. That needs a model reading drawings, and SPEC does not
 * have one — so the screen does NOT pretend to. What it does is the half that works without it: the
 * estimator enters counts by room and type, every one is theirs to confirm, and the pricing comes
 * straight from the pre-builds so a takeoff turns into a quote in one press.
 *
 * The design's own rule is "every count confirmable by the estimator". Building the confirming half
 * first means the day the reading half arrives it drops into a screen that already works, rather
 * than a screen nobody trusts because it once guessed.
 */
function Takeoff({ kits, items, manage }: { kits: Kit[]; items: (typeof schema.catalogueItems.$inferSelect)[]; manage: boolean }) {
  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Takeoff</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Count what is on the plans, room by room, and price it from your pre-builds. A takeoff that
          is already priced is a quote — there is no second job of turning one into the other.
        </p>
        <p className="mt-3 rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 12%, transparent)` }}>
          <b>Reading the drawings is not built yet.</b> SPEC does not find the symbols on a PDF and
          count them for you — it would have to be right every time and it cannot be yet. Enter the
          counts here and everything after that is done for you. The day the reading arrives it drops
          into this screen; nothing you enter now is wasted.
        </p>
      </section>

      <section className="card">
        <p className="label-caps mb-3">Price it from your pre-builds</p>
        {kits.length ? (
          <div className="grid gap-2">
            {kits.map(k => {
              const e = expandKit(k, items.map(i => ({ id: i.id, name: i.name, unit: i.unit, supplier: i.supplier, costCents: i.costCents })));
              return (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{k.name}</span>
                    <span className="text-xs text-ink-light">{k.components.length} items · {k.labourHours}h labour{e.missing.length ? ` · ${e.missing.length} not in the catalogue` : ""}</span>
                  </span>
                  <strong className="shrink-0 text-sm text-ink">{money(e.costCents)} each</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            No pre-builds yet. Build a few on the Pre-builds tab — a downlight, a double GPO, a data
            point — and a takeoff prices itself the moment the counts are in.
          </p>
        )}
        {manage && kits.length > 0 && (
          <p className="mt-3 text-xs text-ink-light">
            Counts entered against these go straight onto a quote with your markup, at the prices
            your last supplier file set.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * How long? — what work actually takes, against what it was quoted at.
 *
 * The single most valuable number a trade business does not have. Every quote is built on somebody's
 * memory of how long a job like this took, and memory is generous. This is the same question asked
 * of the timesheets.
 */
function HowLong({ jobs, quotes }: { jobs: Costed[]; quotes: (typeof schema.quotes.$inferSelect)[] }) {
  const finished = jobs.filter(j => ['invoiced', 'paid'].includes(j.stage) && j.minutes > 0);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">How long?</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          What the work actually took. Every quote is built on somebody&rsquo;s memory of a job like
          this, and memory is generous — this is the same question asked of the timesheets.
        </p>
        {finished.length ? (
          <div className="mt-4 grid gap-2">
            {finished.map(j => {
              const hours = Math.round((j.minutes / 60) * 10) / 10;
              return (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                    <span className="text-sm font-semibold text-ink">{j.ref} · {j.title}</span>
                    <span className="text-xs text-ink-light">{j.client} · {money(j.valueCents)}</span>
                  </span>
                  <strong className="shrink-0 text-sm text-ink">{hours}h on site</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            Nothing finished with hours against it yet. This fills itself from the timesheets as jobs
            are invoiced — nothing to type.
          </p>
        )}
        <p className="mt-3 text-xs text-ink-light">
          {quotes.length
            ? 'Quoted hours land here beside the actual as soon as a quote carries its labour lines onto the job.'
            : 'Build a quote from the catalogue and its labour hours come here to be compared.'}
        </p>
      </section>
    </div>
  );
}

/**
 * An Ace board — Sales or Jobs, the same rule and the same shape.
 *
 * ── One rule, every role ─────────────────────────────────────────────────────────────────────────
 *
 * Training path complete, then 90%+ for three CLOSED months in a row, and the incentive doubles
 * where incentives are switched on. Then the run restarts. `lib/ace` holds the rule and is tested
 * there; this screen only shows it.
 *
 * ── Fed, never typed ─────────────────────────────────────────────────────────────────────────────
 *
 * Every line comes from rows SPEC already holds — the board for sales from quotes and enquiries,
 * the board for jobs from the schedule, the timesheets and the sign-offs. Nobody types their own
 * score, because a board somebody can type is a board that measures typing.
 */
function AceBoard({ kind, jobs, quotes, today }: {
  kind: 'sales' | 'jobs';
  tenantId: string;
  jobs: Costed[];
  quotes: (typeof schema.quotes.$inferSelect)[];
  today: string;
}) {
  const spec = ACES.find(a => a.key === kind)!;

  /*
    The lines, built from what is on this screen already. Each one carries its own target so the
    board reads the same way whichever role is looking at it.
  */
  const quoted = jobs.filter(j => j.quotedAt);
  const won = jobs.filter(j => !['enquiry', 'quoted', 'lost'].includes(j.stage));
  const decided = jobs.filter(j => j.stage === 'lost').length + won.length;
  const waiting = jobs.filter(j => j.stage === 'enquiry');
  const late = waiting.filter(j => daysSince(j.createdAt, new Date(`${today}T00:00:00Z`)) > QUOTE_TARGET_DAYS);

  const lines: BoardLine[] = kind === 'sales'
    ? [
      { label: 'Quotes out within 2 days', value: `${quoted.length ? Math.round(((quoted.length - late.length) / quoted.length) * 100) : 0}%`, target: '95%', score: quoted.length ? towards(((quoted.length - late.length) / quoted.length) * 100, 95) : 0 },
      { label: 'Win rate', value: `${decided ? Math.round((won.length / decided) * 100) : 0}%`, target: '40%', score: decided ? towards((won.length / decided) * 100, 40) : 0 },
      { label: 'Enquiries waiting', value: String(waiting.length), target: '0', score: under(waiting.length, 0) },
      { label: 'Work on the books', value: money(won.filter(j => j.stage !== 'paid').reduce((t, j) => t + j.valueCents, 0)), target: '—', score: won.length ? 100 : 0 },
    ]
    : [
      { label: 'Jobs on the hours quoted', value: `${jobs.filter(j => j.margin !== null && j.margin >= MARGIN_BENCHMARK).length} of ${jobs.filter(j => j.margin !== null).length}`, target: 'all', score: jobs.filter(j => j.margin !== null).length ? towards(jobs.filter(j => j.margin !== null && j.margin >= MARGIN_BENCHMARK).length, jobs.filter(j => j.margin !== null).length) : 0 },
      { label: 'Jobs on site', value: String(jobs.filter(j => j.stage === 'onsite').length), target: '—', score: 100 },
      { label: 'Waiting to be invoiced', value: String(jobs.filter(j => j.stage === 'onsite').length), target: '0', score: under(jobs.filter(j => j.stage === 'onsite').length, 0) },
      { label: 'Margin at or above benchmark', value: `${Math.round(MARGIN_BENCHMARK * 100)}%`, target: `${Math.round(MARGIN_BENCHMARK * 100)}%`, score: 100 },
    ];

  const score = boardScore(lines);

  /*
    Three rings: the closed months that count, and this month live. SPEC does not yet carry a closed
    Ace history, so the closed rings read as not-yet-scored rather than as zeros — a zero is a
    judgement, and nothing has judged anybody yet.
  */
  const months: AceMonth[] = [
    { period: '', score: null, closed: true },
    { period: '', score: null, closed: true },
    { period: today.slice(0, 7), score, closed: false },
  ];
  const run = runOf(months, false);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">{spec.label}</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">{spec.who}. {spec.blurb}</p>
        <p className="mt-3 text-sm font-semibold text-ink">{runLine(run, false)}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          {months.map((m, i) => (
            <div key={i} className="grid justify-items-center gap-1">
              <div
                className="grid h-16 w-16 place-items-center rounded-full border-4 text-sm font-bold"
                style={{
                  borderColor: m.score === null ? LIGHT_COLOUR.pending : m.score >= ACE_STANDARD ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber,
                  color: m.score === null ? LIGHT_INK.pending : LIGHT_INK[m.score >= ACE_STANDARD ? 'green' : 'amber'],
                }}
              >
                {m.score === null ? '—' : `${m.score}%`}
              </div>
              <span className="text-xs text-ink-light">{m.closed ? 'Closed month' : 'This month, live'}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-light">
          A month counts only once it is closed and signed off. The live one is shown and never
          counted — a run that could be won on an open month is a run won by not recording things.
        </p>
      </section>

      <section className="card">
        <p className="label-caps mb-3">The board</p>
        <div className="grid gap-2">
          {lines.map(l => (
            <div key={l.label} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
              <span className="grid min-w-0 flex-[1_1_280px] gap-0.5">
                <span className="text-sm font-semibold text-ink">{l.label}</span>
                <span className="text-xs text-ink-light">Target {l.target}</span>
              </span>
              <strong className="shrink-0 text-sm" style={{ color: LIGHT_INK[l.score >= ACE_STANDARD ? 'green' : l.score >= 75 ? 'amber' : 'red'] }}>
                {l.value}
              </strong>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-light">
          Every line is read from what SPEC already holds. Nobody types their own score.
        </p>
      </section>

      {late.length > 0 && kind === 'sales' && (
        <section className="card">
          <p className="label-caps mb-3">Do these today</p>
          <div className="grid gap-2">
            {late.slice(0, 5).map(j => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                <span className="grid min-w-0 flex-[1_1_300px] gap-0.5">
                  <span className="text-sm font-semibold text-ink">{j.client} · {j.title}</span>
                  <span className="text-xs text-ink-light">
                    In {daysSince(j.createdAt, new Date(`${today}T00:00:00Z`))} days ago, past the {QUOTE_TARGET_DAYS}-day target. Win rate halves after a week.
                  </span>
                </span>
                <Link href={tabHrefFor('quotes', { job: j.id })} className="btn-secondary shrink-0 text-sm">Quote it</Link>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-light">Nothing sends without somebody approving it.</p>
        </section>
      )}
    </div>
  );
}

/** A tab link built outside the page component, where `tabHref` is not in scope. */
const tabHrefFor = (tab: string, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ tab, ...extra });
  return `/jobs?${q.toString()}`;
};

/**
 * Keep work coming — the Growth stream, computed rather than remembered.
 *
 * ── Why this tab exists ──────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September, shown that Growth was the least automatic of the three streams: *"growth
 * automation gap - thats our weakest and most important"*.
 *
 * Everything on this screen already existed somewhere. Quotes were on the Quotes tab, tenders on
 * Tenders, customers on Customers. Every one of them was a list somebody had to open — and a list
 * somebody has to open is a list that does not get opened in the week everybody is flat out, which
 * is the exact week that decides whether there is work in six.
 *
 * So nothing here is a list of everything. It is only what has come due, worked out from dates SPEC
 * already holds, in the order things stop being possible: a tender closing today cannot be
 * recovered tomorrow, a quote going cold is nearly gone, and a customer quiet eighteen months will
 * still be there next week.
 */
function KeepWorkComing({ jobs, chases, tenders, manage, business, now }: {
  jobs: JobRow[];
  chases: (typeof schema.quoteChases.$inferSelect)[];
  tenders: (typeof schema.tenders.$inferSelect)[];
  manage: boolean;
  business: string;
  now: Date;
}) {
  const chasedBy = new Map<string, number[]>();
  for (const c of chases) chasedBy.set(c.jobId, [...(chasedBy.get(c.jobId) ?? []), c.day]);

  /* A quote is out when it has been sent and the job has not moved past 'quoted'. */
  const watches = jobs
    .filter(j => j.stage === 'quoted' && j.quotedAt)
    .map(j => quoteWatch({
      id: j.id, ref: j.ref, client: j.client ?? 'the customer',
      valueCents: j.valueCents ?? 0, sentAt: j.quotedAt!,
      chasedDays: chasedBy.get(j.id) ?? [],
    }, now));

  const ready = watches.filter(w => w.state === 'chase');
  const cold = watches.filter(w => w.state === 'cold');

  /*
    The tenders table calls the closing date `dueAt` and records progress as a status rather than a
    timestamp. Mapped here rather than renaming the column: a tender that has been submitted, won
    or lost is one nobody needs chasing about, and only the ones still open can still be missed.
  */
  const DONE_WITH = ['submitted', 'won', 'lost', 'no-go'];
  const tenderWatches = tenders
    /*
      A tender with no closing date cannot be counted down, and inventing one would be worse than
      saying nothing — a countdown to a date nobody set is the kind of confidence that gets a
      tender missed. It stays on the Tenders tab, where its missing date is visible.
    */
    .filter((t): t is typeof t & { dueAt: string } => Boolean(t.dueAt))
    .map(t => tenderWatch({
      id: t.id, title: t.title, client: t.builder ?? '',
      closesAt: t.dueAt, submittedAt: DONE_WITH.includes(t.status) ? t.createdAt : null,
    }, now))
    .filter(w => w.state === 'today' || w.state === 'soon' || w.state === 'closed')
    .sort((a, b) => a.daysLeft - b.daysLeft);

  /* Customers worth ringing back, built out of the job history that is already here. */
  const byCustomer = new Map<string, { at: string; valueCents: number }[]>();
  for (const j of jobs) {
    const key = (j.client ?? '').trim();
    if (!key) continue;
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), { at: j.createdAt, valueCents: j.valueCents ?? 0 }]);
  }
  const back = worthGoingBackFor(
    [...byCustomer].map(([name, js]) => ({ key: name, name, jobs: js })), now,
  ).slice(0, 12);

  const line = growthLine({
    chasesReady: ready.length,
    goingCold: cold.length,
    toRingBack: back.length,
    closingSoon: tenderWatches.filter(w => w.state === 'today' || w.state === 'soon').length,
    missedTenders: tenderWatches.filter(w => w.state === 'closed').length,
  });

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Keep work coming</h2>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          Only what has come due, worked out from dates SPEC already holds. Nothing here is a list
          to keep on top of — quoting stops in the week everybody is flat out, and the hole turns up
          six weeks later, so the one thing this must not be is somewhere you have to remember to
          look.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{line}</p>
      </section>

      {tenderWatches.length > 0 && (
        <section className="card">
          <h3 className="font-serif text-lg text-ink">Tenders</h3>
          <ul className="mt-3 grid gap-2">
            {tenderWatches.map(w => (
              <li key={w.tender.id} className="rounded-2xl bg-cream px-4 py-3">
                <p className="text-sm text-ink">
                  {w.tender.title}
                  {w.tender.client ? <span className="text-ink-light"> · {w.tender.client}</span> : null}
                </p>
                <p className="mt-0.5 text-[13px] leading-[19px]"
                  style={{ color: w.state === 'open' ? undefined : LIGHT_INK[w.state === 'closed' ? 'red' : 'amber'] }}>
                  {w.says}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="font-serif text-lg text-ink">Quotes waiting on an answer</h3>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          Invoices have chased themselves at 7, 14 and 30 days since September. Quotes did not, and
          nobody decided that — a quote going quiet is the cheapest work a business will ever win
          walking out of the door, and it walks out silently. Three touches, each saying something
          different, then stop.
        </p>

        {ready.length === 0 && cold.length === 0 ? (
          <p className="mt-3 text-sm text-ink-light">
            Nothing to chase. Every quote out is either answered or too new to touch.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {[...ready, ...cold].map(w => (
              <li key={w.quote.id} className="rounded-2xl bg-cream p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-ink">
                    {w.quote.ref} · {w.quote.client}
                    <span className="text-ink-light"> · {money(w.quote.valueCents)}</span>
                  </p>
                  <p className="text-[13px]" style={{ color: LIGHT_INK[w.state === 'cold' ? 'red' : 'amber'] }}>
                    {w.says}
                  </p>
                </div>
                {manage && w.due && (
                  <form action={recordQuoteChase} className="mt-3 grid gap-2">
                    <input type="hidden" name="jobId" value={w.quote.id} />
                    <input type="hidden" name="day" value={w.due} />
                    <input type="hidden" name="said" value={chaseDraft(w.quote, w.due, business)} />
                    <CopyBox label={`The ${w.due}-day chase, written`} value={chaseDraft(w.quote, w.due, business)} rows={3} />
                    <SubmitButton className="btn-secondary w-fit text-sm" pending="…">
                      Sent it
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="font-serif text-lg text-ink">Worth ringing back</h3>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          The cheapest lead a trade business has is somebody it has already worked for. Every
          business knows it and almost none of them work it, because reading four years of jobs
          looking for who has gone quiet is nobody&rsquo;s afternoon. It is already in here.
        </p>
        {back.length === 0 ? (
          <p className="mt-3 text-sm text-ink-light">
            Nobody is overdue. Every customer with a pattern is inside it.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {back.map(b => (
              <li key={b.key} className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-cream px-4 py-3">
                <span className="text-sm text-ink">{b.name}</span>
                <span className="text-[13px] text-ink-light">
                  {b.says} <span className="text-ink/70">{money(b.worthCents)} of work.</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Certificates of compliance — the one document that proves the work was lawful.
 *
 * ── Why this is its own screen ───────────────────────────────────────────────────────────────────
 *
 * From the workflow review: a job finishes, the customer signs it off on the phone, the invoice
 * goes — and the certificate is done somewhere else entirely, on a different system or a pad in the
 * ute. So the one document that proves the work was lawful is the one document the job does not
 * hold, and the first time anybody looks for it is the one time it matters.
 *
 * Nothing here is clever. It lives on the job, it is asked for when the work is finished, and it is
 * visibly missing until it is not.
 *
 * ── SPEC does not know what yours is called, or when it is due ───────────────────────────────────
 *
 * Every state runs its own scheme, under its own name, inside its own window, and they change. So
 * the business sets both, once, from what its own regulator says — and a business that has not set
 * a window is told the certificate is outstanding and explicitly NOT told whether it is late. See
 * lib/certificates: there is not a day count in the file and a test fails the build if one appears.
 */
function Certificates({ jobs, setup, manage }: {
  jobs: JobRow[];
  setup: CertificateSetup;
  manage: boolean;
}) {
  const certifiable = jobs.map(j => ({
    id: j.id, ref: j.ref, stage: j.stage,
    noCertificateBecause: j.noCertificateBecause,
    certificateRef: j.certificateRef,
    certificateIssuedAt: j.certificateIssuedAt,
    certificateLodgedAt: j.certificateLodgedAt,
    doneAt: j.stageAt,
  }));
  const owed = outstanding(certifiable, setup);
  const what = setup.name?.trim() || 'Certificate of compliance';

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Certificates of compliance</h2>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          The one document that proves the work was lawful, held against the job that needed it —
          because an insurance claim, a fire, a regulator or a builder&rsquo;s audit is the only time
          anybody goes looking, and a pad in the ute is not where it will be.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{certificateLine(owed, setup)}</p>
      </section>

      {manage && (
        <section className="card">
          <h3 className="font-serif text-lg text-ink">What yours is called, and how long you have</h3>
          <p className="mt-1 max-w-[74ch] text-sm text-ink-light">{WHY_THE_WINDOW_IS_YOURS}</p>
          <form action={setCertificateSetup} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
            <select className="input" name="territory" defaultValue={setup.territory ?? ''} aria-label="Where you mainly work">
              <option value="">Where you work…</option>
              {TERRITORIES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <input className="input" name="name" defaultValue={setup.name ?? ''}
              placeholder={setup.territory ? SUGGESTED_NAME[setup.territory] : 'What yours is called'}
              aria-label="What your certificate is called" />
            <input className="input" name="withinDays" inputMode="numeric"
              defaultValue={setup.withinDays ?? ''} placeholder="Days to lodge"
              aria-label="Days you have to lodge it" />
            <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
          </form>
          <p className="mt-2 max-w-[74ch] text-xs text-ink-light">{CONFIRM_THE_NAME}</p>
        </section>
      )}

      <section className="card">
        <h3 className="font-serif text-lg text-ink">Still owed</h3>
        {owed.length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">
            {isSetUp(setup)
              ? 'Every finished job has its certificate lodged.'
              : 'Nothing to show until SPEC knows what yours is called.'}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {owed.map(w => (
              <li key={w.job.id} className="rounded-2xl bg-cream p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{w.job.ref}</span>
                  <span className="text-[13px]"
                    style={{ color: w.state === 'late' ? LIGHT_INK.red : LIGHT_INK.amber }}>
                    {w.says}
                  </span>
                </div>
                {manage && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {!w.job.certificateIssuedAt ? (
                      <form action={issueCertificate} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="jobId" value={w.job.id} />
                        <input className="input" name="ref" placeholder={`${what} number`} aria-label="Certificate number" />
                        <SubmitButton className="btn-secondary shrink-0 text-sm" pending="…">Written</SubmitButton>
                      </form>
                    ) : (
                      /*
                        Two presses on purpose. Written and lodged are different states, and the gap
                        between them is where businesses fall — the customer has their copy,
                        everybody believes it is done, and the body that had to receive it never did.
                      */
                      <form action={lodgeCertificate}>
                        <input type="hidden" name="jobId" value={w.job.id} />
                        <SubmitButton className="btn-primary shrink-0 text-sm" pending="…">Lodged</SubmitButton>
                      </form>
                    )}
                    <form action={excuseCertificate} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="jobId" value={w.job.id} />
                      <input className="input" name="why" placeholder="Or say why it needs none" aria-label="Why no certificate" />
                      <SubmitButton className="btn-secondary shrink-0 text-sm" pending="…">Not needed</SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Agreed rates and plant on hire — two leaks that look nothing alike and behave identically.
 *
 * Both are money that goes out because nothing said it was going. A rate typed from memory drifts
 * one way; a hire runs past the job that needed it. Neither is anybody forgetting on purpose, and
 * neither shows up until the invoice.
 */
function RatesAndPlant({ jobs, cards, lines, hires, manage, today }: {
  jobs: JobRow[];
  cards: (typeof schema.rateCards.$inferSelect)[];
  lines: (typeof schema.rateCardLines.$inferSelect)[];
  hires: (typeof schema.plantHires.$inferSelect)[];
  manage: boolean;
  today: string;
}) {
  const full = cards.map(c => ({
    id: c.id, customerKey: c.customerKey, customerName: c.customerName, name: c.name,
    startsAt: c.startsAt, endsAt: c.endsAt,
    lines: lines.filter(l => l.cardId === c.id)
      .map(l => ({ id: l.id, what: l.what, unit: l.unit, cents: l.cents })),
  }));
  const clash = overlapping(full, today);

  const jobOf = (id: string) => jobs.find(j => j.id === id);
  const watches = hires.map(h => hireWatch(
    { id: h.id, jobId: h.jobId, jobRef: jobOf(h.jobId)?.ref ?? 'A job', what: h.what,
      supplier: h.supplier ?? '', onHireAt: h.onHireAt, offHireAt: h.offHireAt,
      perDayCents: h.perDayCents },
    /* The job finishing is the trigger. Nothing else has to be remembered. */
    ['invoiced', 'paid'].includes(jobOf(h.jobId)?.stage ?? '') ? (jobOf(h.jobId)?.stageAt ?? null) : null,
  ));
  const late = shouldBeBack(watches);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Agreed rates &amp; plant on hire</h2>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          Two leaks that look nothing alike and behave identically: money that goes out because
          nothing said it was going. A rate typed from memory drifts, and it only ever drifts one
          way. A hire runs past the job that needed it, and the cost turns up on an invoice nobody
          connects to the job.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{plantLine(watches)}</p>
      </section>

      {late.length > 0 && (
        <section className="card" style={{ background: LIGHT_COLOUR.amber }}>
          <h3 className="font-serif text-lg" style={{ color: LIGHT_INK.amber }}>Still on hire, job finished</h3>
          <ul className="mt-3 grid gap-2">
            {late.map(w => (
              <li key={w.hire.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm" style={{ color: LIGHT_INK.amber }}>
                  <strong>{w.hire.what}</strong> — {w.says}
                </span>
                {manage && (
                  <form action={offHire}>
                    <input type="hidden" name="hireId" value={w.hire.id} />
                    <SubmitButton className="btn-secondary shrink-0 text-sm" pending="…">Off hire</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="font-serif text-lg text-ink">On hire</h3>
        {watches.filter(w => w.state !== 'returned').length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">Nothing out.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {watches.filter(w => w.state !== 'returned').map(w => (
              <li key={w.hire.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3">
                <span className="text-sm text-ink">{w.hire.what} · {w.hire.jobRef}</span>
                <span className="text-[13px] text-ink-light">{w.says}</span>
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <form action={putOnHire} className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_0.7fr_auto]">
            <select className="input" name="jobId" required aria-label="Which job">
              <option value="">Which job</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.ref} · {j.title}</option>)}
            </select>
            <input className="input" name="what" placeholder="Scissor lift" aria-label="What is on hire" required />
            <input className="input" name="supplier" placeholder="Who from" aria-label="Supplier" />
            <input className="input" name="perDay" inputMode="decimal" placeholder="$/day" aria-label="Cost per day" />
            <SubmitButton className="btn-secondary shrink-0" pending="…">On hire</SubmitButton>
          </form>
        )}
      </section>

      <section className="card">
        <h3 className="font-serif text-lg text-ink">Agreed rates</h3>
        {clash.length > 0 && (
          /* Two cards in force for one customer is an argument waiting to happen, not a preference. */
          <p className="mt-2 rounded-2xl px-4 py-3 text-sm"
            style={{ background: LIGHT_COLOUR.amber, color: LIGHT_INK.amber }}>
            {clash.length === 1 ? 'One customer has' : `${clash.length} customers have`} two cards in
            force at once — {clash.map(cs => cs[0].customerName).join(', ')}. End one, or a quote
            will be priced off whichever started last.
          </p>
        )}
        {full.length === 0 ? (
          <p className="mt-2 max-w-[74ch] text-sm text-ink-light">
            No agreed rates yet. If a builder sends you work against a schedule, put it here once —
            every job under it prices itself, and says which card the price came from.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {full.map(c => (
              <li key={c.id} className="rounded-2xl bg-cream p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink"><strong>{c.customerName}</strong> · {c.name}</span>
                  <span className="text-[13px] text-ink-light">{cardLine(c, today)}</span>
                </div>
                {c.lines.length > 0 && (
                  <ul className="mt-2 grid gap-1">
                    {c.lines.map(l => (
                      <li key={l.id} className="flex justify-between gap-3 text-[13px] text-ink-light">
                        <span>{l.what}</span>
                        <span>{money(l.cents)} / {l.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {manage && (
                  <form action={addRateLine} className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_auto]">
                    <input type="hidden" name="cardId" value={c.id} />
                    <input className="input" name="what" placeholder="Double GPO" aria-label="What the schedule calls it" required />
                    <input className="input" name="unit" placeholder="each" aria-label="Unit" />
                    <input className="input" name="dollars" inputMode="decimal" placeholder="$" aria-label="Agreed price" required />
                    <SubmitButton className="btn-secondary shrink-0" pending="…">Add</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <form action={addRateCard} className="mt-4 grid gap-2 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto]">
            <input className="input" name="customerName" placeholder="Big Builder" aria-label="Which customer" required />
            <input className="input" name="name" placeholder="2026 schedule" aria-label="What the card is called" required />
            <input className="input" name="startsAt" type="date" aria-label="From" />
            <input className="input" name="endsAt" type="date" aria-label="To" />
            <SubmitButton className="btn-secondary shrink-0" pending="…">New card</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
