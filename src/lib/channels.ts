/**
 * How SPEC reaches a customer: email or phone. Never a text message.
 *
 * ── Kris, 26 September (Design 20) ───────────────────────────────────────────────────────────────
 *
 * *"customer communication is EMAIL or PHONE only. No SMS. Missed calls are called back;
 * follow-ups are calls or emails; reminders and confirmations are emails. Where other pages in the
 * pack still say 'text' or 'SMS' to a customer (e.g. on-my-way, review requests, booking reminders,
 * customer page links), build them as a phone call or an email instead."*
 *
 * ── Why a file rather than a habit ───────────────────────────────────────────────────────────────
 *
 * Because the rule is about WORDS as much as wiring, and words drift. SPEC sends no texts today —
 * there is no gateway — so nothing is technically broken; what was wrong is that six screens
 * PROMISED one. A customer told "we'll text you when we're on the way" and then emailed has been
 * misled by the product in a way they can point at, and the business wears it.
 *
 * So the rule lives here, the touchpoints are written out, and `tests/channels.test.ts` reads every
 * rendered string in the product and fails if a customer is promised a text. A rule in a design
 * document is a rule until the next person in a hurry writes "we'll send you a text".
 *
 * ── What this rule is NOT about ──────────────────────────────────────────────────────────────────
 *
 * Staff. The link that sets somebody up is pasted into the message app already open on the admin's
 * phone, with everybody's number already in it — Kris's own decision of 24 September, and the
 * reason SPEC does not need an SMS gateway at all. A subcontractor is not a customer either. And
 * two-step sign-in by text is a security choice about SPEC's own logins.
 *
 * Those three are listed in the test by name, because an exception nobody can read is an exception
 * that grows.
 */

export type Channel = 'email' | 'phone';

export const CHANNELS: readonly Channel[] = ['email', 'phone'];

/** Said on screen wherever somebody might expect a text. */
export const NO_SMS =
  'SPEC reaches customers by email or phone. It does not send text messages.';

/**
 * Why, in the words to say it to a business owner who asks for texting.
 *
 * Worth having written down, because "customers prefer a text" is a real argument and the answer is
 * not that it is wrong — it is that a number a business does not own, sending on its behalf, is a
 * channel it cannot stand behind when the message is wrong.
 */
export const WHY_NOT_SMS =
  'A text comes from a number the customer cannot ring back and the business does not own. An email can be replied to, kept and forwarded, and a call is a person. Between them they cover everything a text was doing, and neither one goes to a number somebody changed two years ago.';

/** Every place SPEC speaks to a customer, and which of the two it is. */
export interface Touchpoint {
  key: string;
  what: string;
  channel: Channel;
  /** Why this one is a call rather than an email, or the other way round. */
  why: string;
}

/**
 * The touchpoints, decided once.
 *
 * The split is not arbitrary. **A call is for something that needs an answer now** — an emergency,
 * a missed call, "how did we go" while the crew is still fresh in mind. **An email is for something
 * that needs to be kept** — a confirmation with a date on it, an invoice, a link the customer will
 * come back to. Anything that could be either is an email, because an email is the one that does
 * not interrupt somebody's afternoon.
 */
export const TOUCHPOINTS: readonly Touchpoint[] = [
  {
    key: 'missed_call',
    what: 'A call nobody answered',
    channel: 'phone',
    why: 'Called back within a minute. Somebody who rang wants to talk, and an email in reply reads as being fobbed off.',
  },
  {
    key: 'on_my_way',
    what: 'On the way to the job',
    channel: 'phone',
    why: 'A call, because it is time-critical and short. An email that arrives while somebody is out is no use to them.',
  },
  {
    key: 'booking',
    what: 'Booking confirmed',
    channel: 'email',
    why: 'It has a date and an address on it. That is something to keep and look at again, not something to hear once.',
  },
  {
    key: 'reminder',
    what: 'A reminder the day before',
    channel: 'email',
    why: 'Nobody wants a phone call to be reminded of something they already agreed to.',
  },
  {
    key: 'customer_page',
    what: 'The link to their own job page',
    channel: 'email',
    why: 'A link cannot be read out down a phone. It goes where it can be tapped.',
  },
  {
    key: 'how_did_we_go',
    what: 'How did we go?',
    channel: 'phone',
    why: 'A call, so anything wrong becomes a callback for the supervisor before it becomes a review.',
  },
  {
    key: 'review',
    what: 'The thank-you with the review link',
    channel: 'email',
    why: 'Every customer gets the same one. It carries a link, and Google’s rules say it goes to everybody rather than only the happy ones.',
  },
  {
    key: 'quote',
    what: 'A quote, and the chase on it',
    channel: 'email',
    why: 'A document with a price on it. It has to be readable next to the other quotes they are holding.',
  },
  {
    key: 'invoice',
    what: 'An invoice and its reminders',
    channel: 'email',
    why: 'It has to be forwardable to whoever actually pays it — which is rarely the person who was on site.',
  },
  {
    key: 'owed_45',
    what: 'Still unpaid at 45 days',
    channel: 'phone',
    why: 'Reminders have already failed. Past that a reminder is not what is missing, and it becomes a call the owner makes.',
  },
] as const;

export const channelFor = (key: string): Channel | null =>
  TOUCHPOINTS.find(t => t.key === key)?.channel ?? null;

export const byChannel = (c: Channel): Touchpoint[] => TOUCHPOINTS.filter(t => t.channel === c);

/**
 * What to say where somebody asks for a text.
 *
 * A refusal that just says no teaches nothing. This names the two things that replace it, so the
 * answer is a swap rather than a loss.
 */
export const INSTEAD =
  'Anything urgent is a call; anything worth keeping is an email. Between them they cover what a text was for.';
