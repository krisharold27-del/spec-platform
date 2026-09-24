/**
 * Who administers the business, and how that gets handed on.
 *
 * ── Why this needed writing at all ───────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"original person to sign up begins as an admin but they can change that to
 * someone else if they wish."*
 *
 * The first half was already true — signing up places you in the General Manager seat, and that
 * role's `defaultAccess` is `administrator`. The second half was not true anywhere. Access was
 * written once, when a person was first created, by `assignPerson`, and **nothing in SPEC could
 * change it afterwards.** No screen, no action, no path.
 *
 * Two things followed from that, and both are worse than the missing button:
 *
 *   1. A founder who hands the GM seat to somebody else KEEPS administrator, because access lives
 *      on the person and not on the seat. The business ends up with two administrators and no way
 *      to get back to one.
 *
 *   2. Somebody promoted INTO the top seat does not become an administrator, because `assignPerson`
 *      only sets access when it is creating a person who does not exist yet. A new GM inherits the
 *      chair and not the keys, and the only person who can fix that is the one who left.
 *
 * So the rules live here, pure, and the one that matters is the last one.
 */

export interface Seat {
  id: string;
  name: string;
  email: string;
  /** administrator | full | readonly — see lib/auth. */
  access: string;
}

export const isAdministrator = (s: { access: string }): boolean => s.access === 'administrator';

export const administrators = (seats: readonly Seat[]): Seat[] => seats.filter(isAdministrator);

export type Change =
  | { ok: true; access: 'administrator' | 'full' }
  | { ok: false; reason: string };

/**
 * May this change be made?
 *
 * ── The rule that exists to prevent one specific disaster ────────────────────────────────────────
 *
 * A business with NO administrator is locked out of its own seats, its own billing, its own
 * financial year and its own recovery contact — and the only people who could put it right are the
 * ones who no longer have the rights. There is no self-service way back from it. It is the one
 * state this file exists to make unreachable.
 *
 * So the last administrator cannot step down, and cannot be stepped down. Not "is warned": refused.
 * Handing over is done by making the next person an administrator FIRST and stepping down second,
 * which is two deliberate acts in the right order rather than one that can be got wrong.
 *
 * Note what is NOT a rule here. An administrator may step themselves down while others remain, and
 * may remove another administrator. Both are ordinary acts of running a business — somebody leaves,
 * somebody changes job — and guarding them with "you cannot remove yourself" only produces
 * businesses carrying administrators nobody wants and cannot shift.
 */
export function mayChangeAdministrator(
  seats: readonly Seat[],
  actorId: string,
  subjectId: string,
  makeAdministrator: boolean,
): Change {
  const actor = seats.find(s => s.id === actorId);
  const subject = seats.find(s => s.id === subjectId);

  if (!actor || !isAdministrator(actor)) {
    return { ok: false, reason: 'Only an administrator can change who administers this business.' };
  }
  if (!subject) return { ok: false, reason: 'That person is not on a seat in this business.' };

  if (makeAdministrator) {
    if (isAdministrator(subject)) {
      return { ok: false, reason: `${subject.name} is already an administrator.` };
    }
    return { ok: true, access: 'administrator' };
  }

  if (!isAdministrator(subject)) {
    return { ok: false, reason: `${subject.name} is not an administrator.` };
  }

  /*
    The refusal that matters. Counted from the seats as they are now, so it holds whether somebody
    is stepping themselves down or removing the only other one.
  */
  if (administrators(seats).length <= 1) {
    return {
      ok: false,
      reason: subject.id === actor.id
        ? 'You are the only administrator. Make somebody else an administrator first, then step down — a business with nobody administering it cannot add seats, change billing or recover an account, and there is no way back from it on your own.'
        : `${subject.name} is the only administrator. Make somebody else an administrator first — a business with nobody administering it has no way back on its own.`,
    };
  }

  /*
    Dropping to `full` rather than to `readonly`: somebody who has been administering the business
    is almost always still a manager in it, and demoting them out of their own scorecards as a side
    effect of handing over the keys would be a second, unasked-for change.
  */
  return { ok: true, access: 'full' };
}

/**
 * What the screen says under the list, so the rule is readable before somebody runs into it.
 *
 * Prose is not behaviour — `mayChangeAdministrator` is the rule and this only describes it — but a
 * refusal somebody could have seen coming is a worse experience than one they were warned about.
 */
export function administratorNote(seats: readonly Seat[]): string {
  const n = administrators(seats).length;
  if (n === 0) {
    return 'Nobody is administering this business. That should not be possible — get in touch and we will put it right.';
  }
  if (n === 1) {
    return 'One administrator. To hand over, make the other person an administrator first, then step yourself down — SPEC will not let the last one go, because a business with nobody administering it cannot recover on its own.';
  }
  return `${n} administrators. Any of them can add seats, change billing and set the financial year. Being an administrator never widens whose scorecards somebody can see.`;
}
