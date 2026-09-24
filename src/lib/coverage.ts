/**
 * The capability map — everything SPEC does, and for each one, SPEC or a connected system.
 *
 * `SPEC Coverage.dc.html`, 23 September: 38 capabilities across Jobs, HR and Safety. For each, a
 * business runs it in SPEC or keeps the system it already has; either way it works from one screen.
 * Pure data and pure functions, no I/O.
 *
 * ── Categories, never vendors ───────────────────────────────────────────────────────────────────
 *
 * The design names one business's stack on every row — its job system, its CRM, its accounting
 * package. CLAUDE.md's never list: no vendor name in the schema or the UI; connectors are by
 * category. So the connected option is named by what the system IS ("Your job system"), using the
 * same categories `lib/systems` files every connection under. A business on any stack reads the
 * same page.
 *
 * And the design's defaults — every Jobs row switched to the connected system — are one business's
 * choice, not a default. Every capability starts in SPEC, and a business changes that by choice.
 *
 * ── SPEC is the solution; their own system is always an option ──────────────────────────────────
 *
 * Kris, 23 September: "the system should provide the solution for hr and safety and jobs etc - but
 * they can choose to use their own system if they choose and connect it - up to them but of course
 * i think my system is the best but they must have options and simplicity". So every capability can
 * be handed to the business's own system of its kind, a whole area can be switched with one press,
 * and the choice is kept per business (`coverage_choices`) rather than in a browser.
 */
import type { CategoryId } from './systems';

export type AreaKey = 'jobs' | 'hr' | 'safety';

export interface Area {
  key: AreaKey;
  title: string;
  short: string;
  href: string;
  blurb: string;
}

export const AREAS: Area[] = [
  {
    key: 'jobs', title: 'Jobs, quoting and money', short: 'Jobs', href: '/jobs',
    blurb: 'Everything from the first phone call to the money in the bank. The whole of what a job management system does, in SPEC.',
  },
  {
    key: 'hr', title: 'People and HR', short: 'People', href: '/people',
    blurb: 'The complete HR system, built around the role on the org chart.',
  },
  {
    key: 'safety', title: 'Safety', short: 'Safety', href: '/safety',
    blurb: 'The complete safety system. Zero harm, run from one place.',
  },
];

/** The categories a capability can be handed to — a subset of `lib/systems`' CATEGORIES. */
export type ConnectCategory = Extract<CategoryId, 'job_management' | 'financials' | 'crm' | 'payroll' | 'safety'>;

/**
 * Each area's own kind of system — what "Use my own system" hands a whole area to.
 *
 * HR is filed under `payroll` because that is the category `lib/systems` keeps staff records, leave
 * and turnover under ("People and payroll"), and the one the board approves.
 */
export const AREA_CATEGORY: Record<AreaKey, ConnectCategory> = {
  jobs: 'job_management',
  hr: 'payroll',
  safety: 'safety',
};

/** The business's own system, by what it is — lower case, for the middle of a sentence. */
export const SYSTEM_NOUN: Record<ConnectCategory, string> = {
  job_management: 'job system',
  financials: 'accounting system',
  crm: 'CRM',
  payroll: 'HR system',
  safety: 'safety system',
};

/** What the connected option's button says. The business's own system, by what it is. */
export const CONNECTED_LABEL: Record<ConnectCategory, string> = {
  job_management: 'Your job system',
  financials: 'Your accounting system',
  crm: 'Your CRM',
  payroll: 'Your HR system',
  safety: 'Your safety system',
};

export interface Capability {
  key: string;
  area: AreaKey;
  name: string;
  what: string;
  /**
   * Which kind of system can run this instead. Every capability has one: the design names a system
   * on some rows, and the rest fall to their area's own kind — Kris, 23 September: "they must have
   * options".
   */
  connect: ConnectCategory;
  /** Where SPEC's own version of it lives, when it has a screen of its own. */
  href?: string;
  /**
   * Whether SPEC has actually BUILT it — which is a different question from whether the business
   * has chosen to run it here.
   *
   * ── Why this had to be added ───────────────────────────────────────────────────────────────────
   *
   * `totalsOf` counted "running in SPEC" as *38 minus whatever you switched to your own system*. On
   * a business with nothing connected, this screen therefore said **"Running in SPEC: 38 — nothing
   * else to buy for these"** — including purchase orders, progress claims and pre-builds, none of
   * which exist. The screen could not tell the difference between a capability SPEC runs and one
   * nobody has written yet, so it claimed all of them.
   *
   * That is a claim on a screen a customer reads, and it would have been a claim in front of
   * investors. So each of the 38 now says which it is, and `evidence` has to name the thing that
   * makes it true.
   *
   * It is deliberately CONSERVATIVE. Where the honest answer is arguable, the answer is `partly`:
   * understating what is built costs a sentence of explanation, and overstating it costs the room.
   */
  built: Built;
  /** What makes the claim true — a route, a tab, a journey. Required for anything not `no`. */
  evidence?: string;
}

