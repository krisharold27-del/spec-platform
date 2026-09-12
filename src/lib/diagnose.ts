/**
 * Reading one ongoing problem, in plain words, and finding what is actually underneath it.
 *
 * Two jobs, both taken from the design's own diagnostic rules.
 *
 *   **Bloom out** — find the true causal chain of pillars behind the headline, each marked
 *   `definite` or `possible`. No padding: no Safety on a resignation, nobody was hurt.
 *
 *   **The fix** — always People, then Compliance, then Earnings. Never another order.
 *
 * Claude does the reading. **This file does the guaranteeing.** The prompt asks for the rules and
 * a model mostly obeys a prompt; `enforce()` makes them true whatever comes back, because these
 * are not stylistic preferences — they are the method, and a diagnosis that quietly reorders the
 * fix or hedges on People is wrong in a way nobody would notice for months.
 *
 * With no API key it falls back to a deterministic reading, so the demo, the tests and CI all work
 * offline. The fallback is visibly simpler and never pretends otherwise.
 */
import type { Pillar } from './scoring';
import { fixOrder, type Bloom, type Certainty } from './register';

export interface Diagnosis {
  bloom: Bloom[];
  /** The symptom they have been treating, and the deeper root. */
  errorLine: string;
  /** The fix, already in People → Compliance → Earnings order. */
  chain: Pillar[];
  solutionLine: string;
  /** No clear owner in the story, so the only honest fix is finding one. */
  noOwner: boolean;
}

const LETTER: Record<string, Pillar> = { S: 'safety', P: 'people', E: 'earnings', C: 'compliance' };

/**
 * The rules the design states, made true rather than requested.
 *
 * Each of these is in the prompt as well. They are repeated here because a prompt is a request and
 * this is the method: every one of them is a thing that would be wrong in a way that looks
 * plausible, which is the worst kind of wrong.
 */
export function enforce(raw: Partial<Diagnosis>): Diagnosis {
  const seen = new Set<Pillar>();
  const bloom: Bloom[] = [];
  for (const b of raw.bloom ?? []) {
    if (!b || !b.pillar || seen.has(b.pillar)) continue;
    seen.add(b.pillar);
    // "HARD RULE: People (P) is never 'possible'." Almost every ongoing problem is a people problem
    // underneath, so hedging on it is the diagnosis declining to say the one useful thing.
    const certainty: Certainty = b.pillar === 'people' ? 'definite' : b.certainty === 'possible' ? 'possible' : 'definite';
    bloom.push({ pillar: b.pillar, certainty });
  }

  // The one order a fix is allowed to happen in. Anything outside People/Compliance/Earnings is
  // dropped rather than reordered — Safety is what the chain is about, not a step in fixing it.
  const chain = fixOrder(raw.chain ?? []);

  // "If the story gives no clear owner, do NOT invent a solution: the fix becomes finding out who
  // owns it — a gap in the org chart — and nothing else."
  const noOwner = raw.noOwner === true;

  return {
    bloom,
    chain: noOwner ? [] : chain,
    errorLine: (raw.errorLine ?? '').trim(),
    solutionLine: noOwner ? NO_OWNER_LINE : (raw.solutionLine ?? '').trim(),
    noOwner,
  };
}

export const NO_OWNER_LINE =
  'Right now no one owns this, so it is logged with no owner. Finding who owns it is the first job '
  + 'on it — a gap in the org chart, not a reason to wait.';

