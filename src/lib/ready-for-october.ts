/**
 * Is the business ready to start scoring a month?
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"HR for Monday is add everyone into the system and then make sure they all have a place on the
 * org chart - then set everyones kpis and be ready for the start of october."*
 *
 * Four things, in that order, and the last one is a date. A month that starts with half the crew
 * off the chart cannot be scored honestly afterwards — the numbers would be about whoever happened
 * to be set up in time.
 *
 * ── Why `startHere` was not enough ───────────────────────────────────────────────────────────────
 *
 * `lib/start-here` nudges a new business twice: draw the chart, then set the KPIs. It is scaffolding
 * for the first week and it is deliberately all-or-nothing — it goes quiet as soon as ONE role has
 * its numbers (`rolesWithKpis === 0`). With thirty roles and one done, it says nothing at all.
 *
 * That is right for a nudge and useless for a deadline. Getting a real business live is not "have
 * you started", it is "who exactly is still missing", and the difference between those two
 * questions is a morning of opening screens one at a time looking for gaps.
 *
 * So this NAMES them. Every person with no role, every scored role short of its measures, counted
 * and listed. A list you can work down beats a percentage you cannot act on.
 */

/** The fewest KPIs a scored role needs before a month can be scored on it. */
export const NEED_PER_ROLE = 8;

export interface Person {
  id: string;
  name: string;
  /** The role they hold, or null. A name with no role is a person the month cannot score. */
  roleId: string | null;
}

export interface ScoredRole {
  id: string;
  title: string;
  /** How many active KPIs it has. */
  kpis: number;
  /** Nobody in it. Vacant is a fact about the business, not a setup mistake. */
  vacant: boolean;
}

export interface Readiness {
  ready: boolean;
  /** People in the system with no place on the chart. */
  offChart: Person[];
  /** Roles that will be scored and do not have enough measures yet. */
  short: { id: string; title: string; kpis: number; need: number }[];
  /** Roles nobody holds. Listed, never counted as a fault. */
  vacant: string[];
  says: string;
}

/**
 * What still has to happen before the month starts.
 *
 * `vacant` is reported and never blocks. A business with an unfilled Estimator role is a business
 * with a job to advertise, not a setup that is wrong — and a readiness check that refused to go
 * green until every seat was full would be one nobody could ever satisfy, which is the same as one
 * nobody reads.
 */
export function readyForMonth(month: string, people: readonly Person[], roles: readonly ScoredRole[]): Readiness {
  const offChart = people.filter(p => !p.roleId);
  const short = roles
    .filter(r => !r.vacant && r.kpis < NEED_PER_ROLE)
    .map(r => ({ id: r.id, title: r.title, kpis: r.kpis, need: NEED_PER_ROLE }));
  const vacant = roles.filter(r => r.vacant).map(r => r.title);
  const ready = offChart.length === 0 && short.length === 0;

  const bits: string[] = [];
  if (offChart.length) {
    bits.push(`${offChart.length} ${offChart.length === 1 ? 'person has' : 'people have'} no place on the chart`);
  }
  if (short.length) {
    bits.push(`${short.length} ${short.length === 1 ? 'role needs' : 'roles need'} their KPIs`);
  }

  return {
    ready,
    offChart,
    short,
    vacant,
    says: ready
      ? `Ready for ${month}. Everybody has a place on the chart and every role that will be scored has its numbers.${
          vacant.length ? ` ${vacant.length} ${vacant.length === 1 ? 'role is' : 'roles are'} vacant, which is a job to advertise rather than something to fix here.` : ''
        }`
      : `Not ready for ${month} yet: ${bits.join(', and ')}. They are named below.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   ADDING EVERYBODY AT ONCE

   `addStaff` takes one name per submission. For a business of thirty-five that is thirty-five
   round trips through a form, which is the single largest piece of friction between Kris and a
   business that is live on Monday — and the kind of friction that gets a rollout postponed rather
   than reported as a problem.

   A business's staff list already exists somewhere: a payroll screen, a spreadsheet, a group chat.
   So the box takes whatever shape that paste arrives in.
   ───────────────────────────────────────────────────────────────────────────── */

export const PASTE_LABEL = 'Add everybody at once';

export const PASTE_HELP =
  'Paste your staff list — one name per line, or separated by commas. Straight out of a spreadsheet or your payroll screen is fine. Nobody is emailed and nothing is charged: a name is just a name until you invite them.';

/** More than any real trade business, and small enough that a bad paste cannot fill the table. */
export const MOST_AT_ONCE = 300;

/**
 * Read a pasted list into names.
 *
 * Deliberately forgiving about the shape and strict about what a name is. A paste out of a
 * spreadsheet arrives with tabs, quotes, trailing commas and a header row; a paste out of a group
 * chat arrives with numbers in front. None of that is the person's problem to clean up first.
 *
 * What it will NOT do is split a line on spaces — "Kris Harold" is one person, and a rule clever
 * enough to guess otherwise would eventually turn somebody's double-barrelled surname into two
 * employees.
 */
export function readNames(pasted: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of pasted.split(/[\n\r,;\t]+/)) {
    const name = raw
      .replace(/^["'\s]+|["'\s]+$/g, '')
      /* "1." or "3)" from a numbered list, and a leading bullet. */
      .replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || name.length > 120) continue;
    /* A spreadsheet header, not a person. */
    if (/^(name|names|staff|employee|person|full name)$/i.test(name)) continue;
    /* Needs a letter in it: a stray "-" or a phone number is not somebody. */
    if (!/[a-z]/i.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MOST_AT_ONCE) break;
  }

  return out;
}

/** What to say after a paste — the count, and the duplicates that were skipped. */
export function addedSays(added: number, already: number): string {
  if (!added && !already) return 'No names found in that. One per line, or separated by commas.';
  const bits = [`${added} added`];
  if (already) bits.push(`${already} ${already === 1 ? 'was' : 'were'} already there`);
  return `${bits.join(', ')}. Put each of them on the chart next.`;
}
