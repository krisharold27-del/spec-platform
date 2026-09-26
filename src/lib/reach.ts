/**
 * Whatever you've got is enough — how SPEC reaches somebody it is inviting.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"the system accepts an invite by either email or phone number — whatever you've got is enough,
 * never both required… Getting them into the system matters more than complete details, because the
 * alternative is the owner parks it, means to come back, and never does — and now that person isn't
 * in the system at all."*
 *
 * ── The fault this replaces ──────────────────────────────────────────────────────────────────────
 *
 * The invite box on the org chart was `type="email"` over a server that answered *"That does not
 * look like an email address."* An owner with thirty-eight people and a mobile number for eleven of
 * them typed the number, was refused twice — once by the browser, once by SPEC — and given nothing
 * to do next.
 *
 * That is the give-up point in its purest form. It does not read as a missing feature. It reads as
 * "I'll sort this out tonight", and tonight never comes, and those eleven people are never in the
 * system at all. One refusal with no next step can cost a rollout a quarter of its people.
 *
 * ── Why this is not an SMS gateway ───────────────────────────────────────────────────────────────
 *
 * Because the number is not the problem — the dead end is. SPEC already issues a join link that a
 * person opens on their phone, with no account, and fills in their own details including their own
 * email (see `/join/[token]` and the Setting up screen). So a phone number is not less than an
 * email here: it is a different route to the same place, and the only thing missing was SPEC
 * noticing which one it had been handed.
 *
 * Building an SMS gateway would add a cost, a signup and a thing that can be down, to replace the
 * phone already in the admin's hand with everybody's number in it.
 *
 * ── What it deliberately will not do ─────────────────────────────────────────────────────────────
 *
 * Guess. Something that is neither an address nor a number comes back `unreadable` and is asked
 * about, because silently filing a typo as a phone number produces a link that is texted to nobody
 * and a person who is never chased — which looks exactly like success.
 */

export type Reach =
  /** An address. They get an account and a seat, the way they always did. */
  | { kind: 'email'; email: string }
  /** A number. They get a link to open on their phone, and no seat is charged yet. */
  | { kind: 'phone'; phone: string }
  /** The box was empty. Not an error — nothing has been typed yet. */
  | { kind: 'nothing' }
  /** Something was typed and it is neither. Asked about rather than guessed at. */
  | { kind: 'unreadable'; typed: string };

/** Enough digits to be a real number, loose enough for +61, 07, spaces, dashes and brackets. */
const DIGITS_MIN = 8;
const DIGITS_MAX = 15;

/** An address SPEC would actually be able to send to. Deliberately not an RFC parser. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Read what the owner typed.
 *
 * The '@' decides first and decides alone. A string with an @ in it is somebody trying to type an
 * address, however badly, and telling them it is not a valid phone number would be useless advice
 * about a question they were not asking.
 */
export function reachBy(typed: string): Reach {
  const t = String(typed ?? '').trim();
  if (!t) return { kind: 'nothing' };

  if (t.includes('@')) {
    const email = t.toLowerCase();
    return LOOKS_LIKE_EMAIL.test(email) ? { kind: 'email', email } : { kind: 'unreadable', typed: t };
  }

  /* Everything people put in a phone number and nobody means as part of it. */
  const digits = t.replace(/[\s\-().+]/g, '');
  if (/^\d+$/.test(digits) && digits.length >= DIGITS_MIN && digits.length <= DIGITS_MAX) {
    /* Kept as they typed it. An admin scanning a list recognises their own formatting. */
    return { kind: 'phone', phone: t };
  }

  return { kind: 'unreadable', typed: t };
}

/**
 * What to say when it is neither.
 *
 * Names both things it accepts, because the whole point is that the person does not know they had a
 * choice. A message that says only "that is not an email address" teaches them the number is no
 * good, which is now untrue and was the expensive part.
 */
export const NEITHER_SAYS =
  'That is not an email address or a phone number. Either will do — whichever you have is enough.';

/** Said on the screen, so nobody has to discover that one of the two is allowed. */
export const EITHER_WILL_DO = 'Email or mobile — whichever you have. You do not need both.';

/**
 * What each route costs, said before it happens.
 *
 * An address spends a seat and starts a charge. A number does not, because nothing is created until
 * the person opens the link and finishes their half. Kris's own rule about the bill being decided
 * before it is charged, applied to the one screen where the two routes differ.
 */
export const ROUTE_SAYS: Record<'email' | 'phone', string> = {
  email: 'They get an account straight away and set their own password. This takes a seat.',
  phone: 'You get a message to text them. They fill in their half on their phone — including their email — and no seat is charged until they do.',
};
