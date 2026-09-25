/**
 * "Hang on a second, is this correct?" — the only way SPEC is allowed to tell somebody they are wrong.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"never a red WRONG"*. The wording is fixed: the question, the reason in plain words, and two
 * buttons — *"Yes, it's right"* and *"Let me check"*.
 *
 * ── Why the wording is load-bearing and not decoration ───────────────────────────────────────────
 *
 * A validation message is a piece of software calling a person wrong, and there are only two things
 * that can happen next. Either the software is right, in which case it wants the person to look
 * again — and a red WRONG makes people defensive, so they look less carefully, not more. Or the
 * software is wrong, which for anything worth warning about is most of the time: a 14-hour day
 * really was a 14-hour day on a shutdown, and a quote really is under cost because the client is
 * getting one at cost. In that case a red WRONG has just told a tradesman that the office system
 * thinks he is lying, and he will remember that longer than anybody who wrote the rule.
 *
 * So the question is genuinely a question, and "Yes, it's right" is a real answer that keeps what
 * they entered. It records the choice for their leader to see, which is the whole safety net: the
 * business finds out a fortnight later that somebody confirmed six over-12-hour days in a row, and
 * that is a conversation, not a blocked timesheet at 6pm on site.
 *
 * ── What these are not ───────────────────────────────────────────────────────────────────────────
 *
 * Not a permission gate. Nothing here stops anybody doing anything — if it should be stopped, it
 * belongs in `lib/refuse` or in the pay-run checks, which do refuse and say why. Mixing the two
 * would be the worst outcome: a soft question that sometimes turns out to be a hard block teaches
 * people to distrust every soft question.
 */

/** The question. One string, used everywhere, so it cannot drift into seven slightly different ones. */
export const ASK = 'Hang on a second, is this correct?';

export const YES = "Yes, it's right";
export const CHECK = 'Let me check';

/** The seven places. From the design; each one is a moment where the cost of being wrong is real. */
export type GentleKey =
  | 'under_cost'      // a quote priced below what it costs to do
  | 'hours_mismatch'  // hours entered that do not match the job
  | 'leave_over'      // paying leave the person does not have
  | 'long_day'        // a timesheet over twelve hours
  | 'invoice_differs' // an invoice that is not the quote
  | 'own_spend'       // approving your own spend
  | 'deleting';       // deleting a record

export interface Gentle {
  key: GentleKey;
  ask: string;
  /** The reason, in plain words. Filled in with the business's own facts by `gentle()`. */
  because: string;
  yes: string;
  check: string;
}

/**
 * The reason each one gives.
 *
 * Written as sentences a person would say rather than as rules. "Hours entered do not match job
 * estimate" is a rule; "this job was quoted at 6 hours and there are 14 on it" is something
 * somebody can actually check.
 */
const BECAUSE: Record<GentleKey, (facts: Record<string, string>) => string> = {
  under_cost: f =>
    `This quote comes to ${f.price ?? 'less'} and the work costs ${f.cost ?? 'more'} to do. That is money out the door on every one of these you win — unless you meant to, which happens.`,
  hours_mismatch: f =>
    `This job was quoted at ${f.quoted ?? 'fewer'} hours and there ${f.actual === '1' ? 'is' : 'are'} ${f.actual ?? 'more'} on it. Either the job grew, or the hours went somewhere else.`,
  leave_over: f =>
    `${f.who ?? 'They'} ${f.balance ? `have ${f.balance}` : 'do not have enough'} and this is for ${f.asked ?? 'more'}. Leave in advance is allowed, it just needs somebody to decide it deliberately.`,
  long_day: f =>
    `That is ${f.hours ?? 'over twelve'} hours in one day. Sometimes that is a shutdown and sometimes it is a clock that never got stopped.`,
  invoice_differs: f =>
    `The quote was ${f.quoted ?? 'one amount'} and this invoice is ${f.invoiced ?? 'another'}. If there were variations they should be on it; if there were not, the customer is about to ring.`,
  own_spend: f =>
    `This is your own ${f.what ?? 'spend'}. Perfectly normal — it just should not be you who signs it off, because nobody should be the only person who checked their own.`,
  deleting: f =>
    `This would delete ${f.what ?? 'this record'} for good. ${f.attached ? `${f.attached} attached to it goes too.` : 'It does not come back.'}`,
};