/** `yes` = you can do the whole job here. `partly` = some of it. `no` = designed, not written. */
export type Built = 'yes' | 'partly' | 'no';

export const BUILT_LABEL: Record<Built, string> = {
  yes: 'In SPEC now',
  partly: 'Part of it',
  no: 'Not built yet',
};

const C = (
  area: AreaKey, key: string, name: string, what: string,
  built: Built, evidence: string,
  connect: ConnectCategory | null = null, href?: string,
): Capability =>
  ({ key, area, name, what, built, evidence, connect: connect ?? AREA_CATEGORY[area], ...(href ? { href } : {}) });

/** The 38, in the design's order. */
export const CAPABILITIES: Capability[] = [
  // Jobs, quoting and money — 17
  C('jobs', 'leads', 'Enquiries & leads', 'Calls, emails and web forms on one list, with who’s following up.', 'yes', '/jobs?tab=leads — everything waiting for a quote with its age against the 2-day target, where the work came from, and speed to quote. Built from the board, because a lead is an enquiry.', 'job_management'),
  C('jobs', 'quotes', 'Quoting', 'Build from the catalogue, kits and labour rates. Markup, margin and GST worked out as you go. Client accepts online.', 'yes', '/jobs?tab=quotes — built from the catalogue, with margin against the benchmark.', 'job_management'),
  C('jobs', 'jobs', 'Jobs & projects', 'Service jobs and big projects, split into stages, with budget against actual on every one.', 'yes', '/jobs — the board from enquiry to paid, with budget against actual.', 'job_management'),
  C('jobs', 'schedule', 'Scheduling & dispatch', 'Drag crews onto days. Anyone not clear to work can’t be booked. Crews see it on their phone.', 'yes', '/jobs?tab=schedule — crew by day, and nobody who is not clear to work can be booked.', 'job_management'),
  C('jobs', 'mobile', 'Field app', 'Job card, SWMS, photos, materials used and client sign-off on the phone.', 'yes', '/tech-day — the SWMS, photos, materials used and the client’s sign-off, one button at a time in a fixed order. Materials land on the job cost. The photo’s caption, who and when are kept; the image stays on the phone until a file store is connected, and the screen says so.', 'job_management'),
  C('jobs', 'time', 'Timesheets & labour', 'Hours from Start and Finish on the phone, costed to the job, billable % to the KPI board.', 'yes', '/jobs?tab=time — hours from the phone, costed to the job.', 'job_management'),
  C('jobs', 'catalogue', 'Catalogue & supplier prices', 'The items you actually use, with supplier price files loaded automatically.', 'yes', '/jobs?tab=catalogue — paste the supplier’s price file and SPEC matches it to the catalogue, reprices it, and names anything that went up more than 5% because every quote already out with it is now wrong.', 'job_management'),
  C('jobs', 'kits', 'Kits & pre-builds', 'Bundles of items and labour you quote in one line.', 'yes', '/jobs?tab=catalogue — a kit prices the work, and its job pack says which SWMS applies, what to check before leaving and what to load. The van list is the kit’s own components, never a second copy.', 'job_management'),
  C('jobs', 'costing', 'Job costing & margin', 'Labour, materials and variations landing on the job live, with a warning when the margin slips.', 'yes', '/jobs — a live job whose margin has fallen below the benchmark says so on the board while there is still time to raise the variation, not at invoicing.', 'job_management'),
  C('jobs', 'stock', 'Stock, vans & warehouse', 'Van stock, yard stock, stock-takes and reorder lists built from the schedule.', 'yes', '/jobs?tab=stock — what is on each van and in the yard, when it was last counted, and a reorder list that turns into a purchase order in one press.', 'job_management'),
  C('jobs', 'po', 'Purchase orders & supplier bills', 'Order from the job, match the supplier invoice, flag price differences.', 'yes', '/jobs?tab=stock — raise an order against a job, record the supplier’s bill, and a bill higher than its order holds payment until somebody says why.', 'job_management'),
  C('jobs', 'variations', 'Variations', 'Extra work priced and signed on site before it’s done.', 'yes', '/jobs?tab=billing — priced, agreed on site with a name against it, and SPEC refuses to bill one that was never agreed.', 'job_management'),
  C('jobs', 'claims', 'Progress claims & retention', 'Claim by stage or percentage, with retention held and released on time.', 'yes', '/jobs?tab=billing — claim by amount or stage, retention held back and shown as a running figure, released when it is due.', 'job_management'),
  C('jobs', 'invoicing', 'Invoicing & debtors', 'Invoice on sign-off, sent to your accounting system, with reminders at 7, 14 and 30 days.', 'yes', '/jobs?tab=billing — sent, then chased at 7, 14 and 30 days, with each reminder recorded so the same one never goes twice.', 'job_management'),
  C('jobs', 'service', 'Service contracts & recurring work', 'Maintenance agreements that book themselves.', 'yes', '/jobs?tab=service — every agreement with its interval, and one press raises the job when it comes due.', 'job_management'),
  C('jobs', 'assets', 'Test & tag, client assets', 'Every tested item with result, photo and next due date.', 'yes', '/jobs?tab=service — each item with its result and next-due worked out from the interval. A failed item outranks any date and becomes a job.', 'job_management'),
  C('jobs', 'customers', 'Customers & sites', 'Every client, site, contact and job history in one place.', 'yes', '/clients and /crm — every client, site, contact and job history.', 'crm', '/clients'),

  // People and HR — 10
  C('hr', 'recruit', 'Recruitment', 'Vacancies from empty seats on the org chart, scored against the KPIs the person will hold.', 'yes', '/people — vacancies come from empty seats on the chart, candidates scored against the four pillars.'),
  C('hr', 'records', 'Employee records & documents', 'Everyone’s details, licences and documents against their role.', 'yes', '/people — the staff list and documents, held against the role.'),
  C('hr', 'contracts', 'Contracts & onboarding', 'Contracts built from the role, signed online, with a first-week plan.', 'yes', '/people?mode=pay — drafted from the role on the chart, sent, and the person’s acceptance recorded with a timestamp. Nothing is in force until they accept, and the screen says so.'),
  C('hr', 'leave', 'Leave requests & balances', 'Request on the phone, approve in one tap, balances always current.', 'yes', '/people — requested, approved, and shown against who is available.'),
  C('hr', 'reviews', 'Performance reviews', 'The last three months of the KPI board, plus one conversation.', 'yes', '/people — Reviews & conduct, built from the last three months of the KPI board.'),
  C('hr', 'training', 'Training records', 'Every module finished, due or overdue, from SPEC Training.', 'yes', '/training — the path for each role and who has done it.'),
  C('hr', 'conduct', 'Warnings & fair process', 'A fair process one step at a time, so no step is missed.', 'yes', '/people?mode=conduct — the five steps of a fair process, each recorded with what was said. SPEC refuses any step but the next one.'),
  C('hr', 'award', 'Award & pay rules', 'Every person checked against their award level, rates and allowances each pay run.', 'yes', '/people?mode=pay — the week’s hours checked before the run goes, never after, with what it found kept as written.'),
  C('hr', 'payroll', 'Payroll export', 'Hours and leave sent to your accounting system’s payroll in one step.', 'yes', '/people?mode=pay — the run built from the timesheets SPEC already holds, and it cannot be sent until somebody has checked it.', 'financials'),
  C('hr', 'exits', 'Exits & exit reasons', 'Right-reason and wrong-reason exits, feeding negative turnover.', 'yes', '/people — exits with right and wrong reasons, feeding negative turnover.'),

  // Safety — 11
  C('safety', 'incidents', 'Incidents & injuries', 'From first aid up, tagged to the job, with what changed after.', 'yes', '/safety — every injury from first aid up, on one register.'),
  C('safety', 'notifiable', 'Notifiable events', 'Flagged the moment a report looks notifiable to your regulator, with the steps to take.', 'yes', '/safety — flagged on the wording as a report is sent, with the regulator for the state the business works in.'),
  C('safety', 'comp', 'Workers’ comp & return to work', 'Insurer told within 48 hours, suitable duties planned week by week.', 'yes', '/safety — claims and return to work, with the review date that gets missed.'),
  C('safety', 'hazards', 'Hazards & near misses', 'Reported in one line, with an owner and a date to fix it.', 'yes', '/safety — hazards and near misses, each with an owner and a date.'),
  C('safety', 'psych', 'Wellbeing & psychosocial', 'Raised privately or anonymously, seen only by the GM.', 'yes', '/safety — anonymous by default, and proved against the stored row by scripts/safety-journey.'),
  C('safety', 'actions', 'Corrective actions', 'Who fixes it by when. Overdue actions go to the weekly meeting.', 'yes', '/safety — corrective actions raised against any report.'),
  C('safety', 'toolbox', 'Toolbox talks & sign-on', 'Crew signs on from the phone. Missing names show up on their own.', 'yes', '/safety?tab=site — talks with who signed on.'),
  C('safety', 'swms', 'SWMS & JSA sign-off', 'Every crew member signs before high-risk work starts.', 'yes', '/safety?tab=site — SWMS and JSA sign-off before high-risk work starts.'),
  C('safety', 'inspections', 'Site inspections & audits', 'Every active site inspected monthly. Findings become actions.', 'yes', '/safety?tab=site — inspections booked, findings becoming corrective actions.'),
  C('safety', 'vehicles', 'Vehicle & plant checks', 'Weekly checks. A failed vehicle is pulled from the schedule.', 'yes', '/safety?tab=site — vehicle and plant checks, with a fail pulling it off the schedule.'),
  C('safety', 'tickets', 'Licences & tickets', 'Warned 60 days before expiry. Not clear to work means can’t be booked.', 'yes', '/people#clear-to-work, read again on /compliance. Not current means not bookable.'),
];

