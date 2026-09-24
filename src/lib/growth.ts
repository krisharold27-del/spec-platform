/**
 * Growth, made to happen on its own.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September, on the three streams: Growth is *"making sure new work is coming in steadily"*.
 * Then, shown that Growth was the least automatic of the three — 30% of its steps against
 * Commercial's 64% — *"growth automation gap - thats our weakest and most important"*.
 *
 * He is right that it is the most important, and the reason it was weakest is worth naming, because
 * it is not an accident and it will happen again if nobody writes it down.
 *
 * **Winning work feels like judgement, so it got built as screens to look at.** Chasing a quote,
 * ringing a customer who has gone quiet, noticing a tender closes Friday — every one of those feels
 * like something a person decides, so every one was built as a list somebody has to open. And a
 * list somebody has to open is a list that does not get opened in the week everybody is flat out,
 * which is exactly the week that decides whether there is work in six.
 *
 * That is the whole mechanism behind the thing every trade business does: quoting stops when
 * everybody is busy, and the hole appears six weeks later when it is already too late to fix. It is
 * not a discipline problem. It is a system that asked for discipline at the one moment there was
 * none going spare.
 *
 * ── The test each of these has to pass ───────────────────────────────────────────────────────────
 *
 * Not "is there a screen for it" — there was. **Does it still happen in the week nobody looks?**
 *
 * So everything here is a derivation over data SPEC already holds, computed whether or not anybody
 * opens anything. Nothing below needs a person to remember, and nothing below invents a number: the
 * jobs, the dates and the values are the business's own.
 *
 * ── The precedent this follows deliberately ──────────────────────────────────────────────────────
 *
 * `lib/billing-job` has chased debtors at 7, 14 and 30 days without anybody remembering since
 * September. Money already earned is chased automatically; money about to be earned is not, and
 * nobody ever decided that — the invoice side simply got built by somebody thinking about cash and
 * the quote side got built by somebody thinking about screens. A quote that goes quiet is the
 * cheapest work a business will ever win walking out of the door, and it walks out silently.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * 1. Quotes that chase themselves
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * When a quote gets chased, in days since it went.
 *
 * Tighter than the invoice ladder of 7, 14 and 30, because the two are not the same animal. An
 * invoice is owed and will still be owed in a month. A quote is a decision being made right now, by
 * somebody who is probably holding two other prices, and a week of silence is usually somebody else
 * getting the job rather than a customer thinking.
 *
 * Three touches and then stop. A fourth does not win work; it loses the next job as well.
 */
export const QUOTE_CHASE = [3, 7, 14] as const;

/** Past this with no answer, it is not live. Saying so is what keeps a pipeline honest. */
export const GONE_COLD_DAYS = 21;

export type ChaseDay = (typeof QUOTE_CHASE)[number];

export interface SentQuote {
  id: string;
  ref: string;
  client: string;
  valueCents: number;
  /** When it went to the customer. ISO. */
  sentAt: string;
  /** Days already chased, so the same one never goes twice. */
  chasedDays?: readonly number[];
  /** Set once they answer, either way. A quote with an answer is never chased. */
  answeredAt?: string | null;
}

export type QuoteState = 'waiting' | 'chase' | 'cold' | 'answered';

export interface QuoteWatch {
  quote: SentQuote;
  state: QuoteState;
  daysOut: number;
  /** Which chase is due right now, or null. */
  due: ChaseDay | null;
  says: string;
}

const daysBetween = (from: string, at: Date): number =>
  Math.floor((at.getTime() - Date.parse(from)) / 86_400_000);

/**
 * What is happening to one quote, worked out rather than asked about.
 *
 * `due` is the LAST chase that has come round and not been done, not the first. A quote eleven days
 * out that nobody has touched needs the day-seven chase now, not the day-three one — sending the
 * gentle first nudge eleven days late reads as a business that has not been paying attention,
 * which is precisely what it is.
 */
export function quoteWatch(q: SentQuote, at: Date = new Date()): QuoteWatch {
  if (q.answeredAt) {
    return { quote: q, state: 'answered', daysOut: daysBetween(q.sentAt, at), due: null, says: 'Answered.' };
  }
  const daysOut = daysBetween(q.sentAt, at);
  const done = new Set(q.chasedDays ?? []);
  const owed = QUOTE_CHASE.filter(d => daysOut >= d && !done.has(d));
  const due = owed.length ? owed[owed.length - 1] : null;

  if (daysOut >= GONE_COLD_DAYS) {
    return {
      quote: q, state: 'cold', daysOut, due: null,
      says: `${daysOut} days out with no answer. Call it — either ring them today or mark it lost, because a quote sitting here is a number the pipeline is counting and the business is not getting.`,
    };
  }
  if (due) {
    return {
      quote: q, state: 'chase', daysOut, due,
      says: `Sent ${daysOut} days ago. The ${due}-day chase is ready to go.`,
    };
  }
  return { quote: q, state: 'waiting', daysOut, due: null, says: `Sent ${daysOut} days ago.` };
}

