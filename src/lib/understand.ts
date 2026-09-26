/**
 * Understand the work — photos, plans and what the customer said, read into the job before anybody
 * quotes it (Design 20, `SPEC Jobs.dc.html`).
 *
 * The expensive mistake in a small quote is not the price of a part; it is the thing nobody saw — a
 * ceramic-fuse board that has to be replaced before the charger can go on, an asbestos backing panel
 * that has to be tested before anybody drills it. A person looking at three photos catches those
 * when they have time. This reads every photo every time, and writes down what it saw.
 *
 * What comes back is a PROPOSAL, built only from this business's own pre-builds (kits). SPEC never
 * invents a price: every line is a kit the business priced itself, and any extra time is priced at
 * the business's own labour rate. A person reads it, checks the questions with the customer, and
 * builds the quote — design rule 3, read to inform, not write to change.
 *
 * Pure: the model call lives in understand-data. Everything the model returns is untrusted and is
 * cleaned here — unknown kits dropped, hours bounded, text clipped — so a confident wrong answer can
 * never reach a quote.
 */

export type SeeFlag = 'check' | 'ok';

export interface Seen { from: string; text: string; flag: SeeFlag }
export interface ScopeLine { kitId: string; qty: number }
export interface Extra { label: string; hours: number }

export interface Reading {
  sees: Seen[];
  scope: ScopeLine[];
  extras: Extra[];
  /** What to ask the customer before the price is final. Empty when nothing is unclear. */
  questions: string[];
}

export interface KitRef { id: string; name: string }

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Anything the model sends back, made safe: only this business's kits, sane numbers, short words. */
export function cleanReading(raw: unknown, kits: readonly KitRef[]): Reading {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const known = new Set(kits.map(k => k.id));

  const sees = list(o.sees).slice(0, 12).map(s => {
    const x = (s ?? {}) as Record<string, unknown>;
    return { from: clip(x.from, 40) || 'Photo', text: clip(x.text, 240), flag: (x.flag === 'check' ? 'check' : 'ok') as SeeFlag };
  }).filter(s => s.text);

  const seenKits = new Set<string>();
  const scope = list(o.scope).slice(0, 20).map(s => {
    const x = (s ?? {}) as Record<string, unknown>;
    const qty = Math.round(Number(x.qty) * 100) / 100;
    return { kitId: String(x.kitId ?? ''), qty: Number.isFinite(qty) && qty > 0 ? Math.min(qty, 500) : 1 };
  }).filter(s => known.has(s.kitId) && !seenKits.has(s.kitId) && seenKits.add(s.kitId));

  const extras = list(o.extras).slice(0, 8).map(e => {
    const x = (e ?? {}) as Record<string, unknown>;
    const hours = Math.round(Number(x.hours) * 10) / 10;
    return { label: clip(x.label, 80), hours: Number.isFinite(hours) ? Math.max(0, Math.min(hours, 40)) : 0 };
  }).filter(e => e.label && e.hours > 0);

  const questions = list(o.questions).slice(0, 4).map(q => clip(q, 240)).filter(Boolean);
  return { sees, scope, extras, questions };
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'kit', 'install', 'new']);

/**
 * The reading when there is no model to ask: the customer's words matched against the business's own
 * pre-builds. Never sees a photo — and says so, rather than pretending it looked.
 */
export function readFromWords(text: string, kits: readonly KitRef[], photoCount: number): Reading {
  const said = new Set(words(text).filter(w => !STOP.has(w)));
  const scope = kits
    .map(k => ({ k, hits: words(k.name).filter(w => !STOP.has(w) && said.has(w)).length }))
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map(x => ({ kitId: x.k.id, qty: 1 }));
  const sees: Seen[] = [];
  if (text.trim()) sees.push({ from: 'Message', text: clip(text, 240), flag: 'ok' });
  if (photoCount) {
    sees.push({ from: 'Photos', text: `${photoCount} photo${photoCount === 1 ? '' : 's'} kept with the job. Reading photos needs SPEC's reading switched on — look through them before pricing.`, flag: 'check' });
  }
  return {
    sees, scope, extras: [],
    questions: scope.length ? [] : ['What exactly would you like done, and where on the property?'],
  };
}

/** The message to the customer that asks the questions, drafted for a person to approve. */
export function questionsMessage(client: string, questions: readonly string[], business: string): string {
  if (!questions.length) return '';
  const who = client.trim().split(/\s+/)[0] || 'there';
  const lead = questions.length === 1 ? 'One quick question so the price is right:' : `${questionsWord(questions.length)} quick questions so the price is right:`;
  return `Hi ${who}, thanks for sending that through. ${lead} ${questions.join(' ')} ${business.trim()}`.trim();
}

const questionsWord = (n: number) => ['', 'One', 'Two', 'Three', 'Four'][n] ?? String(n);

/** "Two things to check with Sam first" — the heading over the questions. */
export function checkLine(client: string, n: number): string {
  const who = client.trim().split(/\s+/)[0] || 'the customer';
  return n === 1 ? `One thing to check with ${who} first` : `${questionsWord(n)} things to check with ${who} first`;
}
