/**
 * Take 5 — the two minutes before the tools come out.
 *
 * ── What it is ───────────────────────────────────────────────────────────────────────────────────
 *
 * Kris, on how a tradie's day should start: *"start with a safety take 5 and set up the day right"*.
 *
 * Five questions, asked on the phone, before the first job. It is not a form and it is not a SWMS —
 * a SWMS is written once for a kind of work, and this is about THIS site, THIS morning: what is
 * around me, what could hurt me, what am I going to do about it.
 *
 * ── Why it is five and why they are questions ────────────────────────────────────────────────────
 *
 * Five is short enough to do properly every day. A ten-question version gets tapped through, and a
 * Take 5 that gets tapped through is worse than none — it produces a record saying somebody checked
 * when nobody did, which is exactly what gets read out at an inquiry.
 *
 * They are questions rather than tick-boxes for the same reason: "Is the area clear?" makes
 * somebody look up. "Area clear ✓" does not.
 */

export interface Question {
  key: string;
  ask: string;
  /** What to do when the answer is no. Never "report it" — something specific. */
  ifNot: string;
}

export const TAKE5: Question[] = [
  {
    key: 'area',
    ask: 'Have you looked at the area and what is around you?',
    ifNot: 'Walk it first. Most of what hurts somebody was visible from where they parked.',
  },
  {
    key: 'hazards',
    ask: 'Anything here that could hurt you or somebody else?',
    ifNot: 'Write it down below. It goes on the job and to your supervisor.',
  },
  {
    key: 'isolation',
    ask: 'Is everything you are working on isolated, locked and tested dead?',
    ifNot: 'Stop. Do not start until it is. Nothing on this job is worth it.',
  },
  {
    key: 'gear',
    ask: 'Do you have the right gear, and is it in date?',
    ifNot: 'Get the right gear. Going ahead without it is how a good day turns bad.',
  },
  {
    key: 'people',
    ask: 'Does anybody else need to know what you are about to do?',
    ifNot: 'Tell them now — the other trades, the client, whoever is upstairs.',
  },
];

export const isQuestion = (k: string): boolean => TAKE5.some(q => q.key === k);

export type Answer = 'yes' | 'no';

export interface Take5 {
  /** Keyed by question, 'yes' or 'no'. Missing means not answered. */
  answers: Record<string, Answer>;
  /** What they wrote when something was not right. */
  note: string;
  at: string | null;
}

/** Answered every question. Not "all yes" — a no is a perfectly good answer. */
export const complete = (t: Take5): boolean =>
  TAKE5.every(q => t.answers[q.key] === 'yes' || t.answers[q.key] === 'no');

/**
 * May work start?
 *
 * Every question answered, and the isolation one answered YES. That one is different from the
 * other four: the rest can be a no with a note and the day carries on sensibly, but working on
 * something that has not been isolated and tested dead is the thing that kills electricians. SPEC
 * says stop, and means it.
 */
export function mayStart(t: Take5): { ok: boolean; why: string } {
  if (!complete(t)) return { ok: false, why: 'Answer the five first. It takes a minute.' };
  if (t.answers.isolation === 'no') {
    return {
      ok: false,
      why: 'Not until it is isolated, locked and tested dead. Nothing on this job is worth it — call your supervisor.',
    };
  }
  return { ok: true, why: '' };
}

/** The questions answered no — what the day actually has to work around. */
export const concerns = (t: Take5): Question[] =>
  TAKE5.filter(q => t.answers[q.key] === 'no');

/**
 * A no with nothing written down is a no nobody can act on.
 *
 * Asked for rather than enforced everywhere: the isolation answer stops work on its own, and for
 * the rest a note is what turns "something is not right" into something a supervisor can do
 * something about.
 */
export const needsNote = (t: Take5): boolean =>
  concerns(t).length > 0 && !t.note.trim();

/** How it reads back on the job and to the office. */
export function take5Line(t: Take5): string {
  if (!complete(t)) return 'Take 5 not done yet.';
  const bad = concerns(t);
  if (!bad.length) return 'Take 5 done. Nothing of concern.';
  return `Take 5 done. ${bad.length} ${bad.length === 1 ? 'thing' : 'things'} raised${t.note.trim() ? `: ${t.note.trim()}` : ''}.`;
}

/** An empty one, for a phone opening in the morning. */
export const emptyTake5 = (): Take5 => ({ answers: {}, note: '', at: null });