/**
 * What the chase actually says, drafted — a different message each time.
 *
 * Three copies of "just following up on the below" is what makes somebody stop replying, so each
 * one does a different job: the first assumes it was missed, the second offers to change something,
 * and the third gives them an easy way out. The third is the one businesses will not send, and it
 * is the one that gets the most answers — people reply to being let off the hook.
 *
 * Drafted, never sent without somebody seeing it. A business's voice is its own, and an automatic
 * message in the wrong tone costs more than a quote.
 */
export function chaseDraft(q: SentQuote, day: ChaseDay, business: string): string {
  const who = q.client.trim().split(/\s+/)[0] || 'there';
  if (day === 3) {
    return `Hi ${who}, just making sure the quote for ${q.ref} came through — they do sometimes land in junk. Happy to go through it if anything needs explaining. ${business}`;
  }
  if (day === 7) {
    return `Hi ${who}, following up on ${q.ref}. If the price or the timing is not quite right, tell me and I will see what I can do — it is easier to adjust it than to start again. ${business}`;
  }
  return `Hi ${who}, last one from me on ${q.ref}. If you have gone another way that is completely fine, just let me know and I will close it off. If not, I am still happy to do it. ${business}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 2. Work worth going back for
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * New work made out of customers a business already has.
 *
 * ── The cheapest work there is ───────────────────────────────────────────────────────────────────
 *
 * A trade business's best lead is somebody it has already done work for: they know the crew, the
 * price is not being tested against three others, and nobody had to pay for the enquiry. Every
 * business knows this and almost none of them work it, for the ordinary reason — the information is
 * in the job history and nobody has time to read four years of jobs looking for who has gone quiet.
 *
 * SPEC already holds every job, every customer and every date. So this is not a feature that needs
 * data collecting for it; it is a question nobody has asked of data that is already there.
 */
export interface CustomerHistory {
  key: string;
  name: string;
  /** Every job for them, any stage. ISO dates, any order. */
  jobs: { at: string; valueCents: number }[];
}

export type BackReason = 'pattern' | 'lapsed';

export interface WorthGoingBack {
  key: string;
  name: string;
  reason: BackReason;
  /** Days since their last job. */
  quiet: number;
  /** What they have been worth, in total. Ranks the list. */
  worthCents: number;
  /** For `pattern`: how often they normally come back, in days. */
  everyDays: number | null;
  says: string;
}

/**
 * Below this many jobs there is no pattern, only coincidence.
 *
 * Three jobs gives two gaps, which is the fewest that can disagree with each other. Two jobs gives
 * one gap, and one gap is not a rhythm — calling somebody because their single previous job was a
 * year ago is how a business rings people who were never coming back and stops trusting the list.
 */
export const PATTERN_NEEDS = 3;

/** How far past their own rhythm somebody has to be before it means anything. */
export const OVERDUE_BY = 1.15;

/** No pattern, but this long without a job is worth a call on its own. */
export const LAPSED_DAYS = 540;

const median = (ns: number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const months = (days: number): string => {
  const m = Math.round(days / 30.4);
  if (m < 1) return 'less than a month';
  if (m === 1) return 'a month';
  if (m < 18) return `${m} months`;
  const y = Math.round(days / 365);
  return y === 1 ? 'a year' : `${y} years`;
};

export function worthGoingBackFor(
  customers: readonly CustomerHistory[],
  at: Date = new Date(),
): WorthGoingBack[] {
  const out: WorthGoingBack[] = [];

  for (const c of customers) {
    if (c.jobs.length === 0) continue;
    const dates = c.jobs.map(j => Date.parse(j.at)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    if (dates.length === 0) continue;

    const worthCents = c.jobs.reduce((n, j) => n + (j.valueCents || 0), 0);
    const quiet = Math.floor((at.getTime() - dates[dates.length - 1]) / 86_400_000);

    if (dates.length >= PATTERN_NEEDS) {
      /*
        The median gap, not the average. One job four years ago and three in the last six months
        gives an average that describes neither — the median says what this customer usually does.
      */
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) gaps.push(Math.round((dates[i] - dates[i - 1]) / 86_400_000));
      const everyDays = median(gaps);
      if (everyDays > 0 && quiet > everyDays * OVERDUE_BY) {
        out.push({
          key: c.key, name: c.name, reason: 'pattern', quiet, worthCents, everyDays,
          says: `Normally back about every ${months(everyDays)}. It has been ${months(quiet)}.`,
        });
        continue;
      }
    }

    if (quiet >= LAPSED_DAYS) {
      out.push({
        key: c.key, name: c.name, reason: 'lapsed', quiet, worthCents, everyDays: null,
        says: `Nothing for ${months(quiet)}. Worth finding out whether they went somewhere else or simply have not needed anybody.`,
      });
    }
  }

  /*
    Ranked by what they have been worth, not by how long they have been quiet. A business has time
    to ring five people this week, and the five worth ringing are the ones with the most behind
    them — the longest-quiet list puts the smallest customers at the top, every time.
  */
  return out.sort((a, b) => b.worthCents - a.worthCents);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 3. Tenders that do not close by accident
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * A tender that closes while nobody was looking.
 *
 * The workflow said "submitted before it closes, or declined on purpose rather than by accident",
 * and the accident is the whole problem — a closing date in somebody's inbox is a closing date that
 * passes on the one week the estimator is covering for somebody else. SPEC has the date. It should
 * be the thing that is sure, not the person.
 */
export const TENDER_WARN_DAYS = 5;

export type TenderState = 'closed' | 'today' | 'soon' | 'open' | 'submitted';

export interface Tender {
  id: string;
  title: string;
  client: string;
  closesAt: string;
  submittedAt?: string | null;
}

export interface TenderWatch {
  tender: Tender;
  state: TenderState;
  daysLeft: number;
  says: string;
}

export function tenderWatch(t: Tender, at: Date = new Date()): TenderWatch {
  const daysLeft = Math.ceil((Date.parse(t.closesAt) - at.getTime()) / 86_400_000);
  if (t.submittedAt) {
    return { tender: t, state: 'submitted', daysLeft, says: 'Submitted.' };
  }
  if (daysLeft < 0) {
    return {
      tender: t, state: 'closed', daysLeft,
      says: `Closed ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'} ago and nothing went in. Worth knowing why — it is the only one of these that cannot be fixed.`,
    };
  }
  if (daysLeft === 0) {
    return { tender: t, state: 'today', daysLeft, says: 'Closes TODAY. Nothing has gone in yet.' };
  }
  if (daysLeft <= TENDER_WARN_DAYS) {
    return {
      tender: t, state: 'soon', daysLeft,
      says: `Closes in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}. Enough time to do it properly, and not much more.`,
    };
  }
  return { tender: t, state: 'open', daysLeft, says: `Closes in ${daysLeft} days.` };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What Growth is doing, in one line
 * ───────────────────────────────────────────────────────────────────────────── */

