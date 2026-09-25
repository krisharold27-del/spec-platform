/**
 * Money the business is owed by the tax system, and the one thing SPEC must not do about it.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"SPEC captures from spend and activity: fuel tax credits, solar/energy rebates (STCs, state
 * schemes), instant asset write-off & depreciation, apprentice/trainee incentives, R&D and industry
 * grants, GST credits, tools/PPE/training/vehicle deductions, payroll tax thresholds & rebates,
 * workers' comp premium adjusted to actual wages. SPEC WORKS OUT each claim; the ACCOUNTANT CLAIMS
 * it. ... Amounts are samples; rules and rates must come from current ATO/state sources."*
 *
 * ── The division of labour, and why it is not timidity ───────────────────────────────────────────
 *
 * SPEC finds the BASIS. It knows there were nine utes burning diesel, three solar installs, seven
 * apprentices and $180,000 less in wages than the workers' comp estimate assumed — and it knows
 * those things because it already holds the jobs, the spend and the pay runs, which no accountant
 * has in front of them in March.
 *
 * The accountant does the CLAIM. Not because SPEC could not multiply, but because every one of
 * these has eligibility rules, thresholds and rates that change by year and by state, and because
 * the person who signs the return carries the liability for it. A number SPEC produced and a
 * business lodged without anybody checking is a number the business is answerable for and nobody
 * examined.
 *
 * ── So there are no rates in this file ───────────────────────────────────────────────────────────
 *
 * `tests/owed.test.ts` fails the build if a cents-per-litre, a percentage or a threshold appears
 * here. An amount is shown only where the business has supplied the rate itself, with a source and
 * a date — the same rule as `lib/pay-run` and for a sharper reason: a fuel tax credit rate SPEC
 * made up, multiplied by a real litre count, produces a completely plausible figure that is wrong,
 * and it goes on a BAS.
 *
 * What SPEC shows without a rate is the basis, in the business's own facts. "Diesel in 9 utes and 2
 * generators, July to September" is worth taking to an accountant. "$3,180" that nobody can source
 * is worth less than nothing.
 */

export type ClaimKey =
  | 'fuel_tax' | 'gst' | 'instant_asset' | 'tools_ppe' | 'apprentice'
  | 'stc' | 'payroll_tax' | 'workers_comp' | 'grants';

export interface ClaimKind {
  key: ClaimKey;
  label: string;
  /** What SPEC looks at to find it — and therefore why SPEC can see it and an accountant cannot. */
  from: string;
  /**
   * Why it is the accountant's to lodge. Said per claim, because the reasons differ and a single
   * blanket disclaimer is a thing people stop reading.
   */
  theirs: string;
}

/** The nine. Every one of them is money a business is entitled to and routinely does not claim. */
export const CLAIMS: ClaimKind[] = [
  {
    key: 'fuel_tax', label: 'Fuel tax credits',
    from: 'Fuel bought on the company card, matched to the vehicles and plant it went into.',
    theirs: 'The rate differs by what the fuel was used for and it changes twice a year.',
  },
  {
    key: 'gst', label: 'GST credits',
    from: 'Every purchase with a receipt against it this quarter.',
    theirs: 'Whether each one is creditable depends on what it was for, and a receipt is required for it.',
  },
  {
    key: 'instant_asset', label: 'Instant asset write-off and depreciation',
    from: 'Tools, test equipment and vehicles bought this year, from the spend against them.',
    theirs: 'The threshold and whether the scheme is running at all change with each Budget.',
  },
  {
    key: 'tools_ppe', label: 'Tools, PPE, training and vehicles',
    from: 'What the business bought for its people — boots, glasses, harnesses, courses.',
    theirs: 'Deductibility turns on who used it and what for, which is a judgement.',
  },
  {
    key: 'apprentice', label: 'Apprentice and trainee incentives',
    from: 'Apprentices on the chart, their year, and the dates their claims open.',
    theirs: 'Eligibility runs through the Apprenticeship Support Network, not the ATO.',
  },
  {
    key: 'stc', label: 'Solar and energy rebates',
    from: 'Solar and efficiency jobs finished this quarter, and the certificates they created.',
    theirs: 'STC pricing moves daily and the state schemes each have their own rules.',
  },
  {
    key: 'payroll_tax', label: 'Payroll tax thresholds and rebates',
    from: 'Wages from the approved pay runs, with apprentice wages separated out.',
    theirs: 'Every state has its own threshold and its own exemptions, and they move each year.',
  },
  {
    key: 'workers_comp', label: 'Workers’ compensation premium',
    from: 'Actual wages paid, against the estimate the premium was set on.',
    theirs: 'The adjustment is made by the insurer, on their own cycle.',
  },
  {
    key: 'grants', label: 'R&D and industry grants',
    from: 'Jobs and work that may qualify, flagged for somebody to look at.',
    theirs: 'Whether anything qualifies is a genuine judgement, not a calculation.',
  },
];

