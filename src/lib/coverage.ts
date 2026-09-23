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
}

const C = (area: AreaKey, key: string, name: string, what: string, connect: ConnectCategory | null = null, href?: string): Capability =>
  ({ key, area, name, what, connect: connect ?? AREA_CATEGORY[area], ...(href ? { href } : {}) });

/** The 38, in the design's order. */
export const CAPABILITIES: Capability[] = [
  // Jobs, quoting and money — 17
  C('jobs', 'leads', 'Enquiries & leads', 'Calls, emails and web forms on one list, with who’s following up.', 'job_management'),
  C('jobs', 'quotes', 'Quoting', 'Build from the catalogue, kits and labour rates. Markup, margin and GST worked out as you go. Client accepts online.', 'job_management'),
  C('jobs', 'jobs', 'Jobs & projects', 'Service jobs and big projects, split into stages, with budget against actual on every one.', 'job_management'),
  C('jobs', 'schedule', 'Scheduling & dispatch', 'Drag crews onto days. Anyone not clear to work can’t be booked. Crews see it on their phone.', 'job_management'),
  C('jobs', 'mobile', 'Field app', 'Job card, SWMS, photos, materials used and client sign-off on the phone.', 'job_management'),
  C('jobs', 'time', 'Timesheets & labour', 'Hours from Start and Finish on the phone, costed to the job, billable % to the KPI board.', 'job_management'),
  C('jobs', 'catalogue', 'Catalogue & supplier prices', 'The items you actually use, with supplier price files loaded automatically.', 'job_management'),
  C('jobs', 'kits', 'Kits & pre-builds', 'Bundles of items and labour you quote in one line.', 'job_management'),
  C('jobs', 'costing', 'Job costing & margin', 'Labour, materials and variations landing on the job live, with a warning when the margin slips.', 'job_management'),
  C('jobs', 'stock', 'Stock, vans & warehouse', 'Van stock, yard stock, stock-takes and reorder lists built from the schedule.', 'job_management'),
  C('jobs', 'po', 'Purchase orders & supplier bills', 'Order from the job, match the supplier invoice, flag price differences.', 'job_management'),
  C('jobs', 'variations', 'Variations', 'Extra work priced and signed on site before it’s done.', 'job_management'),
  C('jobs', 'claims', 'Progress claims & retention', 'Claim by stage or percentage, with retention held and released on time.', 'job_management'),
  C('jobs', 'invoicing', 'Invoicing & debtors', 'Invoice on sign-off, sent to your accounting system, with reminders at 7, 14 and 30 days.', 'job_management'),
  C('jobs', 'service', 'Service contracts & recurring work', 'Maintenance agreements that book themselves.', 'job_management'),
  C('jobs', 'assets', 'Test & tag, client assets', 'Every tested item with result, photo and next due date.', 'job_management'),
  C('jobs', 'customers', 'Customers & sites', 'Every client, site, contact and job history in one place.', 'crm', '/clients'),

  // People and HR — 10
  C('hr', 'recruit', 'Recruitment', 'Vacancies from empty seats on the org chart, scored against the KPIs the person will hold.'),
  C('hr', 'records', 'Employee records & documents', 'Everyone’s details, licences and documents against their role.'),
  C('hr', 'contracts', 'Contracts & onboarding', 'Contracts built from the role, signed online, with a first-week plan.'),
  C('hr', 'leave', 'Leave requests & balances', 'Request on the phone, approve in one tap, balances always current.'),
  C('hr', 'reviews', 'Performance reviews', 'The last three months of the KPI board, plus one conversation.'),
  C('hr', 'training', 'Training records', 'Every module finished, due or overdue, from SPEC Training.'),
  C('hr', 'conduct', 'Warnings & fair process', 'A fair process one step at a time, so no step is missed.'),
  C('hr', 'award', 'Award & pay rules', 'Every person checked against their award level, rates and allowances each pay run.'),
  C('hr', 'payroll', 'Payroll export', 'Hours and leave sent to your accounting system’s payroll in one step.', 'financials'),
  C('hr', 'exits', 'Exits & exit reasons', 'Right-reason and wrong-reason exits, feeding negative turnover.'),

  // Safety — 11
  C('safety', 'incidents', 'Incidents & injuries', 'From first aid up, tagged to the job, with what changed after.'),
  C('safety', 'notifiable', 'Notifiable events', 'Flagged the moment a report looks notifiable to your regulator, with the steps to take.'),
  C('safety', 'comp', 'Workers’ comp & return to work', 'Insurer told within 48 hours, suitable duties planned week by week.'),
  C('safety', 'hazards', 'Hazards & near misses', 'Reported in one line, with an owner and a date to fix it.'),
  C('safety', 'psych', 'Wellbeing & psychosocial', 'Raised privately or anonymously, seen only by the GM.'),
  C('safety', 'actions', 'Corrective actions', 'Who fixes it by when. Overdue actions go to the weekly meeting.'),
  C('safety', 'toolbox', 'Toolbox talks & sign-on', 'Crew signs on from the phone. Missing names show up on their own.'),
  C('safety', 'swms', 'SWMS & JSA sign-off', 'Every crew member signs before high-risk work starts.'),
  C('safety', 'inspections', 'Site inspections & audits', 'Every active site inspected monthly. Findings become actions.'),
  C('safety', 'vehicles', 'Vehicle & plant checks', 'Weekly checks. A failed vehicle is pulled from the schedule.'),
  C('safety', 'tickets', 'Licences & tickets', 'Warned 60 days before expiry. Not clear to work means can’t be booked.'),
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
  /** The business's own systems in use, by what they are. */
  systems: string[];
}

export function totalsOf(choices: Choices): Totals {
  const own = CAPABILITIES.filter(c => choices[c.key] === 'own');
  const systems = [...new Set(own.map(c => `your ${SYSTEM_NOUN[c.connect]}`))];
  return {
    total: CAPABILITIES.length,
    inSpec: CAPABILITIES.length - own.length,
    connected: own.length,
    systems,
  };
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
