/**
 * From your inboxes — reading a customer's email into the one thing it is asking for.
 *
 * Design 20 (`SPEC Jobs.dc.html`) puts the work mailboxes on the pipeline: each message with what
 * kind of thing it is, who it is from, what SPEC read in it and the reply it would send, and one
 * Approve. An enquiry the owner meant to answer tonight is the commonest job a trade business never
 * wins, and it never looks like a missing feature — it looks like a quiet week.
 *
 * SPEC does not read anybody's mailbox yet: the mailbox register in Connections records which ones
 * are approved, and nothing behind it fetches mail. So a message arrives here the way everything in
 * SPEC can always arrive — by hand (design rule 7, manual is a complete, permanent mode): forwarded
 * or pasted. What SPEC adds is the reading, and that part is the same whichever way it came in.
 *
 * Pure: no database, no network. The model, when there is a key, only ever improves on this reading;
 * this is what runs when there is not, and what every answer from the model is checked against.
 */

export type InboxKind = 'enquiry' | 'plans' | 'question' | 'other';

export const KIND_LABEL: Record<InboxKind, string> = {
  enquiry: 'Enquiry',
  plans: 'Plans',
  question: 'Question',
  other: 'Message',
};

export interface InboxRead {
  kind: InboxKind;
  /** The sender as a person would say it: a name if one can be found, else the address. */
  from: string;
  subject: string;
  /** What SPEC read in it, in one line. */
  read: string;
  /** The job it would open, for an enquiry or plans. */
  job: { client: string; title: string; site: string } | null;
  /** The reply SPEC drafts. A person approves it; SPEC never sends on its own. */
  reply: string;
}

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** "Priya Shah <priya@example.com>" → Priya Shah. A bare address becomes its local part, tidied. */
export function senderName(raw: string): string {
  const s = raw.trim();
  const named = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (named) return clip(named[1], 80);
  const addr = s.match(/([^\s<@]+)@[^\s>]+/);
  if (addr) {
    return clip(addr[1].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 80);
  }
  return clip(s, 80);
}

/** Pull the header lines a forwarded or pasted email usually carries. Everything else is the body. */
export function splitEmail(text: string): { from: string; subject: string; body: string } {
  let from = '';
  let subject = '';
  const body: string[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const h = line.match(/^\s*(from|subject)\s*:\s*(.*)$/i);
    if (h && !(h[1].toLowerCase() === 'from' ? from : subject)) {
      if (h[1].toLowerCase() === 'from') from = h[2];
      else subject = h[2].replace(/^(re|fw|fwd)\s*:\s*/i, '');
      continue;
    }
    if (/^\s*(to|cc|date|sent)\s*:/i.test(line) && !body.length) continue;
    body.push(line);
  }
  return { from: from.trim(), subject: clip(subject, 160), body: body.join('\n').trim() };
}

const PLANS = /\b(plans?|drawings?|pdf|attached|attachment|specs?|specification|takeoff|take-off|tender)\b/i;
const WANTS = /\b(quote|price|pricing|cost|how much|install|replace|upgrade|fix|repair|need|want|looking for|would like|available|book)\b/i;
const ASKS = /\?|\b(when|what time|can you|could you|do you|are you|is it)\b/i;

/** The work the message is about, in a few words — from the subject if it says, else the first ask. */
function workOf(subject: string, body: string): string {
  const s = subject.replace(/\b(quote|enquiry|inquiry|request|question)\b\s*(for|about|re)?\s*/gi, '').trim();
  if (s.length >= 4) return clip(s, 120);
  const sentence = body.split(/(?<=[.!?])\s+|\n/).find(l => WANTS.test(l)) ?? body.split('\n')[0] ?? '';
  return clip(sentence.replace(/^(hi|hello|hey|dear)\b[^,]*,?\s*/i, ''), 120) || 'New work';
}

/** A suburb or street if the message names one: "in Marrickville", "at 14 Smith St". */
function siteOf(body: string): string {
  const at = body.match(/\b(?:at|in)\s+((?:\d+[a-z]?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?:\s+(?:St|Street|Rd|Road|Ave|Avenue|Pde|Parade|Cres|Crescent|Dr|Drive|Ln|Lane|Pl|Place|Way|Hwy))?)/);
  return at ? clip(at[1], 120) : '';
}

/**
 * Read one message. Never throws and never returns nothing: the least a message can be is a
 * message, with the words it arrived with.
 */
export function readEmail(text: string, business: string): InboxRead {
  const { from: rawFrom, subject: rawSubject, body } = splitEmail(text);
  const from = rawFrom ? senderName(rawFrom) : 'Someone';
  const all = `${rawSubject}\n${body}`;
  const kind: InboxKind = PLANS.test(all) && WANTS.test(all) ? 'plans'
    : WANTS.test(all) ? 'enquiry'
    : ASKS.test(all) ? 'question'
    : 'other';
  const subject = rawSubject || clip(body.split('\n')[0] ?? '', 80) || '(no subject)';
  const who = from === 'Someone' ? 'there' : from.split(/\s+/)[0];
  const work = workOf(rawSubject, body);
  const site = siteOf(body);
  const sign = business.trim() || 'us';

  if (kind === 'enquiry' || kind === 'plans') {
    return {
      kind, from, subject,
      read: `${kind === 'plans' ? 'Plans to price' : 'Wants a quote'}: ${work}${site ? ` · ${site}` : ''}.`,
      job: { client: from === 'Someone' ? 'New client' : from, title: work, site },
      reply: kind === 'plans'
        ? `Hi ${who}, thanks for sending the plans through. We're pricing it now and will have a quote back to you shortly. ${sign}`
        : `Hi ${who}, thanks for getting in touch about ${work.toLowerCase()}. We'll put a quote together and be back to you shortly — if it's easier to talk it through, just reply with a good time to call. ${sign}`,
    };
  }
  if (kind === 'question') {
    return {
      kind, from, subject,
      read: `Asks: ${clip(body.split(/(?<=\?)/)[0] ?? subject, 140)}`,
      job: null,
      reply: `Hi ${who}, thanks for your message. We'll come back to you on that today. ${sign}`,
    };
  }
  return {
    kind, from, subject,
    read: clip(body || subject, 140),
    job: null,
    reply: `Hi ${who}, thanks — got it. ${sign}`,
  };
}

/** The line above the list: what is waiting, counted rather than asserted. */
export function inboxSummary(open: { kind: InboxKind }[]): string {
  if (!open.length) return 'Nothing waiting.';
  const enquiries = open.filter(o => o.kind === 'enquiry' || o.kind === 'plans').length;
  const rest = open.length - enquiries;
  const parts = [];
  if (enquiries) parts.push(`${enquiries} ${enquiries === 1 ? 'enquiry' : 'enquiries'} to answer`);
  if (rest) parts.push(`${rest} other ${rest === 1 ? 'message' : 'messages'}`);
  return parts.join(' · ');
}