/**
 * Build one prompt.
 *
 * `facts` are the business's own; anything missing falls back to wording that is still true without
 * it, rather than to a blank or a placeholder. A prompt that reads "this job was quoted at
 * undefined hours" is worse than no prompt, because it is the moment somebody stops believing the
 * software knows anything.
 */
export function gentle(key: GentleKey, facts: Record<string, string> = {}): Gentle {
  return { key, ask: ASK, because: BECAUSE[key](facts), yes: YES, check: CHECK };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What happens after "Yes, it's right"
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Confirmed {
  key: GentleKey;
  who: string;
  at: string;
  /** What they confirmed, so the leader reading it later does not have to go and find out. */
  what: string;
}

/**
 * What the leader sees.
 *
 * Grouped by person and kind, because one confirmed long day is a Tuesday and five in a fortnight is
 * something the business needs to know about. Showing them as a list of individual events would bury
 * exactly the pattern this exists to surface.
 */
export interface Pattern {
  key: GentleKey;
  who: string;
  times: number;
  last: string;
  says: string;
}

/** How many of the same confirmation before it stops being a one-off. */
export const PATTERN_AT = 3;

const PATTERN_SAYS: Record<GentleKey, (n: number, who: string) => string> = {
  under_cost: (n, w) => `${w} has confirmed ${n} quotes priced under cost. Either the pricing is wrong or the rate is.`,
  hours_mismatch: (n, w) => `${w} has confirmed ${n} jobs where the hours did not match the quote. The estimates may be the problem, not the hours.`,
  leave_over: (n, w) => `${n} leave requests approved over balance for ${w}. Worth a look at the balance itself.`,
  long_day: (n, w) => `${w} has confirmed ${n} days over twelve hours. That is a fatigue question before it is a payroll one.`,
  invoice_differs: (n, w) => `${n} invoices from ${w} have not matched the quote. Variations are probably not getting written down.`,
  own_spend: (n, w) => `${w} has signed off their own spend ${n} times. Somebody else should be doing it.`,
  deleting: (n, w) => `${w} has deleted ${n} records. Probably tidying up — worth knowing which ones.`,
};

export function patterns(confirmed: readonly Confirmed[]): Pattern[] {
  const by = new Map<string, Confirmed[]>();
  for (const c of confirmed) {
    const k = `${c.key}|${c.who}`;
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  return [...by.values()]
    .filter(list => list.length >= PATTERN_AT)
    .map(list => {
      const first = list[0];
      const last = list.map(c => c.at).sort().at(-1)!;
      return { key: first.key, who: first.who, times: list.length, last, says: PATTERN_SAYS[first.key](list.length, first.who) };
    })
    .sort((a, b) => b.times - a.times);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The hours nudge
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The light nudge at the start of the day, to the tech AND their supervisor.
 *
 * Both, deliberately. Telling only the tech makes it their problem to solve alone on site; telling
 * only the supervisor makes it surveillance. Telling both makes it a shared number, which is what it
 * is — the estimate was somebody else's work.
 */
export function hoursNudge(hoursLeft: number | null, ref: string): string | null {
  if (hoursLeft === null) return null;
  if (hoursLeft <= 0) {
    return `${ref} has used its hours. Anything more needs a word with your supervisor — it is not a problem, it just has to be known about.`;
  }
  const h = hoursLeft % 1 === 0 ? String(hoursLeft) : hoursLeft.toFixed(1);
  return `${ref} has ${h} ${hoursLeft === 1 ? 'hour' : 'hours'} left. Finish within ${h} if you can.`;
}

export const NUDGE_GOES_TO_BOTH =
  'This goes to the person doing the work and their supervisor at the same time. The estimate was not theirs, so the number is not theirs to carry alone.';
