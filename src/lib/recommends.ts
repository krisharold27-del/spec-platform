/**
 * Claude recommends — the one pattern every decision SPEC helps with runs through.
 *
 * Kris, 25 September: *"Same three steps everywhere: (1) Claude reviews the business's real data and
 * makes a clear recommendation with the reason ... Always show the numbers behind it in plain
 * English, one tap to see more. (2) SPEC asks the business: 'Ready to do this?' - Yes / Not yet.
 * (3) On Yes, SPEC does it ... logs the decision with the data it was based on, and shows it's done.
 * On Not yet, it waits and re-checks later."* And: *"If there isn't enough data to recommend, say
 * exactly what's missing instead of guessing."*
 *
 * Pure — no I/O. Each topic (lib/labour-rate-advice, lib/switch) turns the business's own numbers
 * into a `Recommendation`; this file decides what the card does with it.
 *
 * ── Who decides what ────────────────────────────────────────────────────────────────────────────
 *
 * SPEC does the arithmetic. Every figure on a card comes from a pure function over the business's
 * own rows, tested, and the same with or without an API key. Claude's part is the WORDING — turning
 * the figures into two plain sentences — and `wordsHold` refuses any wording that drops or changes a
 * figure the headline carries. So "read to inform, not write to change" holds: no AI path writes
 * anything. The write happens on a person's Yes, and it is exactly the action the recommendation
 * named, re-derived on the server first (`fingerprint`), so a Yes to last week's numbers cannot
 * carry out this week's.
 */

export interface Fact {
  /** What the number is, in the business's words where it has them. */
  label: string;
  value: string;
  /** Where it came from, or what it is made of. */
  note?: string;
}

export interface Missing {
  /** Exactly what is missing — "40 hours of timesheets in the last 90 days (you have 12)". */
  what: string;
  /** Where to add it. Absent when SPEC itself does not hold it yet. */
  href?: string;
}

/** What a Yes carries out. Every action is SPEC's own, named in full, and re-checked before it runs. */
export type Action =
  | { type: 'set_labour_rate'; rateId: string; chargeCents: number }
  | { type: 'start_switch'; area: string }
  /** Accepted in the meeting: the fix becomes an action with an owner, tracked in next week's report. */
  | { type: 'meeting_action'; key: string; text: string }
  /** Approve the week's timesheet entries SPEC listed as approvable — never one held back. */
  | { type: 'approve_timesheets'; week: string };

interface Base {
  topic: string;
  headline: string;
  facts: Fact[];
  /**
   * When Not yet asks again. `days` (the default) re-checks after RECHECK_DAYS. `on_change` waits
   * until the recommendation itself changes — used for offers to switch to SPEC's own products, where
   * Kris's rule is that Not yet is always respected and nothing nags (see lib/switch).
   */
  recheck?: 'days' | 'on_change';
}

export type Recommendation =
  /** A clear thing to do, and why. Asks "Ready to do this?". */
  | (Base & { kind: 'recommend'; reason: string; action: Action; yes: string })
  /** Nothing to do — the numbers hold, or it is already done. Never asks. */
  | (Base & { kind: 'hold'; reason: string; link?: { label: string; href: string } })
  /** Not enough to recommend. Says exactly what is missing; may still take an "I want this". */
  | (Base & { kind: 'missing'; missing: Missing[]; interest?: { yes: string; action: Action } });

/** A decision already made on this topic, as the card needs it. */
export interface Answered {
  answer: 'yes' | 'not_yet';
  fingerprint: string;
  decidedAt: string;
  outcome: string | null;
}

/** How long "Not yet" waits before asking again — unless the recommendation itself changes first. */
export const RECHECK_DAYS = 14;

/**
 * What a recommendation IS, for the purpose of "have they answered this one already".
 *
 * The topic and the exact action — never the supporting counts. Timesheets arrive every day; if the
 * fingerprint followed them, "Not yet" would be asked again tomorrow, which is nagging. It changes
 * when the RECOMMENDATION changes: a different rate, a different area, a different thing to do.
 */
