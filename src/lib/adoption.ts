/**
 * The nine areas of an owner's job, and which of them are running in siteVIP yet.
 *
 * ── Why a product would rather not build this ────────────────────────────────────────────────────
 *
 * Every platform's preferred story is that you move everything across on day one. It is a better
 * story, it is a bigger contract, and it is the reason most of these projects die in month two: a
 * business that switches nine things at once is a business where nine things are half-configured
 * during the week the work still has to go out the door.
 *
 * Kris's rule is the opposite and it is the harder one to build: *"a business starts with only some
 * areas running in siteVIP and adopts the rest as it gets easier."* Which means siteVIP has to be
 * genuinely useful while most of it is switched off, and — this is the part that costs work — an
 * area left in Simpro or HubSpot still has to feed the Power Meter, because a score that only
 * measures the parts you have already moved is a score that rewards moving rather than improving.
 *
 * ── The simplicity rule this exists to serve ─────────────────────────────────────────────────────
 *
 * *"the owner only opens a tile when it says something needs them."* So every tile carries exactly
 * one line and it is either a thing to do or the words "Nothing needs you". Not a summary, not three
 * statistics, not a sparkline. A dashboard of nine tiles each showing four numbers is a dashboard
 * nobody reads twice, and the second time somebody skims past a tile is the time it mattered.
 *
 * ── Two areas are not staged, for two different reasons ──────────────────────────────────────────
 *
 * **Pay** is always on from day one (Kris's final word, overriding an earlier note that had it
 * staged). Payroll is the one thing where running it from two places is worse than running it badly
 * from one: hours in siteVIP and a pay run somewhere else means double entry, and double entry in
 * payroll means somebody gets paid wrong.
 *
 * **Money** always opens in siteVIP too, but for the opposite reason — the reviews, the shields and
 * the findings are SPEC's work, and they run on whatever ledger is underneath. What is optional
 * about Money is the ledger (Xero today, Angus Shield when they choose), not the screen. So Money
 * counts as staged in the header tally, because the honest thing to count is where the business's
 * ledger lives, and it would be a con to tick it off on day one when nothing has moved.
 */

export type AreaKey =
  | 'win' | 'do' | 'paid' | 'people' | 'pay' | 'safety' | 'compliance' | 'money' | 'board';

export interface Area {
  key: AreaKey;
  label: string;
  /** What this area of the owner's job actually is. One line, their words. */
  covers: string;
  /** Where the tile goes when it is running here. */
  to: string;
  /**
   * True for the areas that are never staged — they run in siteVIP from the first day, whatever
   * else the business keeps elsewhere.
   */
  alwaysHere: boolean;
  /**
   * True where the siteVIP screen opens regardless, because what is elsewhere is the data source
   * underneath rather than the work itself. Money only.
   */
  opensHereRegardless: boolean;
}

/** The nine. The whole of an owner's job, which is the claim being made by there being nine. */
export const AREAS: Area[] = [
  { key: 'win',        label: 'Win the work',  covers: 'Leads, quotes, tenders and what you win them at.',        to: '/jobs?tab=leads',       alwaysHere: false, opensHereRegardless: false },
  { key: 'do',         label: 'Do the work',   covers: 'The schedule, the crews, the day, and the job getting finished.', to: '/jobs?tab=schedule', alwaysHere: false, opensHereRegardless: false },
  { key: 'paid',       label: 'Get paid',      covers: 'Invoices, progress claims, and who owes you what.',        to: '/jobs?tab=billing',     alwaysHere: false, opensHereRegardless: false },
  { key: 'people',     label: 'People',        covers: 'Who does what, whether they can do it, and how they are going.', to: '/people',        alwaysHere: false, opensHereRegardless: false },
  { key: 'pay',        label: 'Pay',           covers: 'Timesheets, the award, leave, super and the pay run.',     to: '/people?tab=pay',       alwaysHere: true,  opensHereRegardless: false },
  { key: 'safety',     label: 'Safety',        covers: 'Pre-starts, Take 5s, incidents and everybody going home.',  to: '/safety',              alwaysHere: false, opensHereRegardless: false },
  { key: 'compliance', label: 'Compliance',    covers: 'Licences, inductions, certificates and the obligations you carry.', to: '/compliance',  alwaysHere: false, opensHereRegardless: false },
  { key: 'money',      label: 'Money',         covers: 'The reviews, the shields, tax set aside and what the business is worth.', to: '/money', alwaysHere: false, opensHereRegardless: true },
  { key: 'board',      label: 'Board',         covers: 'The Power Meter, the monthly pack and the decisions log.',  to: '/board',               alwaysHere: false, opensHereRegardless: false },
];

export const areaByKey = (key: string): Area | undefined => AREAS.find(a => a.key === key);

/** What a business has said about one area. Absent means it has not been turned on. */
export interface AreaSetting {
  key: AreaKey;
  runningHere: boolean;
  /** What it runs in instead — the business's words: "Simpro", "HubSpot", "Xero Payroll". */
  elsewhere: string | null;
  /** Whether that other system is connected, so it still feeds the Power Meter. */
  connected: boolean;
}

export type Dot = 'green' | 'amber' | 'red' | 'grey';

export interface Tile {
  area: Area;
  runningHere: boolean;
  elsewhere: string | null;
  connected: boolean;
  dot: Dot;
  /** The ONE line. A thing to do, or that there is nothing. */
  line: string;
  /** Where the button goes, and what it says. */
  to: string;
  action: string;
}

/**
 * What one area needs from the owner today.
 *
 * Deliberately a single string supplied by the caller rather than something derived here, because
 * every area's "needs you" comes from a different part of the system and this module has no
 * business knowing how a pre-start differs from an overdue invoice. What it owns is the rule that
 * there is exactly one line and that silence is said out loud.
 */