export const claimByKey = (key: string): ClaimKind | undefined => CLAIMS.find(c => c.key === key);

/**
 * What SPEC found, for one claim.
 *
 * `basis` is always present — it is the whole point. `amountCents` is present only where the
 * business has given SPEC the rate, with a source.
 */
export interface Found {
  kind: ClaimKind;
  /** The business's own facts: "9 utes and 2 generators, Jul to Sep". */
  basis: string;
  /** Null unless the business supplied a rate that SPEC could apply. */
  amountCents: number | null;
  /** Where the rate came from. Required whenever `amountCents` is set. */
  rateSource: string | null;
  /** Set when it has gone to the accountant. */
  sentAt: string | null;
  sentTo: string | null;
}

export type FoundState = 'basis_only' | 'costed' | 'with_accountant';

export function stateOf(f: Found): FoundState {
  if (f.sentAt) return 'with_accountant';
  return f.amountCents !== null && f.rateSource ? 'costed' : 'basis_only';
}

const money = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-AU')}`;

/**
 * What to show for one claim.
 *
 * The basis first, always. An amount is an extra, not the headline — because the thing the business
 * takes to its accountant is the basis, and an amount without one is a number nobody can check.
 */
export function foundLine(f: Found): string {
  if (f.sentAt) {
    return `${f.basis} — with ${f.sentTo ?? 'your accountant'} since ${f.sentAt.slice(0, 10)}.`;
  }
  if (f.amountCents !== null && f.rateSource) {
    return `${f.basis} — ${money(f.amountCents)} at the rate you set (${f.rateSource}).`;
  }
  return `${f.basis} SPEC has the basis and not the rate, so there is no figure here — your accountant puts one on it.`;
}

/**
 * The total, which is deliberately only ever a total of what has been costed.
 *
 * A "total" that silently left out six of nine claims because SPEC had no rate for them would be
 * the most misleading number on the screen: an owner reading it would think that was the lot.
 */
export interface OwedReading {
  found: Found[];
  costedCents: number | null;
  costed: number;
  basisOnly: number;
  sent: number;
  says: string;
}

export function readOwed(found: readonly Found[]): OwedReading {
  const costedList = found.filter(f => f.amountCents !== null && f.rateSource);
  const basisOnly = found.filter(f => stateOf(f) === 'basis_only').length;
  const sent = found.filter(f => f.sentAt).length;
  const costedCents = costedList.length > 0
    ? costedList.reduce((a, f) => a + (f.amountCents ?? 0), 0)
    : null;

  return {
    found: [...found],
    costedCents,
    costed: costedList.length,
    basisOnly,
    sent,
    says: owedLine(found.length, costedList.length, basisOnly, sent, costedCents),
  };
}

function owedLine(
  total: number, costed: number, basisOnly: number, sent: number, cents: number | null,
): string {
  if (total === 0) return 'Nothing found yet. This fills in as the spend, the jobs and the pay runs build up.';

  const bits: string[] = [];
  if (cents !== null) {
    bits.push(`${money(cents)} across ${costed} ${costed === 1 ? 'claim' : 'claims'} you have set a rate for`);
  }
  if (basisOnly > 0) {
    bits.push(`${basisOnly} more SPEC has found and cannot put a figure on`);
  }
  if (sent > 0) bits.push(`${sent} with your accountant`);

  const head = bits.join(' · ');
  return basisOnly > 0
    ? `${head}. The ones without a figure are not smaller — they are the ones whose rates change, and your accountant sets those.`
    : `${head}.`;
}

