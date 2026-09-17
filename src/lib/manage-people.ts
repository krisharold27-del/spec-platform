import type { Pillar } from './scoring';

/**
 * How SPEC says a business should manage its people — the argument behind the training.
 *
 * Design export 7, `SPEC Training.dc.html`, which added this block and nothing else.
 *
 * ── Why it sits on the training page and nowhere else ────────────────────────────────────────────
 *
 * Everything else in SPEC measures. This is the only place that says WHY, and it is put in front of
 * the person doing the training rather than in a document nobody opens, because a supervisor handed
 * twelve modules and no argument will do the modules and change nothing.
 *
 * ── How it differs from the Board charter, which also has four ───────────────────────────────────
 *
 * They are not the same four and must not be merged. `lib/charter.ts` holds what the BOARD commits
 * to and how each one is measured — zero harm, never lose great talent, the gross profit percentage
 * this business needs, no breach of what has already been promised. Those carry figures, a basis and
 * a measurement, because a board signs them.
 *
 * These are what a MANAGER may not trade away, in the words a supervisor would use on a Tuesday.
 * "No culture that sets people up to fail" is not "never lose great talent" — the first is a rule
 * about how you run the floor, the second is a number the board watches. A business could hold one
 * and break the other.
 *
 * `tests/manage-people.test.ts` holds them apart deliberately, so that nobody later tidies two lists
 * into one and quietly loses the distinction.
 */

export interface NonNegotiable {
  pillar: Pillar;
  /** What may never be traded away, in the words it is said in. */
  says: string;
}

/** The claim the whole training pack rests on. */
export const MANAGEMENT_STANCE = {
  heading: 'Self-managing teams, not a dictatorship',
  says:
    'Behaviour on the floor is a symptom — the root is that people weren’t set up to face the hard '
    + 'parts of the job, and closing that gap is management’s job, not the individual’s.',
};

/**
 * The four, in pillar order.
 *
 * Deliberately NOT colour-coded by pillar, although the design colours them. SPEC has one rule about
 * colour and it is older than this screen: colour says how something is GOING, never what it IS.
 * Painting People red as an identity would make the pillar read as failing on a page whose entire
 * purpose is to say that failure is management's doing and fixable. The letter badges carry the
 * identity instead — see `Badge`, and `designs/superseded.md` for the note.
 */
export const NON_NEGOTIABLES: NonNegotiable[] = [
  { pillar: 'safety', says: 'Zero harm — no physical or mental harm, ever, tolerated in any part of the business.' },
  { pillar: 'people', says: 'No culture that sets people up to fail.' },
  { pillar: 'earnings', says: 'Everyone shares responsibility for a vibrant, successful company.' },
  { pillar: 'compliance', says: 'If we say we’ll do it, we do it.' },
];

export interface Reading {
  /** Where it sits in the order — the order is the point, so it is shown rather than implied. */
  when: string;
  title: string;
  author: string;
}

/**
 * Three books, in order, and the order is the content.
 *
 * A reading list is normally a pile somebody picks from and therefore never starts. This one names
 * which to open first and who it is for, because the person it is aimed at is a new supervisor with
 * no time and no idea where to begin.
 */
export const READING: Reading[] = [
  { when: 'Start here — new supervisors', title: 'It’s Your Ship', author: 'D. Michael Abrashoff' },
  { when: 'Next', title: 'MindFit', author: 'Kris Harold' },
  { when: 'Then', title: 'MindFitter', author: 'Kris Harold' },
];