export const capabilitiesIn = (area: AreaKey): Capability[] => CAPABILITIES.filter(c => c.area === area);

/**
 * Who runs a capability: SPEC, or the business's own system.
 *
 * Stored per business in `coverage_choices` — one row per capability somebody has CHANGED. No row
 * is SPEC: the default is never written, so a business that has never opened Coverage has an empty
 * table and runs everything in SPEC.
 */
export type Runner = 'spec' | 'own';
export type Choices = Record<string, Runner>;

export const isRunner = (v: unknown): v is Runner => v === 'spec' || v === 'own';

/** Everything in SPEC — where every business starts. */
export function defaultChoices(): Choices {
  const out: Choices = {};
  for (const c of CAPABILITIES) out[c.key] = 'spec';
  return out;
}

/** A choice, applied. An unknown capability or runner changes nothing. */
export function choose(choices: Choices, key: string, runner: Runner): Choices {
  if (!isRunner(runner) || !CAPABILITIES.some(c => c.key === key)) return choices;
  return { ...choices, [key]: runner };
}

/** One press for a whole area: every capability in it to SPEC, or every one to the business's own. */
export function chooseArea(choices: Choices, area: AreaKey, runner: Runner): Choices {
  if (!isRunner(runner) || !AREAS.some(a => a.key === area)) return choices;
  const out = { ...choices };
  for (const c of capabilitiesIn(area)) out[c.key] = runner;
  return out;
}

