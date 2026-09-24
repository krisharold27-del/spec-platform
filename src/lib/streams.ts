/**
 * The three streams a trade business runs on, and the one seat above them.
 *
 * ── Kris, 24 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"there are three main streams in a successful trade business - even transport business - COGS -
 * Commercial making sure money is in order more in than out, Operations getting the work done
 * safely and Growth making sure new work is coming in steadily - all focused on solving problems
 * and maximising business potential"*.
 *
 * This is the spine, and it was already half-built without being named: `provisionTenant` has been
 * creating a General Manager with a Commercial Manager, an Operations Manager and a Growth Manager
 * under them since the first chart. Those four seats ARE this model. It has just never existed
 * anywhere a screen could read it, which is why every list in SPEC has so far been grouped by the
 * part of the product it lives in rather than by the part of the business that owns it.
 *
 * ── Why three and not four ───────────────────────────────────────────────────────────────────────
 *
 * The obvious fourth is People, and it is deliberately not one. A business that files its people
 * under a separate stream is a business where safety and hiring are somebody else's problem, and
 * the whole argument of SPEC is that getting the work done SAFELY is one job rather than two. So
 * people, safety and compliance sit inside Operations, next to the work they protect.
 *
 * Money is one stream for the same reason. Kris puts COGS and "more in than out" together, and
 * they belong together: a business that watches its debtors and not its material costs is watching
 * one end of a pipe.
 *
 * ── The seat above ───────────────────────────────────────────────────────────────────────────────
 *
 * `whole` is not a fourth stream. It is the work that belongs to whoever runs the business — the
 * weekly rhythm, the month being scored, the chart itself — and it exists as a value so that work
 * cannot be quietly filed under a stream that does not own it. A General Manager's job is to hold
 * the three together, and that job has its own workflows.
 *
 * ── What they have in common ─────────────────────────────────────────────────────────────────────
 *
 * Kris's last clause is the one that makes them one system rather than three departments: *"all
 * focused on solving problems and maximising business potential"*. Every stream finds problems,
 * and what a business does with what it finds is the Snap Score — which is why that is the
 * twenty-fifth measure on the Power Meter and not a page somewhere.
 */

export type StreamKey = 'commercial' | 'operations' | 'growth';

/** Including the seat above the three. Not a stream — see the note on `whole`. */
export type Owner = StreamKey | 'whole';

export interface Stream {
  key: StreamKey;
  label: string;
  /** Kris's own words for what this stream is for. */
  is: string;
  /** The one question this stream answers every week. */
  asks: string;
  /** The seat on a default chart that carries it. */
  seat: string;
  /** What going wrong here looks like, before the numbers show it. */
  slips: string;
}

export const STREAMS: Stream[] = [
  {
    key: 'commercial',
    label: 'Commercial',
    is: 'Making sure the money is in order — more in than out, and what the work costs under control.',
    asks: 'Is there more coming in than going out, and did the work make what it was meant to?',
    seat: 'Commercial Manager',
    slips: 'Jobs finish, invoices go late, and nobody notices the margin went with them. The business looks busy right up until the day it cannot make payroll.',
  },
  {
    key: 'operations',
    label: 'Operations',
    is: 'Getting the work done, safely — the crews, the jobs, the people and everything that keeps them right.',
    asks: 'Did the work get done, did it get done properly, and did everybody go home the way they arrived?',
    seat: 'Operations Manager',
    slips: 'Everything gets done and nothing gets recorded. It holds until the day somebody is hurt or a builder asks for a TRIFR, and then none of it can be proved.',
  },
  {
    key: 'growth',
    label: 'Growth',
    is: 'Making sure new work keeps coming in, steadily — not in the panic after a quiet month.',
    asks: 'Is there enough work coming, and is it the kind worth having?',
    seat: 'Growth Manager',
    slips: 'Quoting stops while everybody is flat out, and the hole appears six weeks later. By the time it is visible it is already too late to fix.',
  },
];

export const STREAM_KEYS: StreamKey[] = STREAMS.map(s => s.key);

export const streamOf = (key: string): Stream | null =>
  STREAMS.find(s => s.key === key) ?? null;

/** What the whole thing is for, under all three. Kris's last clause, kept as one sentence. */
export const WHAT_THEY_SHARE =
  'All three are doing the same job: finding problems and doing something about them, so the business gets everything it is capable of.';

/** The seat above the three. Named here so nothing has to guess at it. */
export const ABOVE = {
  label: 'The whole business',
  seat: 'General Manager',
  is: 'Holding the three together, and deciding when they disagree.',
} as const;

export const ownerLabel = (o: Owner): string =>
  o === 'whole' ? ABOVE.label : (streamOf(o)?.label ?? o);

/**
 * Which stream a Power Meter pillar mostly belongs to.
 *
 * "Mostly" is doing real work in that sentence, and the mapping is shown rather than assumed for
 * the same reason the Power Meter shows its KPI matches: a business that disagrees can see what it
 * is disagreeing with. Compliance is the awkward one — it is genuinely shared, and it is filed
 * under Operations because that is where the evidence is created, not where the risk is carried.
 */
export const PILLAR_STREAM: Record<string, StreamKey> = {
  safety: 'operations',
  people: 'operations',
  earnings: 'commercial',
  compliance: 'operations',
};