export function fingerprint(rec: Recommendation): string {
  const action = rec.kind === 'recommend' ? rec.action : rec.kind === 'missing' ? rec.interest?.action : undefined;
  return `${rec.topic}|${rec.kind}|${action ? JSON.stringify(action) : ''}`;
}

export type CardState = 'ask' | 'waiting' | 'done' | 'hold' | 'missing';

/**
 * What the card shows, given the recommendation and the last answer to this topic.
 *
 *   hold      nothing to do.
 *   done      they said Yes to this very recommendation, and SPEC did it.
 *   waiting   they said Not yet to this very recommendation, under RECHECK_DAYS ago.
 *   missing   not enough to recommend — the list of what is missing, never a guess.
 *   ask       "Ready to do this?".
 */
export function cardState(rec: Recommendation, last: Answered | null, now: Date = new Date()): CardState {
  if (rec.kind === 'hold') return 'hold';
  const same = last && last.fingerprint === fingerprint(rec);
  if (same && last.answer === 'yes' && last.outcome === 'done') return 'done';
  if (same && last.answer === 'not_yet') {
    if (rec.recheck === 'on_change') return 'waiting';
    const waited = (now.getTime() - Date.parse(last.decidedAt)) / 86_400_000;
    if (waited < RECHECK_DAYS) return 'waiting';
  }
  return rec.kind === 'missing' ? 'missing' : 'ask';
}

/** When Not yet will ask again, said plainly. */
export function recheckLine(decidedAt: string, recheck: Recommendation['recheck'] = 'days'): string {
  if (recheck === 'on_change') return 'You said not yet. SPEC won’t raise it again unless something changes.';
  const at = new Date(Date.parse(decidedAt) + RECHECK_DAYS * 86_400_000);
  return `Not yet — SPEC will check again on ${at.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}, or sooner if the numbers change.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Claude's wording
 * ───────────────────────────────────────────────────────────────────────────── */

/** The text a recommendation is worded from — headline, reason and every figure. */
export function wordsSource(rec: Recommendation): string {
  const reason = rec.kind === 'missing'
    ? `Still missing: ${rec.missing.map(m => m.what).join('; ')}.`
    : rec.reason;
  const facts = rec.facts.map(f => `- ${f.label}: ${f.value}${f.note ? ` (${f.note})` : ''}`).join('\n');
  return `${rec.headline}\n${reason}\n${facts}`;
}

/**
 * A short, stable key for a recommendation's exact figures. FNV-1a — not security, just change
 * detection: wording written for last week's numbers is never shown beside this week's.
 */
export function wordsKey(rec: Recommendation): string {
  let h = 0x811c9dc5;
  const s = wordsSource(rec);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const WORDS_SYSTEM = [
  'You word recommendations for the owner of a trade business, inside SPEC.',
  'Rewrite the draft as two or three plain sentences: what to do, and why, using the figures.',
  'Keep every dollar figure, percentage and count exactly as written. Add no figure that is not in the draft.',
  'Never claim anything is ready when the draft says it is not. If things are missing, name each one.',
  'These are mature adults: no pep talk, no exclamation marks, no advice about how they feel.',
  'Australian English. Plain text only. No preamble.',
].join(' ');

/** The figures a headline carries — dollars, percentages and plain counts. */
export const figuresIn = (text: string): string[] =>
  text.match(/\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d+\b/g) ?? [];

/**
 * Whether Claude's wording may be shown.
 *
 * Every figure in the headline must survive into the wording, it must not be empty or run on, and it
 * must never say "coming soon" — anything not ready is "we'll tell you when it's ready", driven by
 * the check. When it fails, SPEC's own wording stands: it is the one that is always there anyway.
 */
export function wordsHold(rec: Recommendation, text: string): boolean {
  const t = text.trim();
  if (t.length < 20 || t.length > 700) return false;
  if (/coming soon/i.test(t)) return false;
  if (rec.kind !== 'recommend' && /\bready to (switch|go)\b/i.test(t) && !/\bnot\b/i.test(t)) return false;
  return figuresIn(rec.headline).every(f => t.includes(f));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Money, said the way a person says it
 * ───────────────────────────────────────────────────────────────────────────── */

/** $105, or $105.50 when there are cents. */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const pct = (share: number): string => `${Math.round(share * 100)}%`;
