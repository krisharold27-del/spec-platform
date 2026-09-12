/**
 * What a client's systems are FOR, rather than which products they are.
 *
 * Every business runs a different stack — Simpro and Xero and HubSpot at one, AroFlo and MYOB and
 * a shared spreadsheet at the next. Hard-coding vendors would make the platform fit exactly one
 * client. So the client types whatever they actually run, and this is the only fixed list: the
 * kind of number the system produces, which is the part SPEC reasons about.
 */
export const CATEGORIES = [
  { id: 'job_management', name: 'Jobs and scheduling', asks: 'Where do jobs, timesheets and billable hours live?' },
  { id: 'financials', name: 'Financials', asks: 'Where do invoices, gross profit and the P&L live?' },
  { id: 'safety', name: 'Safety and compliance', asks: 'Where are incidents, inductions and training records kept?' },
  { id: 'crm', name: 'Clients and sales', asks: 'Where do quotes, conversions and client records live?' },
  { id: 'payroll', name: 'People and payroll', asks: 'Where are staff records, leave and turnover kept?' },
  { id: 'communications', name: 'Mail', asks: 'Where does your work email live? Outlook, Gmail, or something else.' },
  { id: 'other', name: 'Something else', asks: 'Anything else that holds a number you want on a scorecard.' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

/**
 * Mail is the one category a person connects for themselves.
 *
 * Every other connection belongs to the business: an administrator turns it on, the sensitive ones
 * go to the board, and what comes back lands on somebody's scorecard. **A mailbox belongs to a
 * person**, so nobody else gets to switch it on for them — and it stays entirely optional, because
 * a business that connects no mail loses nothing but a convenience.
 *
 * What it is for is narrow on purpose: mail that matches something already on this person's card —
 * a KPI, an action, a named job, somebody on their team. Never an inbox and never a thread list.
 * The test is that the list ends; anything that did not match stays in the mail system it came
 * from, untouched.
 */
/**
 * What a person can point SPEC at. Named as the person would name it, never as a vendor list —
 * the same rule the business connections follow.
 *
 * Kept here rather than beside the database work so a page can offer the list without pulling a
 * connection to Postgres in behind it.
 */
export const MAIL_PROVIDERS = [
  { id: 'outlook', name: 'Outlook', note: 'Microsoft 365 or Exchange' },
  { id: 'gmail', name: 'Gmail', note: 'Google Workspace or a personal account' },
  { id: 'other', name: 'Something else', note: 'Any mailbox you can reach by IMAP' },
] as const;

export type MailProviderId = typeof MAIL_PROVIDERS[number]['id'];

export const PERSONAL_CATEGORIES: readonly CategoryId[] = ['communications'];

export const isPersonal = (id: string) => PERSONAL_CATEGORIES.includes(id as CategoryId);

export function categoryName(id: string) {
  return CATEGORIES.find(c => c.id === id)?.name ?? 'Other';
}

/**
 * A guess at the category from what the client typed, used only to pre-select the dropdown — the
 * client can always override it. Wrong guesses are cheap; making them pick from a vendor list they
 * are not on is not.
 */
const HINTS: [RegExp, CategoryId][] = [
  [/simpro|aroflo|servicem8|fergus|tradify|job|schedul|fieldwire|procore/i, 'job_management'],
  [/xero|myob|quickbooks|quicken|sage|reckon|invoice|account|financ|ledger/i, 'financials'],
  [/safe|incident|induct|hammertech|donesafe|sitedocs|train|competen|licen/i, 'safety'],
  [/hubspot|salesforce|pipedrive|zoho|crm|quote|tender|client/i, 'crm'],
  [/employment ?hero|keypay|deputy|tanda|payroll|roster|hr\b|people/i, 'payroll'],
];

export function guessCategory(name: string): CategoryId {
  for (const [re, id] of HINTS) if (re.test(name)) return id;
  return 'other';
}

export const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting to be connected',
  invited: 'Invite sent to the person who manages it',
  live: 'Live — numbers arriving automatically',
  broken: 'Reconnecting',
};

/**
 * Categories the board decides on, not the GM.
 *
 * Anything carrying pay, personal records or the ledger. The test is what the system holds rather
 * than which product it is — that is the whole reason SPEC reasons in categories: a business should
 * not be able to route around board approval by using a product SPEC has never heard of.
 */
const SENSITIVE: CategoryId[] = ['financials', 'payroll'];

export const isSensitive = (category: string): boolean =>
  SENSITIVE.includes(category as CategoryId);

/** What the board is being asked to allow, in plain words. Always read only. */
export const SENSITIVE_NOTE =
  'Financial and people systems go to the board with their exact data scope written on the request. '
  + 'A business should feel that the board approved it, because the board did.';
