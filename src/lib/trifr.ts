/**
 * TRIFR, LTIFR, and the alert that goes up the moment somebody is hurt.
 *
 * ── Why SPEC can do this and a safety folder cannot ──────────────────────────────────────────────
 *
 * Kris: *"TRIFR figures easy as the system knows total hours"*.
 *
 * That is the whole point. The frequency rate is injuries against HOURS WORKED, and the reason most
 * small businesses quote a number they are not sure of is that the injuries are in one system and
 * the hours are in another — so the denominator is somebody's estimate of headcount times an
 * average week. SPEC holds both: the injuries are on the safety register and the hours are on the
 * timesheets, so the rate is a calculation rather than a guess.
 *
 * It matters commercially as well as morally. A builder asking for a TRIFR before letting anybody
 * on site is asking a question most subcontractors answer with a number they made up, and being
 * able to answer it from real hours is the difference between winning that work and not.
 *
 * ── The million hours ────────────────────────────────────────────────────────────────────────────
 *
 * The convention is per million hours worked — about five hundred people working a year. A business
 * of forty will do roughly eighty thousand hours a year, so its rate is scaled up more than tenfold
 * and ONE injury moves it a long way. That is not a flaw in the measure; it is why a small
 * business's rate has to be read with the hours beside it, and why this always reports both.
 */

/** The convention: injuries per million hours worked. */
export const PER_HOURS = 1_000_000;

/**
 * Which injuries count.
 *
 * ── Recordable is not "all of them" ──────────────────────────────────────────────────────────────
 *
 * A first aid injury — a plaster from the kit — is NOT recordable, and including it would make the
 * business's rate look worse than a competitor's who counts correctly. Medical treatment, lost time
 * and a serious injury all are.
 *
 * SPEC does not quietly decide this: the list is here, named, so anybody comparing their number
 * with a builder's expectation can see exactly what went into it.
 */
export const RECORDABLE = ['medical', 'lost_time', 'serious'] as const;

/** Lost time is the narrower one: somebody could not do their job the next day. */
export const LOST_TIME = ['lost_time', 'serious'] as const;

export const isRecordable = (severity: string | null): boolean =>
  RECORDABLE.includes(String(severity) as (typeof RECORDABLE)[number]);

export const isLostTime = (severity: string | null): boolean =>
  LOST_TIME.includes(String(severity) as (typeof LOST_TIME)[number]);

export interface Injury {
  id: string;
  severity: string | null;
  at: string;
}

export interface Rates {
  hours: number;
  recordable: number;
  lostTime: number;
  /** Injuries per million hours. Null when there are not enough hours to mean anything. */
  trifr: number | null;
  ltifr: number | null;
  /** How many injuries have no severity yet — the rate is incomplete until they do. */
  unassessed: number;
}

/**
 * Below this, a rate is arithmetic rather than information.
 *
 * Ten thousand hours is about five people for a year. Under that, one injury produces a rate in the
 * hundreds, which says nothing about the business and everything about the small denominator.
 * Publishing it would be worse than saying "not enough hours yet", so that is what SPEC says.
 */
export const ENOUGH_HOURS = 10_000;

export function rates(injuries: readonly Injury[], hours: number): Rates {
  const recordable = injuries.filter(i => isRecordable(i.severity)).length;
  const lostTime = injuries.filter(i => isLostTime(i.severity)).length;
  const enough = hours >= ENOUGH_HOURS;
  return {
    hours,
    recordable,
    lostTime,
    trifr: enough ? round(recordable / hours * PER_HOURS) : null,
    ltifr: enough ? round(lostTime / hours * PER_HOURS) : null,
    unassessed: injuries.filter(i => !i.severity).length,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The rate in a sentence, with the hours beside it — always.
 *
 * A TRIFR quoted without its hours is a number nobody can check, and for a small business it is
 * also a number that swings wildly on one event. Saying both is what makes it honest.
 */
export function ratesLine(r: Rates): string {
  if (r.trifr === null) {
    return `Not enough hours yet to publish a rate — ${Math.round(r.hours).toLocaleString('en-AU')} worked, and a rate needs about ${(ENOUGH_HOURS / 1000)}k before it means anything.`;
  }
  const base = `TRIFR ${r.trifr} · LTIFR ${r.ltifr} · from ${Math.round(r.hours).toLocaleString('en-AU')} hours and ${r.recordable} recordable ${r.recordable === 1 ? 'injury' : 'injuries'}.`;
  return r.unassessed > 0
    ? `${base} ${r.unassessed} ${r.unassessed === 1 ? 'injury has' : 'injuries have'} no severity recorded, so this is not final.`
    : base;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The alert
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * An injury at work is a breach, immediately, and the business is told.
 *
 * ── Kris's words: "non-negotiable" ───────────────────────────────────────────────────────────────
 *
 * *"it needs to be immediate if an injury in the workplace — make sure this alerts the business as
 * well as this is a non negotiable breach"*.
 *
 * So this is not a report that waits for the month to be marked, and it is not softened by
 * severity. Every injury raises the alert, including a first aid one — because the difference
 * between a plaster and a hospital is very often luck, and a business that only hears about the
 * bad ones is a business that never hears about the near-identical event the week before.
 *
 * Severity changes what the alert SAYS and who has to act, never whether it is raised.
 */
export type Urgency = 'now' | 'today';

export interface Alert {
  urgency: Urgency;
  says: string;
  /** What has to happen, in order. Never "investigate" — something somebody can do. */
  steps: string[];
}

export function injuryAlert(severity: string | null, notifiable: boolean): Alert {
  if (notifiable || severity === 'serious') {
    return {
      urgency: 'now',
      says: 'Somebody has been seriously hurt. This stops being an internal matter the moment it happens.',
      steps: [
        'Make the area safe and stay with the person.',
        'Do not disturb the site — it has to stay as it is until the regulator says otherwise.',
        'Call the regulator now. SPEC has the number for the state this job is in.',
        'Tell the person who carries safety, and the top of the chart.',
        'Start the workers’ compensation claim today, not when the paperwork surfaces.',
      ],
    };
  }
  if (severity === 'lost_time') {
    return {
      urgency: 'now',
      says: 'Somebody is hurt badly enough that they are not at work. The business is told now, not at the end of the month.',
      steps: [
        'Check on the person, and find out what they have been told by a doctor.',
        'Start the workers’ compensation claim today — a late claim costs the person money and the business its premium.',
        'Agree suitable duties in writing before they come back.',
        'Raise the corrective action, and put a review date on it.',
      ],
    };
  }
  return {
    urgency: 'today',
    says: 'Somebody has been hurt at work. It is recorded as a breach — the standard for injuries is zero, whatever the severity.',
    steps: [
      'Check on the person.',
      'Write down what happened while it is fresh, in their words.',
      'Raise the corrective action so the same thing cannot happen to the next person.',
      'Assess the severity — it decides whether this counts in the TRIFR and whether a claim is needed.',
    ],
  };
}

/**
 * Who has to be told, straight away.
 *
 * The person who carries safety and the top of the chart, always. Not a setting: a business that
 * can switch off being told about injuries is a business where somebody eventually does.
 */
export const TELL = [
  'Whoever carries safety',
  'The top of the chart',
] as const;

/**
 * Does the workers' compensation side need to start?
 *
 * Anything past first aid. Medical treatment is where a claim usually begins, and a business that
 * waits for lost time is a business that lodges late — which costs the person money and the
 * business its premium.
 */
export const needsClaim = (severity: string | null): boolean => isRecordable(severity);