export interface GrowthPulse {
  chasesReady: number;
  goingCold: number;
  toRingBack: number;
  closingSoon: number;
  missedTenders: number;
}

/**
 * The whole stream in a sentence, and it leads with the thing that is about to be lost.
 *
 * Order matters. A tender closing today cannot be recovered tomorrow; a quote going cold is nearly
 * gone; a customer who has been quiet eighteen months will still be there next week. So the line
 * reads in the order things stop being possible, not in the order they are pleasant to hear.
 */
export function growthLine(p: GrowthPulse): string {
  const bits: string[] = [];
  if (p.closingSoon) bits.push(`${p.closingSoon} ${p.closingSoon === 1 ? 'tender closes' : 'tenders close'} within the week`);
  if (p.goingCold) bits.push(`${p.goingCold} ${p.goingCold === 1 ? 'quote has' : 'quotes have'} gone quiet`);
  if (p.chasesReady) bits.push(`${p.chasesReady} ${p.chasesReady === 1 ? 'chase is' : 'chases are'} written and ready`);
  if (p.toRingBack) bits.push(`${p.toRingBack} ${p.toRingBack === 1 ? 'customer is' : 'customers are'} worth ringing back`);
  if (bits.length === 0) return 'Nothing waiting. Every quote is either answered or too new to chase.';
  return `${bits.slice(0, -1).join(', ')}${bits.length > 1 ? ' and ' : ''}${bits[bits.length - 1]}.`;
}