export const ACCOUNTANT_CLAIMS_IT =
  'SPEC finds these because it already holds your jobs, your spend and your pay runs. Your accountant claims them, because every one has eligibility rules that change by year and by state — and because the person who signs the return is the person who has to stand behind it.';

export const WHY_NO_FIGURE =
  'SPEC will not put a dollar figure on a claim without a rate you have given it and a source for that rate. A made-up rate times a real litre count produces a completely believable number that is wrong, and it ends up on a BAS.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Debtors, which is the other kind of money owed
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * When a reminder goes, in days past the invoice.
 *
 * These are the BUSINESS's own choice, not law, which is why they are allowed to be here at all —
 * unlike a statutory window, nothing bad happens if a business reminds a customer on day 8 instead
 * of day 7. Kris's numbers, and a business can change them.
 */
export const REMIND_AT = [7, 14, 30, 45] as const;

/** Past this, a reminder is not the answer any more. */
export const OWNER_RINGS_AT = 45;

/** Past this it has stopped being a debtor. */
export const BAD_DEBT_NEAR = 90;

export interface Debt {
  id: string;
  client: string;
  ref: string;
  cents: number;
  days: number;
  remindedAt: readonly number[];
}

export type DebtAction = 'inside_terms' | 'remind' | 'owner_rings' | 'bad_debt';

export interface DebtWatch {
  debt: Debt;
  action: DebtAction;
  /** Which reminder is due, when one is. */
  remindDay: number | null;
  says: string;
}

/**
 * What to do about one overdue invoice.
 *
 * Returns the LAST due reminder rather than the first unsent one — the same rule as the quote
 * chases in `lib/growth`. An invoice nobody touched for forty days should get the forty-day
 * message, not a gentle first nudge five weeks late, which reads as a business that has not been
 * paying attention and tells the customer exactly that.
 */
export function debtWatch(debt: Debt): DebtWatch {
  if (debt.days >= BAD_DEBT_NEAR) {
    return {
      debt, action: 'bad_debt', remindDay: null,
      says: `${money(debt.cents)} at ${debt.days} days. Past ninety it is not a debtor any more, and the decision is what you are prepared to do about it.`,
    };
  }
  if (debt.days > OWNER_RINGS_AT) {
    return {
      debt, action: 'owner_rings', remindDay: null,
      says: `${money(debt.cents)} at ${debt.days} days. Reminders have stopped working — this is a call you have to make.`,
    };
  }
  const due = [...REMIND_AT].filter(d => debt.days >= d && !debt.remindedAt.includes(d));
  if (due.length > 0) {
    const day = due[due.length - 1];
    return {
      debt, action: 'remind', remindDay: day,
      says: `${money(debt.cents)} at ${debt.days} days. The ${day}-day reminder is due.`,
    };
  }
  return {
    debt, action: 'inside_terms', remindDay: null,
    says: `${money(debt.cents)} at ${debt.days} days.`,
  };
}

export const needsChasing = (debts: readonly Debt[]): DebtWatch[] =>
  debts
    .map(debtWatch)
    .filter(w => w.action !== 'inside_terms')
    .sort((a, b) => b.debt.days - a.debt.days);

export function debtorsLine(debts: readonly Debt[]): string {
  if (debts.length === 0) return 'Nothing overdue.';
  const chasing = needsChasing(debts);
  const bad = chasing.filter(w => w.action === 'bad_debt').length;
  const calls = chasing.filter(w => w.action === 'owner_rings').length;
  const total = debts.reduce((a, d) => a + d.cents, 0);

  const bits = [`${money(total)} overdue`];
  if (calls > 0) bits.push(`${calls} past 45 days — ${calls === 1 ? 'a call' : 'calls'} you have to make`);
  if (bad > 0) bits.push(`${bad} near 90`);
  return `${bits.join(' · ')}.`;
}

export const NOTHING_OVER_45 =
  'Nothing over 45 days, nothing near 90. Reminders go by themselves at 7, 14, 30 and 45; past that a reminder is not what is missing, and it becomes a call the owner makes.';
