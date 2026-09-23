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
 * choice, not a default. Here the starting position is read from what the business has already told
 * SPEC it runs (its connections), and everything else starts in SPEC. No re-asking.
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
export type ConnectCategory = Extract<CategoryId, 'job_management' | 'financials' | 'crm'>;

/** What the connected option's button says. The business's own system, by what it is. */
export const CONNECTED_LABEL: Record<ConnectCategory, string> = {
  job_management: 'Your job system',
  financials: 'Your accounting system',
  crm: 'Your CRM',
};

export interface Capability {
  key: string;
  area: AreaKey;
  name: string;
  what: string;
  /** Which kind of connected system can run this instead. Null: SPEC runs it, nothing replaces it. */
  connect: ConnectCategory | null;
  /** Where SPEC's own version of it lives, when it has a screen of its own. */
  href?: string;
}

const C = (area: AreaKey, key: string, name: string, what: string, connect: ConnectCategory | null = null, href?: string): Capability =>
  ({ key, area, name, what, connect, ...(href ? { href } : {}) });

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
  C('jobs', 'customers', 'Customers & sites', 'Every client, site, contact and job history in one place.', 'crm', '/crm'),

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

export type Runner = 'spec' | 'connected';
export type Choices = Record<string, Runner>;

/**
 * Where each capability starts: connected where the business has already told SPEC it runs that
 * kind of system, SPEC everywhere else. A capability with nothing to connect to is always SPEC.
 */
export function defaultChoices(connectedCategories: readonly string[]): Choices {
  const have = new Set(connectedCategories);
  const out: Choices = {};
  for (const c of CAPABILITIES) out[c.key] = c.connect && have.has(c.connect) ? 'connected' : 'spec';
  return out;
}

/**
 * A choice, applied. Refuses to hand a capability to a connected system when it has none — the
 * switch on those rows only ever has one side.
 */
export function choose(choices: Choices, key: string, runner: Runner): Choices {
  const cap = CAPABILITIES.find(c => c.key === key);
  if (!cap) return choices;
  if (runner === 'connected' && !cap.connect) return choices;
  return { ...choices, [key]: runner };
}

/**
 * Stored choices, read back defensively — they come from a browser, so anything unrecognised is
 * dropped and the default stands. Never throws.
 */
export function readChoices(raw: string | null, defaults: Choices): Choices {
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaults;
    let out = { ...defaults };
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'spec' || value === 'connected') out = choose(out, key, value);
    }
    return out;
  } catch {
    return defaults;
  }
}

export interface Totals {
  total: number;
  inSpec: number;
  connected: number;
  /** The connected systems in use, by what they are. */
  systems: string[];
}

export function totalsOf(choices: Choices): Totals {
  const connected = CAPABILITIES.filter(c => c.connect && choices[c.key] === 'connected');
  const systems = [...new Set(connected.map(c => CONNECTED_LABEL[c.connect!].replace(/^Your /, 'your ')))];
  return {
    total: CAPABILITIES.length,
    inSpec: CAPABILITIES.length - connected.length,
    connected: connected.length,
    systems,
  };
}

/** The note under "From connected systems". */
export const connectedNote = (t: Totals): string =>
  (t.systems.length
    ? `From ${t.systems.join(', ')}, read and written by SPEC`
    : 'Nothing connected. SPEC runs it all');