export interface Needs {
  key: AreaKey;
  /** Null means nothing needs the owner in this area. */
  line: string | null;
  /** How loud it is. Ignored when `line` is null. */
  dot: Exclude<Dot, 'grey'>;
}

export const NOTHING_NEEDS_YOU = 'Nothing needs you';

export function tileFor(area: Area, setting: AreaSetting | undefined, needs: Needs | undefined): Tile {
  const runningHere = area.alwaysHere || Boolean(setting?.runningHere);
  const elsewhere = runningHere ? null : setting?.elsewhere?.trim() || null;
  const connected = Boolean(setting?.connected);

  if (!runningHere) {
    /*
      Grey, always — not green and not red. An area running somewhere else is not doing badly and it
      is not doing well; siteVIP genuinely does not know, and colouring it would be inventing an
      opinion. The one thing worth saying is whether it is feeding the Power Meter.
    */
    const where = elsewhere ? `In ${elsewhere}` : 'In another system';
    return {
      area, runningHere: false, elsewhere, connected, dot: 'grey',
      line: connected
        ? `${where} · siteVIP reads it, so it still counts towards your Power Meter.`
        : `${where} · not connected, so this part of your Power Meter is guesswork.`,
      to: area.opensHereRegardless ? area.to : `/settings/adopt/${area.key}`,
      action: area.opensHereRegardless ? 'Open →' : 'Run it in siteVIP',
    };
  }

  if (!needs || needs.line === null) {
    return { area, runningHere: true, elsewhere: null, connected, dot: 'green', line: NOTHING_NEEDS_YOU, to: area.to, action: 'Open →' };
  }
  return { area, runningHere: true, elsewhere: null, connected, dot: needs.dot, line: needs.line, to: area.to, action: 'Open →' };
}

export function tiles(
  settings: readonly AreaSetting[],
  needs: readonly Needs[],
): Tile[] {
  const byKey = new Map(settings.map(s => [s.key, s]));
  const need = new Map(needs.map(n => [n.key, n]));
  return AREAS.map(a => tileFor(a, byKey.get(a.key), need.get(a.key)));
}

/** The header tally. Counted from the tiles so it can never disagree with them. */
export const runningHere = (list: readonly Tile[]): number =>
  list.filter(t => t.runningHere).length;

export function adoptionLine(list: readonly Tile[]): string {
  const n = runningHere(list);
  if (n === AREAS.length) return `All ${AREAS.length} areas running in siteVIP.`;
  const notConnected = list.filter(t => !t.runningHere && !t.connected).length;
  const base = `${n} of ${AREAS.length} running in siteVIP.`;
  if (notConnected === 0) {
    return `${base} The rest still feed your Power Meter from the systems they are in — turn them on when it suits you.`;
  }
  return `${base} ${notConnected} of the others ${notConnected === 1 ? 'is' : 'are'} not connected, so ${notConnected === 1 ? 'that part' : 'those parts'} of your Power Meter ${notConnected === 1 ? 'is' : 'are'} missing.`;
}

/** How many tiles are actually asking for the owner. The number that says whether today is busy. */
export const needingYou = (list: readonly Tile[]): Tile[] =>
  list.filter(t => t.runningHere && t.line !== NOTHING_NEEDS_YOU);

/* ─────────────────────────────────────────────────────────────────────────────
 * Turning one on
 * ───────────────────────────────────────────────────────────────────────────── */

export const NOTHING_RE_KEYED =
  'SPEC moves the data for you. Nobody re-types a customer, a job or a price — and the system you are leaving can stay connected, read-only, for as long as you want it there.';

export interface MovePlan {
  area: Area;
  from: string | null;
  /** What comes across, in the business's language rather than in table names. */
  brings: string[];
  says: string;
}

/**
 * What turning an area on actually moves.
 *
 * Written out per area because "we'll migrate your data" is the sentence that makes an owner say
 * they will think about it. Naming the five things that come across is the difference between a
 * decision and a risk.
 */
const BRINGS: Record<AreaKey, string[]> = {
  win: ['Your leads and their history', 'Open quotes, with their prices', 'The price book and any pre-builds', 'Who each lead came from'],
  do: ['Every open job and its stage', 'The schedule as it stands', 'Who is on what', 'Job notes and photos'],
  paid: ['Open invoices at their exact balances', 'Payment terms per customer', 'What is overdue and by how long'],
  people: ['Everybody, with their roles', 'Licences, tickets and their expiry dates', 'Training records'],
  pay: ['Timesheet history', 'Award rates as they are set today', 'Leave balances', 'Super fund details'],
  safety: ['Incidents and their outcomes', 'SWMS and site inductions', 'Take 5 and pre-start history'],
  compliance: ['Licences and registrations', 'Certificates already issued', 'Obligations and who holds them'],
  money: ['Chart of accounts', 'Customers and suppliers', 'Open invoices and bills', 'Six months of history'],
  board: ['Your Power Meter history', 'Past board packs', 'The decisions log'],
};

export function movePlan(area: Area, from: string | null): MovePlan {
  return {
    area,
    from,
    brings: BRINGS[area.key],
    says: from
      ? `Turning on ${area.label} moves it out of ${from}. ${NOTHING_RE_KEYED}`
      : `Turning on ${area.label} sets it up in siteVIP. ${NOTHING_RE_KEYED}`,
  };
}

/** Money is the one that does not move this way — it goes through the Angus Shield switch. */
export const MONEY_GOES_THROUGH_ANGUS =
  'Money is different. The reviews already run here on whatever ledger you use. What moves — if and when you want it to — is the ledger itself, and that is the Angus Shield switch, offered once six months of your data sits in SPEC.';
