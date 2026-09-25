/**
 * What the rate question needs, from what SPEC already holds.
 *
 * The market rates are the only part SPEC cannot see for itself — there is no feed of what other
 * electricians charge, and inventing one would be the worst possible number to invent. They are
 * entered by the business against a source, and a comparison with none says so.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { readRate, flagged, draftPrice, ENOUGH_QUOTES, type RateFacts, type RateReading, type ByType, type TypeReading, type DraftPrice } from './our-rate';

export interface RateView {
  reading: RateReading;
  byType: TypeReading[];
  /** Leads SPEC has priced in the background, newest first. */
  drafts: { leadId: string; title: string; draft: DraftPrice }[];
  /** Whether anybody has entered what competitors charge. */
  hasMarket: boolean;
}

export async function rateFor(tenantId: string): Promise<RateView> {
  const [rates, jobs] = await Promise.all([
    db.select().from(schema.labourRates)
      .where(eq(schema.labourRates.tenantId, tenantId))
      .orderBy(schema.labourRates.position),
    db.select({
      id: schema.jobs.id, workKind: schema.jobs.workKind, title: schema.jobs.title,
      stage: schema.jobs.stage, quotedAt: schema.jobs.quotedAt, lostAt: schema.jobs.lostAt,
    })
      .from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId)),
  ]);

  /* The first rate is the standard one — see the note on labourRates. What people charge, not cost. */
  const ourCents = rates[0]?.chargeCents ?? null;

  /*
    Won and lost, counted from the jobs themselves. Only quoted work counts either way: a job that
    walked in and was done the same afternoon was never won against anybody, and counting it would
    make every business look like it wins nearly everything.
  */
  const quoted = jobs.filter(j => j.quotedAt || j.lostAt);
  const won = quoted.filter(j => !j.lostAt && j.stage !== 'enquiry' && j.stage !== 'quoted').length;
  const lost = quoted.filter(j => Boolean(j.lostAt)).length;

  /*
    Market rates: nothing is stored for them yet, so this is empty and `readRate` says it only has
    half the picture. Honest rather than convenient — a zero here would read as competitors charging
    nothing, which would make every business look expensive.
  */
  const facts: RateFacts = { ourCents, market: [], won, lost };
  const reading = readRate(facts);

  /* Win rate per kind of work, because an overall rate hides the type being lost every time. */
  const byKind = new Map<string, ByType>();
  for (const j of quoted) {
    const kind = j.workKind ?? 'maintenance';
    const row = byKind.get(kind) ?? { jobType: kind, won: 0, lost: 0, marginPct: null };
    if (j.lostAt) row.lost += 1;
    else if (j.stage !== 'enquiry' && j.stage !== 'quoted') row.won += 1;
    else continue;
    byKind.set(kind, row);
  }
  const overall = won + lost >= ENOUGH_QUOTES ? won / (won + lost) : null;

  return {
    reading,
    byType: flagged([...byKind.values()], overall),
    drafts: await draftsFor(tenantId, ourCents),
    hasMarket: false,
  };
}

/**
 * Every lead SPEC has priced in the background.
 *
 * From pre-builds first, then the median hours of past jobs of the same kind. The estimator checks
 * and sends rather than starting from nothing — which is the difference between quoting today and
 * quoting on Thursday.
 */
async function draftsFor(
  tenantId: string,
  hourlyCents: number | null,
): Promise<{ leadId: string; title: string; draft: DraftPrice }[]> {
  try {
    /*
      An enquiry is a lead here: a job somebody has written down and nobody has priced. SPEC prices
      it in the background so the estimator checks and sends rather than starting from nothing.
    */
    const leads = await db.select({ id: schema.jobs.id, title: schema.jobs.title, workKind: schema.jobs.workKind })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.stage, 'enquiry')))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(10);
    if (leads.length === 0) return [];

    const times = await db.select({ jobId: schema.timesheetEntries.jobId, minutes: schema.timesheetEntries.minutes })
      .from(schema.timesheetEntries).where(eq(schema.timesheetEntries.tenantId, tenantId));
    const jobs = await db.select({ id: schema.jobs.id, workKind: schema.jobs.workKind })
      .from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId));

    /* Hours per finished job, grouped by the kind of work it was. */
    const hoursByKind = new Map<string, number[]>();
    for (const j of jobs) {
      const mins = times.filter(t => t.jobId === j.id).reduce((a, t) => a + (t.minutes ?? 0), 0);
      if (mins <= 0) continue;
      const kind = j.workKind ?? 'maintenance';
      hoursByKind.set(kind, [...(hoursByKind.get(kind) ?? []), Math.round((mins / 60) * 10) / 10]);
    }

    return leads.map(l => {
      const kind = l.workKind ?? 'maintenance';
      return {
        leadId: l.id,
        title: l.title,
        draft: draftPrice({
          jobType: kind,
          pastHours: hoursByKind.get(kind) ?? [],
          hourlyCents,
          materialsCents: 0,
          prebuild: null,
        }),
      };
    });
  } catch {
    return [];
  }
}