/**
 * The effective choices from the stored rows — defaults first, then each row that still names a
 * capability and a runner SPEC recognises. A capability renamed away, or a hand-edited row, falls
 * back to SPEC rather than breaking the page.
 */
export function effectiveChoices(rows: readonly { capability: string; choice: string }[]): Choices {
  let out = defaultChoices();
  for (const r of rows) if (isRunner(r.choice)) out = choose(out, r.capability, r.choice);
  return out;
}

/** How an area stands as a whole: all SPEC, all its own system, or some of each. */
export function areaRunner(choices: Choices, area: AreaKey): Runner | 'mixed' {
  const runners = new Set(capabilitiesIn(area).map(c => choices[c.key] ?? 'spec'));
  return runners.size === 1 ? [...runners][0] : 'mixed';
}

/**
 * The rows to write for a change — only what differs from the default is ever kept, so switching
 * back to SPEC deletes rather than writes. `set` is upserted, `clear` is deleted.
 */
export function rowsFor(keys: readonly string[], runner: Runner): { set: string[]; clear: string[] } {
  const known = keys.filter(k => CAPABILITIES.some(c => c.key === k));
  return runner === 'own' ? { set: known, clear: [] } : { set: [], clear: known };
}

export interface Totals {
  total: number;
  inSpec: number;
  connected: number;
  /** Of the ones running in SPEC, how many are fully built — see `Capability.built`. */
  builtHere: number;
  /** ...and how many are only partly there. Named, never folded into the number above. */
  partlyHere: number;
  /** The business's own systems in use, by what they are. */
  systems: string[];
}

