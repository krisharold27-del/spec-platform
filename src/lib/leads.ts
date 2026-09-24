/**
 * Where the work comes from, and how fast it gets quoted.
 *
 * ── Outsimple them: a lead is an enquiry ─────────────────────────────────────────────────────────
 *
 * SimPro has leads and jobs as separate things, which means the same piece of work lives in two
 * lists and somebody has to move it between them. A lead is an enquiry, an enquiry is already the
 * first stage of the Jobs board, and two columns on the job it already is give the whole Leads tab.
 *
 * The number that matters is not how many leads there are. It is **how long the oldest one has been
 * waiting**, because work quoted on day four is usually work somebody else has already won.
 */

/** The 2-day target from the design. Quoted inside two days, or it is slipping. */
export const QUOTE_TARGET_DAYS = 2;

export const SOURCES = [
  'Website form', 'Google', 'Missed call', 'Repeat customer', 'Builder or plans', 'Referral', 'Other',
] as const;

export type Source = (typeof SOURCES)[number];

export const isSource = (v: string): v is Source => (SOURCES as readonly string[]).includes(v);

export type LeadLight = 'green' | 'amber' | 'red';

export interface Lead {
  id: string;
  ref: string;
  title: string;
  client: string;
  stage: string;
  source: string | null;
  createdAt: string;
  quotedAt: string | null;
  valueCents: number;
}

const days = (from: string, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - Date.parse(from)) / 86_400_000));

/** How old an unquoted enquiry is. Green under two days, amber at two, red at three or more. */
export function ageLight(d: number): LeadLight {
  if (d < QUOTE_TARGET_DAYS) return 'green';
  if (d === QUOTE_TARGET_DAYS) return 'amber';
  return 'red';
}

export interface Waiting { lead: Lead; days: number; light: LeadLight; says: string }

/** Every enquiry still waiting for a quote, oldest first — the list the tab exists for. */
export function waitingForQuote(leads: readonly Lead[], at: Date = new Date()): Waiting[] {
  return leads
    .filter(l => l.stage === 'enquiry' && !l.quotedAt)
    .map(l => {
      const d = days(l.createdAt, at);
      return {
        lead: l,
        days: d,
        light: ageLight(d),
        says: d === 0 ? 'Came in today.'
          : d < QUOTE_TARGET_DAYS ? `${d} ${d === 1 ? 'day' : 'days'} old.`
            : `${d} days waiting — past the ${QUOTE_TARGET_DAYS}-day target.`,
      };
    })
    .sort((a, b) => b.days - a.days);
}

/**
 * Speed to quote, measured on enquiries that actually got quoted.
 *
 * Null when nothing has been quoted yet: an average of nothing is not zero days, and showing zero
 * would read as the best possible score for a business that has quoted nobody.
 */
export function speedToQuote(leads: readonly Lead[]): number | null {
  const quoted = leads.filter(l => l.quotedAt);
  if (quoted.length === 0) return null;
  const total = quoted.reduce((t, l) => t + days(l.createdAt, new Date(l.quotedAt!)), 0);
  return Math.round((total / quoted.length) * 10) / 10;
}

export interface SourceRow { source: string; came: number; quoted: number; won: number; wonCents: number }

/**
 * Where the work came from, counted. Counts, quoted, won — the design's three columns.
 *
 * Sorted by what was WON rather than by what came in, because the useful question is not which
 * source is loudest, it is which one is worth answering first on a Monday.
 */
export function bySource(leads: readonly Lead[]): SourceRow[] {
  const WON = ['won', 'scheduled', 'onsite', 'invoiced', 'paid'];
  const map = new Map<string, SourceRow>();
  for (const l of leads) {
    const source = l.source ?? 'Not recorded';
    const row = map.get(source) ?? { source, came: 0, quoted: 0, won: 0, wonCents: 0 };
    row.came += 1;
    if (l.quotedAt) row.quoted += 1;
    if (WON.includes(l.stage)) { row.won += 1; row.wonCents += l.valueCents; }
    map.set(source, row);
  }
  return [...map.values()].sort((a, b) => b.won - a.won || b.came - a.came);
}

export interface LeadStats { waiting: number; late: number; speed: number | null; oldest: number }

export function leadStats(leads: readonly Lead[], at: Date = new Date()): LeadStats {
  const w = waitingForQuote(leads, at);
  return {
    waiting: w.length,
    late: w.filter(x => x.days >= QUOTE_TARGET_DAYS).length,
    speed: speedToQuote(leads),
    oldest: w[0]?.days ?? 0,
  };
}

/** The headline, which leads on the oldest thing waiting rather than on a count. */
export function leadLine(s: LeadStats): string {
  if (s.late > 0) {
    return `${s.late} ${s.late === 1 ? 'enquiry is' : 'enquiries are'} past the ${QUOTE_TARGET_DAYS}-day target — the oldest has waited ${s.oldest} days.`;
  }
  if (s.waiting > 0) return `${s.waiting} waiting, none past the target yet.`;
  if (s.speed !== null) return `Nothing waiting. Quoting in ${s.speed} days on average.`;
  return 'No enquiries yet.';
}
