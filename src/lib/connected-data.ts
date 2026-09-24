/**
 * The rule that decides whether a business can ever leave the system it came from.
 *
 * ── Kris's question, 24 September ────────────────────────────────────────────────────────────────
 *
 * *"can the job management system be set up that another system can be connected and the data feeds
 * into it and then IF the business chooses to turn off simPRO for example it continues without any
 * issues"*
 *
 * Yes — and it is true only because of one rule, which is written here so it stays true.
 *
 * ── Two kinds of connector, and the difference is everything ─────────────────────────────────────
 *
 * **1. Systems SPEC REPLACES.** Job management, CRM, safety, payroll. SPEC has its own `jobs`,
 * `quotes`, `schedule_bookings`, `timesheet_entries`, `catalogue_items`, `job_bills` — a complete
 * job system that happens to accept an import. A connector here has one job: move rows from the
 * other system into SPEC's own tables and keep them up to date.
 *
 *   So the day a business switches simPRO off, every job, quote, timesheet and invoice is already
 *   SPEC's own row in SPEC's own database. Nothing empties. The only thing that stops is new rows
 *   arriving — which is exactly what the business decided.
 *
 *   The rule that makes it true: **no screen reads from a replaced system at render time.** Broken
 *   once, the promise is gone — that screen goes blank the day the system is switched off, and a
 *   business that finds one blank screen cannot trust there are not five more. The screen that
 *   reads live looks identical to the one that does not, right up until the day it matters, which
 *   is why this is a test rather than a paragraph in a design document.
 *
 * **2. Systems SPEC DOES NOT REPLACE.** The financial system, and only that.
 *
 *   Kris, 24 September: *"xero is the financial system and stays — i dont want to make a financial
 *   system — YET"*. So SPEC reads the ledger and never tries to be it. Turning Xero off genuinely
 *   does take the P&L away, and that is CORRECT rather than a gap: a business's accountant, its
 *   bank and the tax office all work from that system, and a second set of books inside SPEC would
 *   be a liability rather than a feature.
 *
 *   Reading it live is therefore allowed here — it is the only category where it is. The "YET" is
 *   deliberate: this is a decision about today, not a law, and `REPLACES` below is where it would
 *   change.
 *
 * ── What that means for a connector in category 1 ────────────────────────────────────────────────
 *
 *   • It runs on a schedule or on a webhook, never in a page render.
 *   • It writes rows SPEC owns, with SPEC's own ids.
 *   • It records where each row came from, so a re-sync updates rather than duplicates.
 *   • When it stops, the rows stay. They simply stop being updated, and the screen says so —
 *     honestly, with the date of the last sync, rather than pretending the numbers are current.
 *
 * The last point is the one people forget. Data that has stopped being updated is not the same as
 * data that is wrong, and a business mid-changeover needs to be told which it is looking at.
 */

/**
 * The categories SPEC takes over, and the one it does not.
 *
 * `financials` is deliberately absent from `REPLACES`. Everything else a business might already run
 * is something SPEC can become; the ledger is not, for now. Moving a category into this list is a
 * decision about what SPEC IS, so it is made here in one place rather than implied by whichever
 * connector somebody writes next.
 */
export const REPLACES = ['job_management', 'crm', 'safety', 'payroll'] as const;

/** Read from, never replaced. The business's accountant, bank and tax office all work from it. */
export const READS_ONLY = ['financials'] as const;

export const replacesIt = (category: string): boolean =>
  (REPLACES as readonly string[]).includes(category);

/** The categories a business can run somewhere else. Matches `system_connections.category`. */
export const CONNECTABLE = [
  'job_management', 'financials', 'safety', 'crm', 'payroll', 'other',
] as const;

export type Connectable = (typeof CONNECTABLE)[number];

/**
 * How fresh connected data is, said plainly.
 *
 * A business that has turned the other system off should see its own numbers with an honest note on
 * them, not a silent staleness. "As at 14 October" is a fact somebody can act on; a number with no
 * date is a number that quietly becomes a lie.
 */
export type Freshness =
  | { state: 'live'; says: string }
  | { state: 'stale'; says: string }
  | { state: 'stopped'; says: string }
  | { state: 'never'; says: string };

/** Past this, a feed that claims to be live is not. */
export const STALE_HOURS = 36;

export function freshness(
  conn: { status: string; lastSyncAt: string | null; name: string; category: string } | null,
  now: Date = new Date(),
): Freshness {
  if (!conn) return { state: 'never', says: 'Nothing connected — these are SPEC’s own numbers.' };
  if (!conn.lastSyncAt) {
    return { state: 'never', says: `${conn.name} is connected but has not sent anything yet.` };
  }
  const hours = (now.getTime() - Date.parse(conn.lastSyncAt)) / 3_600_000;
  const day = conn.lastSyncAt.slice(0, 10);

  if (conn.status === 'live' && hours <= STALE_HOURS) {
    return { state: 'live', says: `From ${conn.name}, up to date.` };
  }
  if (conn.status === 'live') {
    return {
      state: 'stale',
      says: replacesIt(conn.category)
        ? `From ${conn.name}, last updated ${day}. Still SPEC’s own rows — they have just stopped being refreshed.`
        : `From ${conn.name}, last updated ${day}. Nothing since then has reached SPEC.`,
    };
  }
  /*
    The switched-off case. What it says depends entirely on which kind of system it was, because
    the truth is different — and telling a business the wrong one is either a false alarm or a
    false comfort.
  */
  return {
    state: 'stopped',
    says: replacesIt(conn.category)
      ? `${conn.name} is no longer connected. Everything up to ${day} is here and stays here — SPEC keeps going on its own from now on.`
      : `${conn.name} is no longer connected, so there are no figures from ${day} on. SPEC does not keep its own set of books — reconnect it to see them again.`,
  };
}

/**
 * Can this business switch the other system off without losing anything?
 *
 * The honest answer is yes whenever the rows are SPEC's, which under the rule above is always. What
 * it checks is the thing somebody would actually want to know first: how much is already here.
 */
export function canStandAlone(rows: { jobs: number; quotes: number; timesheets: number }): {
  ok: boolean;
  says: string;
} {
  /*
    Answers only for the work SPEC replaces. The ledger is not part of this question and saying it
    was would be the one dishonest sentence in the file: a business that turned Xero off on the
    strength of it would find its P&L gone.
  */
  const total = rows.jobs + rows.quotes + rows.timesheets;
  if (total === 0) {
    return {
      ok: false,
      says: 'Nothing has come across yet. Let the connection run first — once it has, the rows are SPEC’s and the other system can be turned off whenever you like.',
    };
  }
  return {
    ok: true,
    says: `${rows.jobs.toLocaleString('en-AU')} jobs, ${rows.quotes.toLocaleString('en-AU')} quotes and ${rows.timesheets.toLocaleString('en-AU')} timesheet entries are already SPEC’s own rows in SPEC’s own database. Turning the other system off stops new ones arriving. It takes nothing away.`,
  };
}
