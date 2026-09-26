/**
 * Reading the whole business out, for the export.
 *
 * ── One query per sheet, never one per row ───────────────────────────────────────────────────────
 *
 * An export touches every table this business has, which makes it exactly the place a well-meaning
 * loop turns into thousands of round trips. /org took the site down on 25 September doing that with
 * sixty roles; this would do it with a year of timesheets. So every sheet is one `select`, and the
 * joining happens in memory.
 *
 * ── Scoped by tenant, every single query ─────────────────────────────────────────────────────────
 *
 * Row-level security already stands behind this, and that is the guarantee that counts. The
 * `eq(tenantId)` on every line is the second one: a file called "everything" is the one place where
 * a missing scope would hand one business another's records, and belt and braces is cheap here.
 */
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Sheet } from './export-everything';

const date = (v: string | null | undefined) => v ?? '';

/**
 * Every sheet, for one business.
 *
 * The order is the order the Admin screen promises them in, so what somebody was shown and what
 * they receive are the same list in the same sequence.
 */
export async function sheetsFor(tenantId: string): Promise<Sheet[]> {
  const t = eq(schema.jobs.tenantId, tenantId);

  const [jobs, quotes, customers, people, roles, timesheets, leave, training, licences,
         safety, compliance, invoices, documents] = await Promise.all([
    db.select().from(schema.jobs).where(t),
    db.select().from(schema.quotes).where(eq(schema.quotes.tenantId, tenantId)),
    db.select().from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, tenantId)),
    db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
    db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenantId)),
    db.select().from(schema.timesheetEntries).where(eq(schema.timesheetEntries.tenantId, tenantId)),
    db.select().from(schema.leaveEntries).where(eq(schema.leaveEntries.tenantId, tenantId)),
    db.select().from(schema.trainingRecords).where(eq(schema.trainingRecords.tenantId, tenantId)),
    db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, tenantId)),
    db.select().from(schema.safetyReports).where(eq(schema.safetyReports.tenantId, tenantId)),
    db.select().from(schema.complianceItems).where(eq(schema.complianceItems.tenantId, tenantId)),
    db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId)),
    db.select().from(schema.peopleRecords).where(eq(schema.peopleRecords.tenantId, tenantId)),
  ]);

  /* Names in front of ids, so a row reads as a sentence rather than as a lookup. */
  const personName = new Map(people.map(p => [p.id, p.name]));
  const roleTitle = new Map(roles.map(r => [r.id, r.title]));
  const jobName = new Map(jobs.map(j => [j.id, j.title ?? j.id]));
  const customerName = new Map(customers.map(c => [c.id, c.name]));

  return [
    {
      file: 'jobs.csv',
      about: 'Jobs, with their value, site and stage',
      header: ['Ref', 'Job', 'Client', 'Site', 'Stage', 'Value (cents)', 'Materials (cents)', 'Job id', 'Customer id'],
      rows: jobs.map(j => [
        j.ref, j.title, j.client, j.site, j.stage, j.valueCents, j.materialsCents ?? '',
        j.id, j.organisationId ?? '',
      ]),
    },
    {
      file: 'quotes.csv',
      about: 'Quotes and what happened to them',
      header: ['Ref', 'Job', 'Status', 'Markup %', 'Sent', 'Quote id', 'Job id'],
      rows: quotes.map(q => [
        q.ref, jobName.get(q.jobId) ?? '', q.status, q.markupPct, date(q.sentAt), q.id, q.jobId,
      ]),
    },
    {
      file: 'customers.csv',
      about: 'Customers and everything recorded against them',
      header: ['Customer', 'Address', 'Phone', 'Customer id'],
      rows: customers.map(c => [c.name, c.address, c.phone, c.id]),
    },
    {
      file: 'people.csv',
      about: 'People, their contact details and when they started',
      header: ['Name', 'Email', 'Phone', 'Started', 'Seat', 'Subcontractor', 'Inducted', 'Person id'],
      rows: people.map(p => [
        p.name, p.email ?? '', p.phone ?? '', date(p.startDate), p.seatKind ?? '',
        p.isSubcontractor ? 'yes' : 'no', date(p.inductedAt), p.id,
      ]),
    },
    {
      file: 'roles.csv',
      about: 'The org chart — who does what, and who reports to whom',
      header: ['Role', 'Level', 'Reports to', 'Stream', 'Role id'],
      rows: roles.map(r => [
        r.title, r.level, roleTitle.get(r.reportsToRoleId ?? '') ?? '', r.stream ?? '', r.id,
      ]),
    },
    {
      file: 'timesheets.csv',
      about: 'Hours worked, by person and job',
      header: ['Person', 'Job', 'Day', 'Started', 'Finished', 'Minutes', 'Break (min)', 'Billable', 'Job id'],
      rows: timesheets.map(e => [
        e.personName, jobName.get(e.jobId ?? '') ?? '', e.day, date(e.startedAt), date(e.finishedAt),
        e.minutes, e.breakMinutes, e.billable ? 'yes' : 'no', e.jobId ?? '',
      ]),
    },
    {
      file: 'leave.csv',
      about: 'Leave booked, approved and declined',
      header: ['Person', 'Kind', 'From', 'To', 'State', 'Person id'],
      rows: leave.map(l => [
        personName.get(l.staffId ?? '') ?? '', l.kind, l.fromDate, l.toDate, l.state, l.staffId ?? '',
      ]),
    },
    {
      file: 'training.csv',
      about: 'Training records and results',
      header: ['Person', 'Module', 'Progress %', 'Result %', 'Completed', 'Person id'],
      rows: training.map(r => [
        personName.get(r.staffId ?? '') ?? '', r.moduleId, r.progress, r.resultPct ?? '',
        date(r.completedAt), r.staffId ?? '',
      ]),
    },
    {
      file: 'licences.csv',
      about: 'Licences and tickets, with their expiry',
      header: ['Person', 'What', 'Expires', 'Evidence', 'Person id'],
      rows: licences.map(o => [
        personName.get(o.staffId ?? '') ?? '', o.what, date(o.expiresAt), o.evidence ?? '', o.staffId ?? '',
      ]),
    },
    {
      file: 'safety.csv',
      about: 'Safety: incidents, reports and what was done',
      header: ['Kind', 'What happened', 'Job', 'Severity', 'State', 'Notifiable', 'When', 'Report id'],
      rows: safety.map(s2 => [
        s2.kind, s2.text, s2.jobRef ?? '', s2.severity ?? '', s2.state ?? '',
        s2.notifiable ? 'yes' : 'no', date(s2.createdAt), s2.id,
      ]),
    },
    {
      file: 'compliance.csv',
      about: 'Compliance: licences, certificates, insurance and obligations',
      header: ['What', 'Kind', 'Covers', 'Expires', 'Satisfied', 'Reference', 'Item id'],
      rows: compliance.map(c => [
        c.title, c.kind, c.covers ?? '', date(c.expiresAt), date(c.satisfiedAt), c.reference ?? '', c.id,
      ]),
    },
    {
      file: 'money.csv',
      about: 'Purchase orders and what they were for',
      header: ['Ref', 'Supplier', 'What', 'Job', 'Total (cents)', 'State', 'Expected', 'Order id'],
      rows: invoices.map(o => [
        o.ref, o.supplier, o.what ?? '', jobName.get(o.jobId ?? '') ?? '', o.totalCents,
        o.state, date(o.expectedAt), o.id,
      ]),
    },
    {
      file: 'contracts.csv',
      about: 'Employment records: contracts sent, signed and due for review',
      header: ['Person', 'Kind', 'State', 'Steps done', 'Sent', 'Signed', 'Review', 'Record id'],
      rows: documents.map(d => [
        d.personName, d.kind, d.state, d.stepsDone, date(d.sentAt), date(d.signedAt),
        date(d.reviewAt), d.id,
      ]),
    },
  ];
}
