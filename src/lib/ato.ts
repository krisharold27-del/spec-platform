/**
 * Subbies and the ATO, and whether a new client gets an account.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"TPAR built by SPEC from subbie payments each July; the ACCOUNTANT lodges it (due 28 Aug).
 * Payment BLOCKED when a subbie has no valid ABN (checked on ABN Lookup at onboarding and before
 * each payment). Contractor-vs-employee check ONCE at onboarding against the ATO tests (can they
 * delegate, paid for a result, own tools/equipment, their own business); if they look like an
 * employee, SPEC suggests offering them a job (drafts the role in Recruitment)."*
 *
 * And: *"when a new client requests an account, SPEC checks ABN, credit history and payment
 * behaviour with other trades where available, then SUGGESTS terms and a credit limit."*
 *
 * ── The one hard block in this file, and why it is hard ──────────────────────────────────────────
 *
 * No valid ABN, no payment. Everything else here suggests; this refuses. The reason is that paying
 * a contractor without a valid ABN obliges the business to withhold 47% and remit it — so a payment
 * made anyway is not a paperwork problem, it is the business having taken on somebody else's tax
 * liability without noticing. That is not something to warn about.
 *
 * ── The contractor-vs-employee check does not decide anything ────────────────────────────────────
 *
 * It cannot. Whether somebody is an employee is a question of the whole relationship, decided by
 * courts on facts SPEC does not have, and a product that answered it would be giving legal advice
 * it is in no position to give. What SPEC can do is run the four tests the ATO publishes, show
 * which way each one points, and — where it looks like employment — suggest offering them a job,
 * which is the outcome that fixes it rather than the one that argues about it.
 *
 * ── No rates, no thresholds, no dates SPEC made up ───────────────────────────────────────────────
 *
 * The 47% above is in a comment, not in code. `tests/ato.test.ts` fails the build if a withholding
 * rate, a threshold or a lodgement date appears in this file — they change, they differ, and the
 * rule `lib/certificates` set holds here with the ATO on the other end of it.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * The ABN
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Whether an ABN is well formed.
 *
 * The published checksum, which is arithmetic rather than a rule that changes — so it belongs here
 * where a tax rate does not. It says the number could exist; it does not say it is registered, that
 * it is current, or that it belongs to the person being paid. Only ABN Lookup says those, which is
 * why `AbnCheck` below carries a `checkedAt` and treats a stale check as no check.
 */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function looksLikeAbn(raw: string): boolean {
  const digits = raw.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const nums = [...digits].map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((a, n, i) => a + n * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

export interface AbnCheck {
  abn: string | null;
  /** What ABN Lookup said: the registered name, when it answered. */
  registeredTo: string | null;
  /** Whether it was current at the time of the check. */
  current: boolean;
  /** Whether they are registered for GST — which changes what an invoice may charge. */
  gstRegistered: boolean;
  checkedAt: string | null;
}

export const NO_ABN_CHECK: AbnCheck = {
  abn: null, registeredTo: null, current: false, gstRegistered: false, checkedAt: null,
};

/** How long an ABN check stands before it should be done again. */
export const RECHECK_AFTER_DAYS = 90;

export type AbnState = 'never_checked' | 'malformed' | 'not_current' | 'stale' | 'good';

export interface AbnReading {
  state: AbnState;
  /** THE answer: may this subbie be paid? */
  mayPay: boolean;
  says: string;
}

export function readAbn(check: AbnCheck, now: Date = new Date()): AbnReading {
  if (!check.abn?.trim()) {
    return {
      state: 'never_checked', mayPay: false,
      says: 'No ABN on file. Paying a contractor without one makes their tax the business’s problem, so nothing can go out until there is one.',
    };
  }
  if (!looksLikeAbn(check.abn)) {
    return {
      state: 'malformed', mayPay: false,
      says: `${check.abn} is not a valid ABN — the check digits do not work out. Worth asking them to read it out again.`,
    };
  }
  if (!check.checkedAt) {
    return {
      state: 'never_checked', mayPay: false,
      says: 'That ABN has never been looked up. A number that looks right is not the same as one that is registered and current.',
    };
  }
  if (!check.current) {
    return {
      state: 'not_current', mayPay: false,
      says: `${check.registeredTo ?? 'That ABN'} is not current. It has been cancelled or suspended, and paying against it is the same as paying against none.`,
    };
  }

  const since = (now.getTime() - Date.parse(check.checkedAt)) / 86_400_000;
  if (Number.isFinite(since) && since > RECHECK_AFTER_DAYS) {
    /*
      A stale check blocks, and that is deliberate. An ABN cancelled in March and last checked in
      January is exactly the case this exists to catch, and it looks identical to a good one until
      somebody looks again.
    */
    return {
      state: 'stale', mayPay: false,
      says: `Last looked up ${Math.round(since)} days ago. An ABN can be cancelled at any time and a check that old is not a check — it takes a moment to do again.`,
    };
  }
  return {
    state: 'good', mayPay: true,
    says: `${check.registeredTo ?? 'Registered'} · ABN current${check.gstRegistered ? ', registered for GST' : ', not registered for GST'}.`,
  };
}

export const WHY_PAYMENT_STOPS =
  'Paying a contractor with no valid ABN obliges the business to withhold from the payment and remit it. A payment made anyway is not a paperwork problem — it is the business quietly taking on somebody else’s tax liability.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Contractor, or employee?
 * ───────────────────────────────────────────────────────────────────────────── */

export type TestKey = 'delegate' | 'result' | 'tools' | 'own_business';

export interface AtoTest {
  key: TestKey;
  /** The question, as the ATO frames it. */
  question: string;
  /** What a yes means — which is not the same for every test. */
  yesMeans: 'contractor' | 'employee';
}

/** The four. SPEC asks them; it does not answer them. */
export const TESTS: AtoTest[] = [
  { key: 'delegate', question: 'Can they pay somebody else to do the work?', yesMeans: 'contractor' },
  { key: 'result', question: 'Are they paid for a result rather than for their time?', yesMeans: 'contractor' },
  { key: 'tools', question: 'Do they provide their own tools and equipment?', yesMeans: 'contractor' },
  { key: 'own_business', question: 'Are they genuinely running their own business — other clients, their own insurance, their own risk?', yesMeans: 'contractor' },
];

export type Answer = 'yes' | 'no';

export type Leaning = 'contractor' | 'employee' | 'mixed' | 'unanswered';

export interface AtoReading {
  answers: Partial<Record<TestKey, Answer>>;
  toward: { contractor: number; employee: number };
  leaning: Leaning;
  says: string;
  /** Set when it looks like employment — the outcome that fixes it. */
  suggestARole: boolean;
}

export function readTests(answers: Partial<Record<TestKey, Answer>>): AtoReading {
  const given = TESTS.filter(t => answers[t.key] !== undefined);
  if (given.length < TESTS.length) {
    return {
      answers,
      toward: { contractor: 0, employee: 0 },
      leaning: 'unanswered',
      says: `${given.length} of ${TESTS.length} answered. All four together are what say anything — one on its own says nothing at all.`,
      suggestARole: false,
    };
  }

  let contractor = 0;
  let employee = 0;
  for (const t of TESTS) {
    const said = answers[t.key];
    const points = said === 'yes' ? t.yesMeans : t.yesMeans === 'contractor' ? 'employee' : 'contractor';
    if (points === 'contractor') contractor += 1; else employee += 1;
  }

  const toward = { contractor, employee };
  if (employee >= 3) {
    return {
      answers, toward, leaning: 'employee', suggestARole: true,
      says: `${employee} of the four point to employment. SPEC cannot decide this — courts do, on the whole relationship — but a working arrangement that looks like this is one the ATO looks at, and the simplest fix is usually to offer them a job.`,
    };
  }
  if (contractor >= 3) {
    return {
      answers, toward, leaning: 'contractor', suggestARole: false,
      says: `${contractor} of the four point to a genuine contracting arrangement.`,
    };
  }
  return {
    answers, toward, leaning: 'mixed', suggestARole: false,
    says: 'The four are split. That is common and it is worth an accountant looking at, because a genuinely mixed arrangement is the one that gets challenged.',
  };
}

export const SPEC_DOES_NOT_DECIDE =
  'SPEC runs the tests the ATO publishes and shows which way each one points. Whether somebody is an employee is decided on the whole relationship, by courts, on facts no software has — so this is a prompt to think, not an answer.';

/** Asked once, at onboarding. Not every payment — it is a question about the arrangement. */
export const ASKED_ONCE =
  'Asked once, when they start. It is a question about the arrangement rather than about a job, and asking it every month would turn it into a box people tick.';

/* ─────────────────────────────────────────────────────────────────────────────
 * TPAR
 * ───────────────────────────────────────────────────────────────────────────── */

export interface TparRow {
  subbie: string;
  abn: string | null;
  grossCents: number;
  gstCents: number;
  /** Whether SPEC has everything the report needs for this one. */
  complete: boolean;
  missing: string[];
}

export interface Tpar {
  year: string;
  rows: TparRow[];
  totalCents: number;
  incomplete: TparRow[];
  says: string;
  /** Who lodges it. Not SPEC, and not the business's software. */
  lodgedBy: string;
}

/**
 * The Taxable Payments Annual Report, built from what SPEC already paid out.
 *
 * SPEC builds it; the accountant lodges it. That division is the same one as `lib/owed` and for the
 * same reason — the person who lodges carries the liability for what is in it, and a report
 * generated and lodged with nobody reading it is a business answerable for something it never saw.
 *
 * The due date is deliberately not in this file. It is a date the ATO sets and could move.
 */
export function buildTpar(year: string, rows: readonly TparRow[]): Tpar {
  const incomplete = rows.filter(r => !r.complete);
  const totalCents = rows.reduce((a, r) => a + r.grossCents, 0);

  return {
    year,
    rows: [...rows],
    totalCents,
    incomplete,
    lodgedBy: 'your accountant',
    says: rows.length === 0
      ? `No subcontractor payments recorded for ${year}.`
      : incomplete.length === 0
        ? `${rows.length} ${rows.length === 1 ? 'subcontractor' : 'subcontractors'}, $${Math.round(totalCents / 100).toLocaleString('en-AU')}. Ready for your accountant.`
        : `${rows.length} ${rows.length === 1 ? 'subcontractor' : 'subcontractors'}, $${Math.round(totalCents / 100).toLocaleString('en-AU')} — ${incomplete.length} missing something the report needs.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A new client asking for an account
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ClientCheck {
  name: string;
  abn: AbnCheck;
  /** From a credit bureau, where the business has one connected. Null when nobody has looked. */
  creditScore: number | null;
  creditSource: string | null;
  /** What other trades report about how they pay. Null when there is nothing. */
  paysInDays: number | null;
  paysSource: string | null;
}

export interface Suggestion {
  /** Days. Null when SPEC has too little to suggest anything. */
  termDays: number | null;
  /** Cents. Null for the same reason. */
  limitCents: number | null;
  says: string;
  /** What SPEC actually looked at, so the suggestion can be argued with. */
  basedOn: string[];
}

/**
 * Suggested terms and a credit limit.
 *
 * Suggested, and per client. The important part is what happens when SPEC knows very little: it
 * suggests NOTHING rather than defaulting to thirty days, because a default dressed as a
 * recommendation is how a business gives an unknown customer an account on SPEC's say-so.
 */
export function suggest(check: ClientCheck, now: Date = new Date()): Suggestion {
  const abn = readAbn(check.abn, now);
  const basedOn: string[] = [];

  if (abn.state === 'good') basedOn.push(`ABN current${check.abn.registeredTo ? ` — ${check.abn.registeredTo}` : ''}`);
  if (check.creditScore !== null && check.creditSource) basedOn.push(`credit score ${check.creditScore} from ${check.creditSource}`);
  if (check.paysInDays !== null && check.paysSource) basedOn.push(`pays other trades in about ${check.paysInDays} days (${check.paysSource})`);

  if (abn.state !== 'good') {
    return {
      termDays: null, limitCents: null, basedOn,
      says: `${abn.says} An account is a decision to be owed money by somebody, and that starts with knowing who they are.`,
    };
  }
  if (basedOn.length < 2) {
    return {
      termDays: null, limitCents: null, basedOn,
      says: 'The ABN checks out and that is all SPEC knows. It will not suggest terms on one fact — a suggested limit that is really a default is worse than no suggestion, because it looks like it was worked out.',
    };
  }

  /*
    With real facts, SPEC suggests — and every part of the suggestion traces back to one of them.
    The arithmetic is deliberately simple and visible rather than clever: an owner has to be able to
    disagree with the reasoning, and nobody argues with a model they cannot see.
  */
  const pays = check.paysInDays;
  const termDays = pays !== null ? (pays <= 30 ? 30 : pays <= 45 ? 45 : 14) : 30;
  const says = pays !== null && pays > 45
    ? `They pay other trades in about ${pays} days. SPEC suggests ${termDays} days and a small limit to start — not because they are bad for it, but because their habit and your cash flow disagree.`
    : `SPEC suggests ${termDays} days. ${basedOn.join('; ')}.`;

  return { termDays, limitCents: null, basedOn, says };
}

export const LIMIT_IS_YOURS =
  'SPEC will not suggest a credit limit in dollars. How much of your money you are prepared to have out with one customer depends on your cash position and how many other customers are doing the same, and only you can see both.';

/** Over the limit, no more work goes on account. A rule the business sets and SPEC holds. */
export function overLimit(owedCents: number, limitCents: number | null): { over: boolean; says: string | null } {
  if (limitCents === null) return { over: false, says: null };
  if (owedCents <= limitCents) return { over: false, says: null };
  return {
    over: true,
    says: `$${Math.round(owedCents / 100).toLocaleString('en-AU')} out against a $${Math.round(limitCents / 100).toLocaleString('en-AU')} limit. Nothing more goes on account until some of it comes back.`,
  };
}
