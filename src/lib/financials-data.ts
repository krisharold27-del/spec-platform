import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { crewFor } from './jobs-data';
import { workWeek } from './jobs';
import { moneyStats } from './billing-job';
import { ledgerConnections } from './virtual-gm-data';
import { ledgerPanel, type LedgerPanel } from './virtual-gm-overview';
import { accessTokenFor, credentialFor } from './xero-link';
import { profitAndLoss } from './xero-net';
import { parseIssues } from './hr-records';
import {
  NO_FIGURES, mergeFigures, payrollFlow, whatNeedsYou,
  type FigureKey, type Figures, type Need, type PayRunState, type PayrollFlow, type Source,
} from './financials';

/**
 * Everything /financials reads, in one call. Read only — nothing here writes to anybody's books.
 *
 * Sources, strongest first (lib/financials explains why): the connected accounting system, then the
 * newest uploaded file, then SiteVIP's own invoices and supplier bills for who owes whom.
 */

export interface FinancialsView {
  figures: Figures;
  sources: Partial<Record<FigureKey, Source>>;
  overdueCents: number;
  billsOverOrder: number;
  ledger: LedgerPanel;
  upload: { fileName: string; at: string } | null;
  /** Why the live read from the accounting system gave nothing, when it tried. */
  ledgerNote: string | null;
  needs: Need[];
  payroll: PayrollFlow;
  week: string;
}

/** A live read never holds the page up for long. */
const LIVE_READ_MS = 6_000;

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);

/** Profit this month and last, read live from a linked Xero organisation — or why not. */
async function liveProfit(tenantId: string, today: string): Promise<{ figures: Figures; note: string | null }> {
  const rows = await db.select({ id: schema.systemConnections.id })
    .from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      eq(schema.systemConnections.category, 'financials'),
      isNull(schema.systemConnections.personalFor),
    ));
  for (const r of rows) {
    const cred = await credentialFor(tenantId, r.id);
    if (!cred?.xeroOrgId) continue;
    const read = await within((async () => {
      const access = await accessTokenFor(tenantId, r.id);
      if (!access.ok) return { ok: false as const, reason: access.reason };
      const d = new Date(`${today}T00:00:00Z`);
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      return profitAndLoss({ accessToken: access.accessToken, xeroOrgId: access.xeroOrgId, toDate: end, months: 2 });
    })(), LIVE_READ_MS);
    if (!read) return { figures: NO_FIGURES, note: 'Your accounting system was slow to answer. The figures will be read on the next visit.' };
    if (!read.ok) return { figures: NO_FIGURES, note: read.reason };
    // Oldest first, ending with this month.
    const pts = read.points;
    const cents = (n: number | undefined) => (n === undefined ? null : Math.round(n * 100));
    return {
      figures: { ...NO_FIGURES, profitThis: cents(pts.at(-1)?.amount), profitLast: cents(pts.at(-2)?.amount) },
      note: null,
    };
  }
  return { figures: NO_FIGURES, note: null };
}

