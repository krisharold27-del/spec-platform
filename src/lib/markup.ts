/**
 * Marking up the plan on site — what was actually installed, against what was drawn.
 *
 * ── Why this belongs on the phone and nowhere else ───────────────────────────────────────────────
 *
 * The as-built is the drawing that says where things really are: the cable that took a different
 * route, the point that moved 600mm, the riser that was blocked. It has to be recorded by the
 * person who did it, on the day, because a week later nobody can remember which wall.
 *
 * What normally happens is a photo of a paper plan with biro on it, and then somebody in the office
 * tries to read it. This records the marks as marks — a kind, a place and a note — so they can go
 * onto the job, the office copy and the certificate without anybody redrawing anything.
 *
 * ── Three kinds, because a fourth would be a form ────────────────────────────────────────────────
 *
 * A cable run, a point that moved or was added, and a note. That is what a sparkie marks on a plan.
 * More kinds would make this a data-entry screen, and a data-entry screen on a phone on a site is a
 * screen that gets skipped — which leaves the business with no as-built at all.
 */

export type MarkKind = 'cable' | 'point' | 'note';

export const MARK_TOOLS: { key: MarkKind; label: string; hint: string }[] = [
  { key: 'cable', label: 'Draw a cable run', hint: 'Where it actually went, and how far.' },
  { key: 'point', label: 'Moved or added a point', hint: 'A GPO, a light, a data point — where it ended up.' },
  { key: 'note', label: 'Add a note', hint: 'Anything the next person needs to know.' },
];

export const isMarkKind = (v: string): v is MarkKind => MARK_TOOLS.some(t => t.key === v);

export const markLabel = (v: string): string =>
  MARK_TOOLS.find(t => t.key === v)?.label ?? 'Add a note';

export interface Mark {
  kind: MarkKind;
  /** Where on the plan, 0–100 of the width and height. Kept as a fraction so it survives any zoom. */
  x: number;
  y: number;
  /** What it says, in the words on site. */
  what: string;
  /** Metres, for a cable run. Null for the other two. */
  metres: number | null;
}

/** Inside the plan, and nowhere else. A mark at 140% is a mark nobody will ever find again. */
export const onPlan = (m: Pick<Mark, 'x' | 'y'>): boolean =>
  m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100;

/**
 * How a mark reads on the plan — short, because it sits in a pill on a phone.
 *
 * The metres are on the label rather than hidden in a detail view: the whole reason to record a
 * cable run is the length, and a length somebody has to tap to see is a length nobody reads.
 */
export function markText(m: Mark): string {
  if (m.kind === 'cable') return m.metres ? `Cable run ${m.metres}m` : 'Cable run';
  if (m.kind === 'point') return m.what.trim() || 'Point moved';
  return m.what.trim() || 'Note';
}

/** Total cable marked on this plan — what the as-built is worth to the next estimate. */
export const cableMetres = (marks: readonly Mark[]): number =>
  Math.round(marks.filter(m => m.kind === 'cable').reduce((t, m) => t + (m.metres ?? 0), 0) * 10) / 10;

/**
 * May this be saved as the as-built?
 *
 * Only with something on it. An empty as-built saved on a job is worse than none: it reads as
 * "somebody checked and there was nothing to mark", which is a statement about the installation
 * that nobody actually made.
 */
export function maySave(marks: readonly Mark[]): { ok: boolean; why: string } {
  if (!marks.length) {
    return {
      ok: false,
      why: 'Nothing marked yet. An empty as-built says somebody checked and found nothing, which is not the same as nobody checking.',
    };
  }
  return { ok: true, why: '' };
}

/** What saving it does, said before it is pressed so nobody is surprised where it went. */
export const SAVED_TO = ['The job', 'The office copy', 'The certificate'] as const;

export function savedLine(marks: readonly Mark[]): string {
  const cable = cableMetres(marks);
  const n = marks.length;
  return `${n} ${n === 1 ? 'mark' : 'marks'}${cable ? `, ${cable}m of cable` : ''} — saved to the job, the office copy and the certificate.`;
}

/**
 * How it reads while it is still on the phone.
 *
 * The design's own line is "Saved on this phone · works with no signal", and that is the promise
 * that matters on a site in a basement: marking up must never depend on a connection, and the
 * screen has to say so or people will not trust it enough to use it.
 */
export const OFFLINE_LINE = 'Saved on this phone · works with no signal';
