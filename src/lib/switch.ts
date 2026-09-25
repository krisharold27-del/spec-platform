import { CAPABILITIES, capabilitiesIn, type Choices } from './coverage';
import { ANGUS_SHIELD } from './virtual-gm-overview';
import type { Missing, Recommendation, Fact } from './recommends';

/**
 * Switch when ready — how a business moves an area onto SPEC, and never before it wants to.
 *
 * Kris, 25 September. The rule: **on day one SPEC never changes a business's existing systems.**
 * Payroll, accounting, the job system — they keep running exactly as they are. SPEC shows what it
 * could take over, checks the business's own data in the background, says plainly when an area is
 * ready and what is still missing, and switches only when the business asks. Pure — no I/O.
 *
 * ── What a switch actually changes ──────────────────────────────────────────────────────────────
 *
 * Inside SPEC, the area's Coverage choices (lib/coverage) move to SPEC, and nothing else. The other
 * system is never touched, disconnected or written to: it stays exactly as it was, which is what
 * makes Undo real. Undo puts back the Coverage choices the switch replaced (`previous`).
 *
 * ── The gate, and why it has two halves ─────────────────────────────────────────────────────────
 *
 * Kris, same day: *"The Switch toggle unlocks only when BOTH the owner says ready AND Claude has
 * confirmed Angus Shield matches their current system."* So `mayUseSwitch` needs the owner's own
 * "I'm ready" AND `confirmed` — every check met and the product itself able to run the area. Owner
 * ready but not confirmed shows "Not available yet" with exactly what is still being checked.
 *
 * `confirmed` is SPEC's check, not a flag anybody sets. For Angus Shield it cannot pass today — it
 * keeps no books yet (`ANGUS_SHIELD.switchable` is false) — so the card says so, every time, until
 * it can. Nothing here says "coming soon": it says "we'll tell you when it's ready", and it is the
 * check that decides when.
 */

export type SwitchAreaKey = 'accounting' | 'payroll' | 'jobs' | 'crm' | 'people' | 'safety';
export type Product = 'spec' | 'angus';
export type SwitchState = 'requested' | 'side_by_side' | 'spec';

export interface SwitchArea {
  key: SwitchAreaKey;
  /** For the middle of a sentence: "run your payroll". */
  noun: string;
  /** Who takes it over: SPEC itself, or Angus Shield, SPEC's own financial product. */
  product: Product;
  /** The `system_connections.category` a business's own system for this is filed under. */
  category: string;
  /** The Coverage capabilities a switch moves to SPEC. */
  capabilities: string[];
  /**
   * Whether to run both side by side for a cycle before switching — where money or pay is at stake.
   * For accounting this is Shadow: Angus Shield alongside the books, checking it can match them.
   */
  sideBySide: boolean;
  /** Where the area lives in SPEC. */
  home: string;
}

const keysOf = (caps: { key: string }[], except: string[] = []) =>
  caps.map(c => c.key).filter(k => !except.includes(k));

export const SWITCH_AREAS: SwitchArea[] = [
  { key: 'accounting', noun: 'accounting', product: 'angus', category: 'financials', capabilities: [], sideBySide: true, home: '/virtual-gm' },
  { key: 'payroll', noun: 'payroll', product: 'angus', category: 'payroll', capabilities: [], sideBySide: true, home: '/people?mode=pay' },
  { key: 'jobs', noun: 'jobs and quoting', product: 'spec', category: 'job_management', capabilities: keysOf(capabilitiesIn('jobs'), ['customers']), sideBySide: true, home: '/jobs' },
  { key: 'crm', noun: 'customers and sales', product: 'spec', category: 'crm', capabilities: ['customers'], sideBySide: false, home: '/crm' },
  { key: 'people', noun: 'HR', product: 'spec', category: 'payroll', capabilities: keysOf(capabilitiesIn('hr'), ['payroll']), sideBySide: false, home: '/people' },
  { key: 'safety', noun: 'safety', product: 'spec', category: 'safety', capabilities: keysOf(capabilitiesIn('safety')), sideBySide: false, home: '/safety' },
];

export const areaOf = (key: string): SwitchArea | null => SWITCH_AREAS.find(a => a.key === key) ?? null;
export const topicOf = (area: SwitchAreaKey): string => `switch:${area}`;

