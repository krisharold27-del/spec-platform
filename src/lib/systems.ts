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

/**
 * What a connection's state MEANS, in words that are true today.
 *
 * `live` used to read "Live — numbers arriving automatically". Nothing arrives automatically:
 * there is no connector anywhere in this repository, and `tests/no-false-feed.test.ts` exists
 * because that exact claim was printed across four screens on 18 September and had to be torn out.
 * It survived here because it is a LABEL in a lookup table rather than a sentence in a page, which
 * is precisely where a claim goes to hide.
 *
 * What `live` honestly means today: the business has done its side — the system is named, the
 * board has approved it where the board has to, and it is ready for SPEC's connector. The moment a
 * real one lands this wording should change again, and the ban in that test lifts by itself.
 */
export const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting to be connected',
  invited: 'Invite sent to the person who manages it',
  live: 'Approved and ready — SPEC is not reading from it yet',
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

/**
 * The category a connection is FILED under — which is not always the one somebody chose.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September, before connecting JBI to anything: *"be very careful with connectors
 * especially xero and financials - how are we controlling this - not everyone should be able to
 * connect Xero"*.
 *
 * The control was real and had one way round it. Sensitivity is decided by CATEGORY — deliberately,
 * because the alternative is a vendor list and a business on a product SPEC has never heard of
 * would route around the board by existing. But the category came **straight off the form**.
 * `guessCategory` knows perfectly well that "Xero" is financials; it was only ever used to
 * pre-select the dropdown, and the dropdown could be changed. Type Xero, pick "Something else", and
 * the ledger connects on an administrator's say-so with no board request raised — and `markLive`
 * agrees, because it asks the STORED category.
 *
 * So the guard defended against a vendor nobody knows and not against a vendor everybody knows,
 * filed under the wrong heading. One dropdown between the board and the P&L.
 *
 * A category may now be made MORE sensitive than the person chose, never less. Calling Xero
 * "something else" is still allowed as a description; it stops being a way to skip the board.
 */
export function fileUnder(chosen: string, name: string): CategoryId {
  const guessed = guessCategory(name);
  // Only ever upgrades. A business calling its job system "financial reporting" is filed as
  // financials and goes to the board, which is the safe direction to be wrong in.
  if (isSensitive(guessed) && !isSensitive(chosen)) return guessed;
  return (CATEGORIES.some(c => c.id === chosen) ? chosen : guessed) as CategoryId;
}

/** What the board is being asked to allow, in plain words. Always read only. */
export const SENSITIVE_NOTE =
  'Financial and people systems go to the board with their exact data scope written on the request. '
  + 'A business should feel that the board approved it, because the board did.';