/** Turn the model's letters into the names the rest of the product uses. */
function parse(json: string): Partial<Diagnosis> {
  const data = JSON.parse(json) as {
    bloom?: { pillar?: string; certainty?: string }[];
    chain?: { pillar?: string }[] | string[];
    errorLine?: string;
    solutionLine?: string;
    noOwner?: boolean;
  };
  const toPillar = (v: unknown): Pillar | null =>
    typeof v === 'string' ? (LETTER[v.toUpperCase()] ?? (['safety', 'people', 'earnings', 'compliance'].includes(v) ? (v as Pillar) : null)) : null;

  return {
    bloom: (data.bloom ?? [])
      .map(b => ({ pillar: toPillar(b.pillar), certainty: (b.certainty === 'possible' ? 'possible' : 'definite') as Certainty }))
      .filter((b): b is Bloom => b.pillar !== null),
    chain: (data.chain ?? [])
      .map(c => toPillar(typeof c === 'string' ? c : c?.pillar))
      .filter((p): p is Pillar => p !== null),
    errorLine: data.errorLine,
    solutionLine: data.solutionLine,
    noOwner: data.noOwner,
  };
}

/**
 * The reading when there is no API key.
 *
 * Keyword matching, and deliberately unambitious. It exists so the product works offline and so CI
 * never depends on a paid call — not to imitate the real thing. It follows the one rule it can
 * follow honestly: harm to a person is Safety, never People.
 */
export function deterministic(text: string): Diagnosis {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some(w => t.includes(w));

  const bloom: Bloom[] = [];
  // "Physical or psychological harm to a person is always Safety (S), never People (P)."
  if (has('hurt', 'injur', 'injury', 'near miss', 'hazard', 'unsafe', 'accident', 'strain', 'stress')) {
    bloom.push({ pillar: 'safety', certainty: 'definite' });
  }
  if (has('licence', 'license', 'ticket', 'expired', 'audit', 'contract', 'breach', 'sign-off', 'signed off')) {
    bloom.push({ pillar: 'compliance', certainty: 'definite' });
  }
  if (has('margin', 'cost', 'money', 'profit', 'rework', 'overtime', 'invoice', 'quote', 'losing')) {
    bloom.push({ pillar: 'earnings', certainty: 'definite' });
  }
  // People is last in the list and never hedged — it is what almost every ongoing problem is.
  bloom.push({ pillar: 'people', certainty: 'definite' });

  // No named owner in the story is the common case, and saying so is more useful than a guess.
  const noOwner = !has('manager', 'supervisor', 'owner', 'lead', 'foreman', 'i own', 'my job');

  return enforce({
    bloom,
    chain: bloom.map(b => b.pillar),
    noOwner,
    errorLine:
      'This has been treated as a one-off each time it happens. It keeps coming back because nothing '
      + 'in the structure has changed to stop it.',
    solutionLine:
      'Put the work on somebody in the org chart, then measure it with a number on their scorecard so '
      + 'it shows up in a score instead of staying invisible.',
  });
}