export const productName = (a: SwitchArea): string => (a.product === 'angus' ? ANGUS_SHIELD.name : 'SPEC');

/** What the side-by-side step is called for this area. */
export const sideBySideName = (a: SwitchArea): string => (a.key === 'accounting' ? 'Shadow' : 'side by side');

/**
 * Whether the product itself can run the area — the half of readiness that is SPEC's, not the
 * business's. SPEC's own areas: every capability in it built (lib/coverage `built`). Angus Shield:
 * `ANGUS_SHIELD.switchable`, which is false until it keeps books of its own.
 */
export function productReady(a: SwitchArea): boolean {
  if (a.product === 'angus') return ANGUS_SHIELD.switchable;
  const caps = CAPABILITIES.filter(c => a.capabilities.includes(c.key));
  return caps.length > 0 && caps.every(c => c.built === 'yes');
}

/**
 * Whether the area shows up for this business at all.
 *
 * Accounting and payroll always do — every business keeps books and pays people. Anything else only
 * when the business runs its own system for it: a connection of that kind, or a Coverage choice
 * handed to its own system. Offering to take over what SPEC already runs would be noise.
 */
export function relevant(a: SwitchArea, ctx: { connections: readonly { category: string }[]; choices: Choices }): boolean {
  if (a.product === 'angus') return true;
  return ctx.connections.some(c => c.category === a.category)
    || a.capabilities.some(k => ctx.choices[k] === 'own');
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The readiness check
 * ───────────────────────────────────────────────────────────────────────────── */

/** What SPEC can count about a business, from its own rows. Names never leave the database. */
export interface BusinessCounts {
  staff: number;
  staffWithStart: number;
  staffWithContact: number;
  staffInducted: number;
  customers: number;
  catalogue: number;
  jobs: number;
  /** Timesheet entries in the last 30 days. */
  timesheets30: number;
  payRunsChecked: number;
  /** The accounting system linked, and which books chosen — so SPEC can read them. */
  ledgerLinked: boolean;
}

export interface Check {
  id: string;
  /** Said as the thing that has to be true. */
  label: string;
  met: boolean;
  /** What SPEC found. */
  found: string;
  /** Where to fix it. Absent when SPEC itself does not hold it yet. */
  href?: string;
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const everyone = (have: number, of: number, what: string, href: string, id: string, label: string): Check => ({
  id, label, href,
  met: of > 0 && have === of,
  found: of === 0 ? 'Nobody on the chart yet' : have === of ? `All ${of} ${what}` : `${have} of ${of} ${what}`,
});

const onChart = (c: BusinessCounts): Check => ({
  id: 'staff', label: 'Your people are on the chart', href: '/org',
  met: c.staff > 0, found: c.staff ? n(c.staff, 'person', 'people') : 'Nobody yet',
});

/**
 * Everything a switch of this area depends on, checked against what SPEC actually holds.
 *
 * Payroll names three things SPEC does not hold at all — pay rates, pay cycles, leave balances
 * (see `leaveEntries` in the schema: SPEC deliberately holds no balances). They are listed as
 * missing, without a link, because there is nowhere in SPEC to put them yet. Saying so is the
 * point: "all 14 staff, pay rates and leave balances check out" is a sentence SPEC may only say
 * once it can check them.
 */
export function checksFor(a: SwitchArea, c: BusinessCounts): Check[] {
  switch (a.key) {
    case 'accounting':
      return [
        {
          id: 'ledger', label: 'Your accounting system is linked, so SPEC can read your books', href: '/connections?category=financials',
          met: c.ledgerLinked, found: c.ledgerLinked ? 'Linked' : 'Not linked yet',
        },
        {
          id: 'match', label: `${ANGUS_SHIELD.name} reproduces your profit and loss, month for month`,
          met: ANGUS_SHIELD.switchable && c.ledgerLinked,
          found: ANGUS_SHIELD.switchable ? (c.ledgerLinked ? 'Matched' : 'Waiting on your books') : `${ANGUS_SHIELD.name} keeps no books of its own yet`,
        },
      ];
    case 'payroll':
      return [
        onChart(c),
        everyone(c.staffWithStart, c.staff, 'have a start date', '/people', 'start', 'Everybody has a start date'),
        { id: 'hours', label: 'Hours come in from the phone', href: '/jobs?tab=time', met: c.timesheets30 > 0, found: c.timesheets30 ? `${n(c.timesheets30, 'timesheet entry', 'timesheet entries')} in the last 30 days` : 'None in the last 30 days' },
        { id: 'payrun', label: 'A pay run has been checked in SPEC', href: '/people?mode=pay', met: c.payRunsChecked > 0, found: c.payRunsChecked ? n(c.payRunsChecked, 'pay run') + ' checked' : 'None yet' },
        { id: 'rates', label: 'Pay rates for each person', met: false, found: 'SPEC does not hold pay rates yet' },
        { id: 'cycles', label: 'Pay cycles', met: false, found: 'SPEC does not hold pay cycles yet' },
        { id: 'balances', label: 'Leave balances', met: false, found: 'SPEC does not hold leave balances yet' },
      ];
    case 'jobs':
      return [
        onChart(c),
        { id: 'customers', label: 'Your customers are in SPEC', href: '/clients', met: c.customers > 0, found: c.customers ? n(c.customers, 'customer') : 'None yet' },
        { id: 'catalogue', label: 'Your price list is in SPEC', href: '/jobs?tab=catalogue', met: c.catalogue > 0, found: c.catalogue ? n(c.catalogue, 'item') : 'Empty' },
        { id: 'jobs', label: 'Your open jobs are in SPEC', href: '/jobs', met: c.jobs > 0, found: c.jobs ? n(c.jobs, 'job') : 'None yet' },
      ];
    case 'crm':
      return [
        { id: 'customers', label: 'Your customers are in SPEC', href: '/clients', met: c.customers > 0, found: c.customers ? n(c.customers, 'customer') : 'None yet' },
      ];
    case 'people':
      return [
        onChart(c),
        everyone(c.staffWithStart, c.staff, 'have a start date', '/people', 'start', 'Everybody has a start date'),
        everyone(c.staffWithContact, c.staff, 'have a phone or email', '/people', 'contact', 'Everybody has contact details'),
      ];
    case 'safety':
      return [
        onChart(c),
        everyone(c.staffInducted, c.staff, 'inducted', '/people', 'inducted', 'Everybody is inducted'),
      ];
  }
}

/** Confirmed: the product can run it, and every check against the business's own data is met. */
export const confirmed = (a: SwitchArea, checks: readonly Check[]): boolean =>
  productReady(a) && checks.every(c => c.met);

/* ─────────────────────────────────────────────────────────────────────────────
 * The card's words
 * ───────────────────────────────────────────────────────────────────────────── */

/** The calm line at the top of the card. Only says SPEC CAN when the check says it can. */
export function didYouKnow(a: SwitchArea): string {
  if (productReady(a)) {
    return `Did you know SPEC can run your ${a.noun}? Switching won’t cause any problems — we check everything first.`;
  }
  return `Did you know ${ANGUS_SHIELD.name}, SPEC’s own, is being built to run your ${a.noun}? When it’s ready, switching won’t cause any problems — we check everything first.`;
}

/** Kris's promise, on every card. */
export const GUARANTEE = 'The Simple Guarantee: if switching isn’t easy, that month is free.';

/** The day-one rule, said once. */
export const DAY_ONE = 'Nothing changes in the systems you run today until you say so.';

/**
 * The accounting card's own lines — Kris: *"no $10k-$15k setup cost, no migration project, switch
 * when you're ready."* Shadow is offered to any business already on an accounting system.
 */
export const SHADOW_LINES = [
  'No $10k–$15k setup cost.',
  'No migration project.',
  'Switch when you’re ready.',
] as const;

export const SHADOW_OFFER = `${ANGUS_SHIELD.name} runs in Shadow beside your accounting system: your figures read as business intelligence, while it checks it can match your books. Nothing in your accounting system changes.`;

/** One line of what was found — "3 of 7 checks met". */
const checkFacts = (checks: readonly Check[]): Fact[] =>
  checks.map(c => ({ label: c.label, value: c.met ? 'Yes' : 'Not yet', note: c.found }));

export interface SwitchRow {
  state: SwitchState;
  ownerReadyAt: string | null;
  switchedAt: string | null;
}

/**
 * The recommendation for one area — what the card says and asks, in the engine's shape.
 *
 *   switched                → hold: SPEC runs it, with the way back.
 *   plan under way          → hold: n of m steps, open the plan.
 *   product or data not ready → missing: exactly what, plus "I want this" to start a plan anyway.
 *   everything checks out   → recommend: "You're ready to switch your payroll — …".
 */
export function switchAdvice(a: SwitchArea, row: SwitchRow | null, checks: readonly Check[]): Recommendation {
  const topic = topicOf(a.key);
  const facts = checkFacts(checks);
  const product = productName(a);
  const planHref = `/switch?area=${a.key}`;

  if (row?.state === 'spec') {
    return {
      kind: 'hold', topic, facts,
      headline: `${product} runs your ${a.noun}.`,
      reason: `Switched ${row.switchedAt?.slice(0, 10) ?? ''}. Your old system was never touched — undo any time.`,
      link: { label: 'See the switch', href: planHref },
    };
  }
  if (row) {
    const plan = switchPlan(a, row, checks);
    return {
      kind: 'hold', topic, facts,
      headline: row.state === 'side_by_side'
        ? `${product} is running ${a.key === 'accounting' ? 'in Shadow' : 'side by side'} for your ${a.noun}.`
        : `Your ${a.noun} switch plan is under way.`,
      reason: `${plan.done} of ${plan.steps.length} steps done.`,
      link: { label: 'Open the plan', href: planHref },
    };
  }

  const interest = {
    yes: a.key === 'accounting' ? `I want this — turn on Shadow` : 'I want this',
    action: { type: 'start_switch' as const, area: a.key },
  };
  const missing: Missing[] = [];
  if (!productReady(a)) {
    missing.push({ what: `${product} isn’t ready to run your ${a.noun} yet — we’ll tell you here when it is` });
  }
  for (const c of checks) if (!c.met && !(a.key === 'accounting' && c.id === 'match')) missing.push({ what: `${c.label} — ${c.found.toLowerCase()}`, href: c.href });

  if (missing.length) {
    return {
      kind: 'missing', topic, facts, missing, interest,
      headline: productReady(a)
        ? `Nearly ready to switch your ${a.noun}. ${missing.length === 1 ? 'One thing' : `${missing.length} things`} to sort first.`
        : `We’ll tell you when ${product} is ready to run your ${a.noun}.`,
    };
  }

  const met = checks.map(c => c.found.toLowerCase()).join(', ');
  return {
    kind: 'recommend', topic, facts,
    headline: `You’re ready to switch your ${a.noun} to ${product}.`,
    reason: `Everything checks out: ${met}. ${DAY_ONE}`,
    action: interest.action,
    yes: 'Yes, start the switch plan',
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The plan, and the switch
 * ───────────────────────────────────────────────────────────────────────────── */

export interface PlanStep {
  key: string;
  label: string;
  done: boolean;
  note?: string;
  href?: string;
}

const KEEP_DAYS = 30;

/**
 * The switch-over plan, tailored: the product's own readiness if it is Angus Shield, each of this
 * business's gaps as its own step, side by side (or Shadow) where money is at stake, the owner's
 * "I'm ready", the switch, and thirty days with the old system untouched. Every `done` is worked out
 * from the business's data and the switch's own state — there is nothing to tick.
 */
export function switchPlan(a: SwitchArea, row: SwitchRow, checks: readonly Check[], now: Date = new Date()): { steps: PlanStep[]; done: number } {
  const product = productName(a);
  const past = (s: SwitchState) => row.state === 'spec' || row.state === s;
  const steps: PlanStep[] = [];
  if (a.product === 'angus') {
    steps.push({ key: 'product', label: `${product} is ready to run your ${a.noun}`, done: productReady(a), note: productReady(a) ? undefined : 'We’ll tell you here when it is.' });
  }
  for (const c of checks) steps.push({ key: `check:${c.id}`, label: c.label, done: c.met, note: c.found, href: c.met ? undefined : c.href });
  if (a.sideBySide) {
    steps.push({
      key: 'side',
      label: a.key === 'accounting'
        ? `Run ${product} in Shadow beside your accounting system`
        : `Run both side by side for one full cycle, and compare`,
      done: past('side_by_side'),
    });
  }
  steps.push({ key: 'ready', label: 'You say you’re ready', done: Boolean(row.ownerReadyAt) || row.state === 'spec' });
  steps.push({ key: 'switch', label: `Switch to ${product}`, done: row.state === 'spec' });
  const kept = row.state === 'spec' && row.switchedAt
    && now.getTime() - Date.parse(row.switchedAt) >= KEEP_DAYS * 86_400_000;
  steps.push({ key: 'keep', label: `Keep your old system untouched for ${KEEP_DAYS} days — undo any time`, done: Boolean(kept) });
  return { steps, done: steps.filter(s => s.done).length };
}

/** Side by side (or Shadow) can start as soon as the plan exists — it changes nothing. */
export const mayRunSideBySide = (a: SwitchArea, row: SwitchRow | null): boolean =>
  Boolean(a.sideBySide && row && row.state === 'requested');

/**
 * The switch unlocks only when BOTH halves hold: the owner said ready, and SPEC's check confirmed.
 * Where side by side matters, it must have run first.
 */
export function mayUseSwitch(a: SwitchArea, row: SwitchRow | null, checks: readonly Check[]): boolean {
  if (!row || row.state === 'spec' || !row.ownerReadyAt) return false;
  if (a.sideBySide && row.state !== 'side_by_side') return false;
  return confirmed(a, checks);
}

/** Undo is always there once anything has moved. */
export const mayUndo = (row: SwitchRow | null): boolean =>
  Boolean(row && (row.state === 'side_by_side' || row.state === 'spec'));

/**
 * What stands between the owner and the switch, when they have said ready but it is not unlocked:
 * "Not available yet", with exactly what is still being checked.
 */
export function stillChecking(a: SwitchArea, row: SwitchRow | null, checks: readonly Check[]): string[] {
  const out: string[] = [];
  if (!productReady(a)) out.push(`${productName(a)} isn’t ready to run your ${a.noun} yet`);
  for (const c of checks) if (!c.met) out.push(`${c.label} — ${c.found.toLowerCase()}`);
  if (a.sideBySide && row && row.state === 'requested') {
    out.push(a.key === 'accounting' ? 'Shadow has not been turned on yet' : 'Side by side has not started yet');
  }
  return out;
}

/** The Coverage rows a switch clears, and the snapshot Undo restores. */
export function switchChoices(a: SwitchArea, choices: Choices): { clear: string[]; previous: Record<string, 'own'> } {
  const previous: Record<string, 'own'> = {};
  for (const k of a.capabilities) if (choices[k] === 'own') previous[k] = 'own';
  return { clear: Object.keys(previous), previous };
}

/** The snapshot, read back safely — anything unrecognised is dropped rather than restored. */
export function parsePrevious(raw: string, a: SwitchArea): string[] {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(obj).filter(([k, v]) => v === 'own' && a.capabilities.includes(k)).map(([k]) => k);
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The Simple Guarantee
 * ───────────────────────────────────────────────────────────────────────────── */

/** A fixed list, so SPEC can count what goes wrong without reading a word a business wrote. */
export const FRICTION_KINDS = [
  { key: 'too_many_steps', label: 'It took too many steps' },
  { key: 'missing_data', label: 'Something didn’t come across' },
  { key: 'numbers_differ', label: 'The numbers didn’t match' },
  { key: 'unclear', label: 'I wasn’t sure what to do next' },
  { key: 'other', label: 'Something else' },
] as const;

export const isFrictionKind = (k: string): boolean => FRICTION_KINDS.some(f => f.key === k);

export const monthOf = (d: Date = new Date()): string => d.toISOString().slice(0, 7);

export interface FrictionRow { tenantId: string; month: string; area: string; kind: string; at: string }

/**
 * For the operator's screen: one guarantee claim per business per month (the latest), and the
 * fixed-list kinds counted across every business. Takes rows that never carry the business's note.
 */
export function summariseClaims(rows: readonly FrictionRow[]): { claims: FrictionRow[]; kinds: Record<string, number> } {
  const kinds: Record<string, number> = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  const seen = new Set<string>();
  const claims = [...rows]
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter(r => {
      const k = `${r.tenantId}:${r.month}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { claims, kinds };
}
