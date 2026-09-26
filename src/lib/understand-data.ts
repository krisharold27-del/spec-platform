import { CLAUDE_MODEL, anthropicHeaders } from './claude';
import { cleanReading, cleanTakeoff, readFromWords, type KitRef, type Reading, type TakeoffRow } from './understand';

/**
 * Ask the model to read the work. Server-side only: the key is read here and never leaves the
 * server. Any failure — no key, a timeout, an answer that is not JSON — falls back to reading the
 * customer's words alone, and says so on the page rather than failing.
 */

export interface Picture { mediaType: string; base64: string; name: string }

const SYSTEM = `You help a trade business understand a job before it is quoted.
You are given photos (and sometimes plans), what the customer said, and the business's own list of pre-built job packages ("kits"), each with an id.
Reply with JSON only, no prose, in exactly this shape:
{"sees":[{"from":"Photo 1","text":"...","flag":"check"|"ok"}],
 "scope":[{"kitId":"<an id from the list>","qty":1}],
 "extras":[{"label":"...","hours":1.5}],
 "questions":["..."]}
Rules:
- "sees": what is actually visible or said, one line each, plain words. flag "check" for anything that changes the price or the safety of the job (old switchboards, possible asbestos, access problems), else "ok".
- "scope": only kits from the list, by id. Never invent a kit, a part or a price.
- "extras": extra labour hours the photos justify beyond the kits (e.g. an older home, asbestos precautions). Small, honest numbers.
- "questions": at most three short questions for the customer that would change the price. Empty if nothing is unclear.`;

export async function readTheWork(input: {
  text: string;
  pictures: readonly Picture[];
  kits: readonly KitRef[];
}): Promise<{ reading: Reading; byModel: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const fallback = () => ({ reading: readFromWords(input.text, input.kits, input.pictures.length), byModel: false });
  if (!key || (!input.pictures.length && !input.text.trim())) return fallback();

  const content: unknown[] = input.pictures.slice(0, 6).map(p => (
    p.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
  ));
  content.push({
    type: 'text',
    text: `Kits: ${JSON.stringify(input.kits.slice(0, 200).map(k => ({ id: k.id, name: k.name })))}\n\nWhat the customer said: ${input.text.slice(0, 4000) || '(nothing)'}`,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return fallback();
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return fallback();
    const reading = cleanReading(JSON.parse(json), input.kits);
    if (!reading.sees.length && !reading.scope.length) return fallback();
    return { reading, byModel: true };
  } catch {
    return fallback();
  }
}

const PLANS_SYSTEM = `You count a trade job from its plans.
You are given the plans (PDF or photos of drawings) and the business's own pre-built job packages ("kits"), each with an id.
Reply with JSON only, no prose: {"rows":[{"kitId":"<an id from the list>","where":"Level 1, kitchen","qty":4,"unsure":false}]}
Rules: only kits from the list, by id; never invent a kit or a price. Count from what is drawn. Set "unsure": true for any count you could not read clearly. Group by area where the drawings name areas.`;

/** Count the plans into the business's own pre-builds. Null when there is no reading to be had. */
export async function readPlans(input: { plans: readonly Picture[]; kits: readonly KitRef[] }): Promise<TakeoffRowsResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || !input.plans.length || !input.kits.length) return { rows: [], byModel: false };
  const content: unknown[] = input.plans.slice(0, 4).map(p => (
    p.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
  ));
  content.push({ type: 'text', text: `Kits: ${JSON.stringify(input.kits.slice(0, 200).map(k => ({ id: k.id, name: k.name })))}` });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 3000, system: PLANS_SYSTEM, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) return { rows: [], byModel: false };
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return { rows: [], byModel: false };
    return { rows: cleanTakeoff(JSON.parse(json), input.kits), byModel: true };
  } catch {
    return { rows: [], byModel: false };
  }
}

export interface TakeoffRowsResult { rows: TakeoffRow[]; byModel: boolean }