function parseFigures(raw: string): Figures {
  try {
    const parsed = JSON.parse(raw) as Partial<Figures>;
    const out: Figures = { ...NO_FIGURES };
    for (const k of Object.keys(NO_FIGURES) as FigureKey[]) {
      const v = parsed[k];
      out[k] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return out;
  } catch {
    return { ...NO_FIGURES };
  }
}

export async function financialsFor(user: CurrentUser, today = new Date().toISOString().slice(0, 10)): Promise<FinancialsView> {
  const tenantId = user.tenantId;
  const days = workWeek(today);

  const [connections, uploads, bills, orders, crew, runs, switches, payrollSystems] = await Promise.all([
    ledgerConnections(tenantId),
    db.select().from(schema.ledgerUploads).where(eq(schema.ledgerUploads.tenantId, tenantId))
      .orderBy(desc(schema.ledgerUploads.createdAt)).limit(1),
    db.select().from(schema.jobBills).where(eq(schema.jobBills.tenantId, tenantId)),
    db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId)),
    crewFor(user),
    db.select().from(schema.payRuns).where(eq(schema.payRuns.tenantId, tenantId))
      .orderBy(desc(schema.payRuns.fromDate)).limit(1),
    db.select().from(schema.systemSwitches)
      .where(and(eq(schema.systemSwitches.tenantId, tenantId), eq(schema.systemSwitches.area, 'payroll'))),
    db.select({ name: schema.systemConnections.name }).from(schema.systemConnections)
      .where(and(
        eq(schema.systemConnections.tenantId, tenantId),
        eq(schema.systemConnections.category, 'payroll'),
        isNull(schema.systemConnections.personalFor),
      )),
  ]);
  const ledger = ledgerPanel(connections);

  // Timesheets: this week, for the people this viewer can see — the same list the Timesheets tab shows.
  const keys = crew.map(c => c.key);
  const entries = keys.length
    ? await db.select().from(schema.timesheetEntries).where(and(
        eq(schema.timesheetEntries.tenantId, tenantId),
        inArray(schema.timesheetEntries.day, days),
        inArray(schema.timesheetEntries.personKey, keys),
      ))
    : [];
  const jobIds = [...new Set(entries.map(e => e.jobId).filter((j): j is string => !!j))];
  const jobs = jobIds.length
    ? await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, site: schema.jobs.site })
        .from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.id, jobIds)))
    : [];
  const jobLabel = (id: string) => {
    const j = jobs.find(x => x.id === id);
    return j ? (j.site ? `${j.ref} · ${j.site}` : j.ref) : null;
  };

  // The books first.
  const live = ledger.state === 'linked' ? await liveProfit(tenantId, today) : { figures: NO_FIGURES, note: null };
  const upload = uploads[0] ?? null;
  const uploaded = upload ? parseFigures(upload.figures) : NO_FIGURES;

  // SiteVIP's own: invoices sent and not paid, supplier bills in and not closed.
  const stats = moneyStats(bills);
  const owedBills = bills.filter(b => b.state === 'sent');
  const billedOrders = orders.filter(o => o.state === 'billed' && o.billTotalCents !== null);
  const ownFigures: Figures = {
    ...NO_FIGURES,
    owedToUs: owedBills.length ? stats.owedCents : null,
    weOwe: billedOrders.length ? billedOrders.reduce((t, o) => t + (o.billTotalCents ?? 0), 0) : null,
  };
  const billsOverOrder = billedOrders.filter(o => !o.matchedAt && (o.billTotalCents ?? 0) > o.totalCents).length;

  const figures = mergeFigures(live.figures, uploaded, ownFigures);
  const sources: Partial<Record<FigureKey, Source>> = {};
  for (const k of Object.keys(NO_FIGURES) as FigureKey[]) {
    if (live.figures[k] !== null) sources[k] = 'ledger';
    else if (uploaded[k] !== null) sources[k] = 'upload';
    else if (ownFigures[k] !== null) sources[k] = 'sitevip';
  }

  const run = runs[0];
  const payRun: PayRunState = !run ? 'none'
    : run.exportedAt ? 'sent'
    : parseIssues(run.issues).length ? 'issues'
    : run.checkedAt ? 'checked' : 'none';
  const switched = switches.some(s => s.state === 'spec');
  const payTo = switched ? 'Angus Shield' : payrollSystems[0]?.name ?? 'your payroll';
  const payroll = payrollFlow(entries, jobLabel, payRun, payTo);

  const needs = whatNeedsYou({
    figures,
    timesheetsWaiting: payroll.waiting,
    invoicesToChase: stats.chasesDue,
    overdueCents: stats.overdueCents,
    billsOverOrder,
    payRun,
    ledger: ledger.state,
    uploadedAt: upload && sources.cash === 'upload' ? upload.createdAt : null,
    today,
  });

  return {
    figures, sources, overdueCents: stats.overdueCents, billsOverOrder, ledger,
    upload: upload ? { fileName: upload.fileName, at: upload.createdAt } : null,
    ledgerNote: live.note, needs, payroll, week: days[0],
  };
}