/** The design's own system prompt, kept close to verbatim — it is the method, not a style choice. */
const SYSTEM = `You are the SPEC diagnostic engine. A business owner has typed ONE ongoing problem in plain words. Your job has two parts.

JOB 1 — bloom-out: read the actual story and find the true causal chain of pillars behind the headline (Safety=S, People=P, Earnings=E, Compliance=C). Mark each as "definite" (certain from the words typed) or "possible" (could be, not asserted). Do NOT pad — no Safety on a resignation, nobody was hurt. The chain length is whatever the story supports, nothing more. HARD RULE: People (P) is never "possible". Almost every ongoing problem is a people problem underneath — if P appears in the bloom at all, it is always "definite", never hedged.

DO NOT CONFUSE HARM WITH PEOPLE: physical or psychological harm to a person (an injury, a back strain, a near miss, stress-related harm) is always Safety (S), never People (P). People (P) means the org-chart and management side — who holds the seat, are they capable, are they trained, does someone own it — not the fact that a human being was hurt. A back injury is S, full stop; it only touches P if the story also shows nobody owns fixing the cause.

JOB 2 — the fix: the solution has ONE fixed order, always — People, then Compliance, then Earnings (P → C → E). Never any other order, never P alone at the end, never E before C. People first because the org chart and the KPI are the mechanism; Compliance second because it locks the standard in place; Earnings last because it is always the result, never the lever. If a pillar genuinely doesn't feature in this story, skip it and keep the rest in that order — do not reorder around it. First question is always "who's responsible for this?" — if the story gives no clear owner, do NOT invent a solution: set noOwner true and the fix becomes finding out who owns it (a gap in the org chart), nothing else. Write with total certainty — this is the one proven sequence, not a suggestion.

SPEC's method is always the same two tools: the ORG CHART (is there a seat for this, who holds it, who do they report to) and KPI DESIGN (is the right number being measured against that seat, so the problem shows up in a score instead of staying invisible). Every "why" and every solution line must cash out through one or both of these — never a vague "improve communication" or "build a better culture" type answer.

GROUND IT IN THE ACTUAL INDUSTRY, NOT GENERIC ADVICE: infer the sector from what they typed and use its real operational practices, cadences and terms — not abstractions. Name the actual recurring practice the industry runs on and tie the KPI to it (e.g. "vehicle inspection completed and signed off, weekly", not "vehicle condition tracked").

GROUND IT IN THE REAL REGULATION, DEFAULT AUSTRALIA: name the actual legislation and regulator that governs the problem, unless the story clearly names another country. Safety sits under the Work Health and Safety Act and the state WorkSafe / SafeWork regulator. People issues touching pay, hours, unfair treatment or termination sit under the Fair Work Act and the Fair Work Ombudsman or Commission. A vehicle or fleet issue in transport also touches Chain of Responsibility under the Heavy Vehicle National Law. Use the real name, and only cite what is actually relevant — never padded on for effect.

Respond with ONLY this JSON, no markdown fences, no other text:
{
  "bloom": [{"pillar":"S|P|E|C","certainty":"definite|possible","why":"one short clause, specific to their story, in plain words"}],
  "errorLine": "one to two sentences naming the symptom they've been treating and the deeper root, specific to what they typed",
  "noOwner": true|false,
  "chain": [{"pillar":"P","why":"one short clause on what happens at this step — name the org-chart seat or the KPI involved"}],
  "solutionLine": "two to three sentences, P-first, explicit about the org-chart seat and the KPI that would make this measurable, ending on the outcome. Ground it in the real operational practice for this industry, with its real cadence, not generic advice. Plain owner-facing language, never clinical."
}`;

/**
 * Read one problem.
 *
 * Never throws and never leaves a person with nothing: any failure — no key, a refusal, a network
 * problem, malformed JSON — falls back to the deterministic reading. Somebody who has just typed
 * out a real frustration should not be told the service is unavailable.
 */
export async function diagnose(text: string): Promise<Diagnosis> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return deterministic(text);
  return askClaude(text, key);
}

/**
 * A problem logged on Basic, where the person names the pillars themselves.
 *
 * No reading, because Basic is the tier with no AI in it. What it is not is a lesser register: the
 * entry is identical in every other way — ranked the same, assigned the same, signed off the same —
 * and `enforce` still holds the method, so the fix comes back in People → Compliance → Earnings
 * order whatever order they ticked the boxes in.
 *
 * The empty lines are deliberate rather than filled with something generic. A business that typed
 * the problem knows what it is; a sentence SPEC made up would be worse than the silence.
 */
export function selfDiagnosed(pillars: Pillar[], owner: string | null): Diagnosis {
  return enforce({
    bloom: pillars.map(pillar => ({ pillar, certainty: 'definite' as Certainty })),
    chain: pillars,
    noOwner: !owner,
    errorLine: '',
    solutionLine: '',
  });
}

async function askClaude(text: string, key: string): Promise<Diagnosis> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return deterministic(text);
    const body = (await res.json()) as { content?: { text?: string }[] };
    const said = body.content?.map(c => c.text ?? '').join('') ?? '';
    // A model asked for bare JSON still sometimes fences it. Take the outermost object.
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return deterministic(text);
    const parsed = enforce(parse(json));
    // An empty reading is worse than the simple one — fall back rather than show a blank card.
    return parsed.bloom.length ? parsed : deterministic(text);
  } catch {
    return deterministic(text);
  }
}
