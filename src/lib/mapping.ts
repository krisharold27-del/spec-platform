/**
 * "We log plant checks in a shared spreadsheet the yard fills in each morning."
 *
 * Adding a system asks two questions a person running a business cannot reliably answer: what do
 * you call it, and which of seven categories does it belong to. They know the first and guess the
 * second, and a wrong category is not cosmetic — it decides which pillar the numbers land on and
 * whether the connection needs board approval.
 *
 * So this lets them describe it in the words they would use out loud, and proposes the mapping
 * instead. **Proposes.** Nothing is created until a person approves it, and the proposal says
 * plainly what it would do — including when it would send the request to the board.
 *
 * Like every other reading in SPEC, the Claude path is the better answer and the deterministic path
 * is the one that always works. No key, a refusal, a timeout, bad JSON: the person still gets a
 * usable proposal rather than an error.
 */
import { CATEGORIES, categoryName, guessCategory, isSensitive, type CategoryId } from './systems';

export interface Mapping {
  /** What SPEC would call it — their words, trimmed to something that fits a row. */
  name: string;
  category: CategoryId;
  /** What it would feed, in plain words. One line each. */
  feeds: string[];
  /** Why this category and not another. */
  because: string;
  /** True when this category goes to the board rather than being switched on. */
  needsBoard: boolean;
}

const VALID = new Set(CATEGORIES.map(c => c.id) as readonly string[]);

/** What each category actually puts on a scorecard. Plain enough to read to somebody. */
const FEEDS: Record<CategoryId, string[]> = {
  job_management: ['Billable hours against quoted hours', 'Jobs finished when they were promised', 'Work in progress against plan'],
  financials: ['Margin against quote', 'Invoices out and money in', 'Cost against budget'],
  safety: ['Incidents and near misses', 'Corrective actions closed on time', 'Inductions and tickets current'],
  crm: ['Quotes out and quotes won', 'Conversion rate', 'Client records kept current'],
  payroll: ['Turnover, and turnover inside ninety days', 'Leave and availability', 'Hours paid against hours worked'],
  communications: ['Nothing on a scorecard — mail is matched to what is already on your card'],
  other: ['Whatever number you name, confirmed by a person until it can be read automatically'],
};

/**
 * Guaranteed to be a usable mapping, whatever came back.
 *
 * The prompt asks for these properties; this makes them true. A model that invents a category, or
 * returns an empty name, or claims a mail connection feeds a scorecard, gets corrected here rather
 * than trusted — the same contract lib/diagnose keeps.
 */
export function enforce(raw: Partial<Mapping> & { name?: string }, fallbackText = ''): Mapping {
  const category: CategoryId = VALID.has(String(raw.category)) ? (raw.category as CategoryId) : guessCategory(fallbackText);
  const name = (raw.name ?? '').trim().slice(0, 80) || nameFrom(fallbackText);
  return {
    name,
    category,
    // Never the model's list: what a category feeds is a fact about SPEC, not something to improvise.
    feeds: FEEDS[category],
    because: (raw.because ?? '').trim().slice(0, 240) || defaultBecause(category),
    needsBoard: isSensitive(category),
  };
}

const defaultBecause = (c: CategoryId) =>
  c === 'other'
    ? 'Nothing in the description points at one of the six known kinds, so it is filed as something else and confirmed by a person.'
    : `What you described holds the kind of number SPEC reads as ${categoryName(c).toLowerCase()}.`;

/**
 * A name from a sentence.
 *
 * Prefers a proper noun, because a business that runs Simpro says "Simpro". Falls back to the
 * common nouns people actually use — "the spreadsheet", "the whiteboard" — rather than to a blank
 * field they then have to fill in themselves, which is the work this feature exists to remove.
 */
function nameFrom(text: string): string {
  const proper = text.match(/\b([A-Z][A-Za-z0-9]{2,})\b/g)?.filter(w => !/^(We|The|Our|It|They|I|Each|Every)$/.test(w));
  if (proper?.length) return proper[0];
  const common = text.match(/\b(spreadsheet|whiteboard|diary|notebook|folder|inbox|app|database|system)\b/i);
  if (common) return `The ${common[1].toLowerCase()}`;
  return 'Unnamed system';
}

/** The reading that always works, with no key and no network. */
export function deterministic(text: string): Mapping {
  return enforce({ category: guessCategory(text) }, text);
}

const SYSTEM = `You map a business system onto SPEC's fixed categories.

The categories, and nothing else, are:
${CATEGORIES.map(c => `  ${c.id} — ${c.name}: ${c.asks}`).join('\n')}

Rules:
- Pick exactly one category id from that list. Never invent one.
- "name" is what the person calls it, in their own words — a product name if they gave one ("Simpro", "Xero"), otherwise the plain thing they described ("The morning spreadsheet"). Never a category name.
- "because" is one short sentence saying why that category, referring to what they actually described. No hedging, no restating the category definition.
- Categorise by WHAT IT HOLDS, never by which product it is. A business must not be able to route around board approval by using a product you have not heard of.

Respond with ONLY this JSON, no markdown fences, no other text:
{"name":"...","category":"one of the ids above","because":"one short sentence"}`;

/**
 * Propose a mapping. Never throws, never leaves somebody with nothing.
 */
export async function propose(text: string): Promise<Mapping> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return deterministic('');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return deterministic(clean);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: clean }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return deterministic(clean);
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return deterministic(clean);
    return enforce(JSON.parse(json) as Partial<Mapping>, clean);
  } catch {
    return deterministic(clean);
  }
}