export function totalsOf(choices: Choices): Totals {
  const own = CAPABILITIES.filter(c => choices[c.key] === 'own');
  const systems = [...new Set(own.map(c => `your ${SYSTEM_NOUN[c.connect]}`))];
  /*
    Counted from what is BUILT, not from what is unconnected.

    This used to read `inSpec: CAPABILITIES.length - own.length`, so a business that had connected
    nothing was told SPEC runs all 38 — including purchase orders, progress claims and pre-builds,
    none of which exist. The screen could not tell a capability SPEC runs from one nobody has
    written, so it claimed every one of them.
  */
  const here = CAPABILITIES.filter(c => choices[c.key] !== 'own');
  return {
    total: CAPABILITIES.length,
    inSpec: here.length,
    connected: own.length,
    builtHere: here.filter(c => c.built === 'yes').length,
    partlyHere: here.filter(c => c.built === 'partly').length,
    systems,
  };
}

/** Every capability that is not finished, worst first — the list to be honest about. */
export const unfinished = (): Capability[] =>
  CAPABILITIES.filter(c => c.built !== 'yes')
    .sort((a, b) => (a.built === 'no' ? 0 : 1) - (b.built === 'no' ? 0 : 1));

/**
 * The one sentence the Coverage screen leads on.
 *
 * It names the gap rather than burying it. A business reading "38 running in SPEC" and then finding
 * no purchase orders has been misled by its own software, and an investor finding it in a demo has
 * been misled by the person demonstrating.
 */
export function coverageLine(t: Totals): string {
  const missing = t.inSpec - t.builtHere - t.partlyHere;
  const bits = [`${t.builtHere} of ${t.total} are built and working`];
  if (t.partlyHere) bits.push(`${t.partlyHere} are partly there`);
  if (missing) bits.push(`${missing} are designed and not written yet`);
  return `${bits.join(', ')}.`;
}

/** The note under "From connected systems". Says where it runs — never that anything arrives. */
export const connectedNote = (t: Totals): string =>
  (t.systems.length ? `Run in ${t.systems.join(', ')}` : 'Nothing connected. SPEC runs it all');

/* ── Own system → connect it ─────────────────────────────────────────────────────────────────── */

/**
 * Whether the business has connected a system of this kind, from its Connections register.
 *
 * `live` — one is approved and live. `waiting` — one is named but not live yet (asked for, invited,
 * waiting on the board, reconnecting). `none` — nothing of that kind named. Neither of the last two
 * is a fault: pending is never red.
 */
export type ConnectionState = 'live' | 'waiting' | 'none';

export function connectionState(
  category: string,
  connections: readonly { category: string; status: string }[],
): ConnectionState {
  const mine = connections.filter(c => c.category === category);
  if (mine.some(c => c.status === 'live')) return 'live';
  return mine.length ? 'waiting' : 'none';
}

/** Straight to the add-a-system form on Connections, with the kind already chosen. */
export const connectHref = (category: ConnectCategory): string =>
  `/connections?category=${category}#add`;

/** "Connect your job system" — the link, by what the system is. */
export const connectLabel = (category: ConnectCategory): string => `Connect your ${SYSTEM_NOUN[category]}`;

/** The plain words beside an own-system row. */
export const CONNECTION_WORDS: Record<ConnectionState, string> = {
  live: 'Connected',
  waiting: 'Named on Connections, not live yet',
  none: '',
};

/* ── The modules respect the choice ──────────────────────────────────────────────────────────── */

export type ModuleKey = 'jobs' | 'safety' | 'people' | 'crm' | 'clients';

/**
 * Which capabilities each tab of each module is the SPEC screen for. A tab not listed covers its
 * whole area (Safety's Today is the whole register at a glance).
 */
export const MODULE_TABS: Record<ModuleKey, { area: AreaKey | null; tabs: Record<string, string[]> }> = {
  jobs: {
    area: 'jobs',
    tabs: {
      pipeline: ['leads', 'jobs', 'costing', 'variations'],
      quotes: ['quotes'],
      schedule: ['schedule'],
      time: ['time', 'mobile'],
      catalogue: ['catalogue', 'kits'],
      stock: ['stock', 'po'],
      billing: ['invoicing', 'claims'],
      service: ['service', 'assets'],
    },
  },
  safety: {
    area: 'safety',
    tabs: {
      incidents: ['incidents', 'notifiable', 'comp'],
      hazards: ['hazards', 'psych', 'actions'],
      site: ['toolbox', 'swms', 'inspections', 'vehicles'],
      clear: ['tickets'],
    },
  },
  people: {
    area: 'hr',
    tabs: {
      have: ['records', 'leave', 'training'],
      staff: ['records'],
      conduct: ['reviews', 'training', 'conduct'],
      pay: ['contracts', 'award', 'payroll', 'exits'],
      hiring: ['recruit'],
    },
  },
  // The CRM is one capability of the Jobs area — "Customers & sites" — not an area of its own.
  crm: { area: null, tabs: { '*': ['customers'] } },
  // The client list and contacts are the same capability, seen whole — see lib/clients.
  clients: { area: null, tabs: { '*': ['customers'] } },
};

const AREA_WORDS: Record<AreaKey, string> = { jobs: 'jobs', hr: 'HR', safety: 'safety' };

export interface OwnLine {
  /** "You run jobs in your own job system." */
  text: string;
  category: ConnectCategory;
}

/**
 * The single calm line at the top of a module tab when the business runs that part elsewhere — or
 * null, which is the ordinary case. The SPEC screen underneath still works either way.
 *
 * The whole area handed over reads as the area ("You run jobs in your own job system"); otherwise
 * the tab's own capabilities that are handed over are named ("You run Quoting in your own job
 * system"). All of them must share a kind of system for the line to name one; if they do not, the
 * first one's kind is named, which is still where most of it runs.
 */
export function ownLine(module: ModuleKey, tab: string, choices: Choices): OwnLine | null {
  const m = MODULE_TABS[module];
  if (!m) return null;
  if (m.area && areaRunner(choices, m.area) === 'own') {
    const category = AREA_CATEGORY[m.area];
    return { text: `You run ${AREA_WORDS[m.area]} in your own ${SYSTEM_NOUN[category]}.`, category };
  }
  const keys = m.tabs[tab] ?? m.tabs['*'] ?? (m.area ? capabilitiesIn(m.area).map(c => c.key) : []);
  const own = CAPABILITIES.filter(c => keys.includes(c.key) && choices[c.key] === 'own');
  if (!own.length) return null;
  const category = own[0].connect;
  const names = own.map(c => c.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return { text: `You run ${list} in your own ${SYSTEM_NOUN[category]}.`, category };
}

/* ── Where a number comes from, following the choice ────────────────────────────────────────── */

/**
 * The Power Meter slots that read ONE of SPEC's own records, and which capability that record is.
 *
 * Slots that read two records ("SPEC Safety + Jobs timesheets") or none of the 38 (Training, the
 * pulse, the org chart, the accounting system) are left out: their label does not move.
 */
export const SLOT_CAPABILITY: Record<string, string> = {
  safety_incident: 'incidents',
  workers_comp: 'comp',
  gross_profit: 'costing',
  contract_breach: 'claims',
  turnover: 'exits',
  lti: 'incidents',
  near_miss: 'hazards',
  safety_actions: 'actions',
  absenteeism: 'leave',
  debtor_days: 'invoicing',
  productivity: 'time',
  audit: 'inspections',
  corrective: 'actions',
  licensing: 'tickets',
};

/**
 * A measure's source, said the way the business runs it: SPEC's own record when it is in SPEC,
 * "your safety system" when the business chose its own. Never a vendor.
 */
export function sourceFor(slotId: string, specSource: string, choices: Choices): string {
  const key = SLOT_CAPABILITY[slotId];
  if (!key || choices[key] !== 'own') return specSource;
  const cap = CAPABILITIES.find(c => c.key === key)!;
  return `your ${SYSTEM_NOUN[cap.connect]}`;
}
