/**
 * Ask for a mirror in plain words, and get one back.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"mirrors are for the business to use for all sorts of important things - exactly the same as
 * artifacts - so make them exactly the same."*
 *
 * *"have chat function at the top and then produce the mirrors - artifacts - then the staff have a
 * fabulous resource to help them be succesful."*
 *
 * So: a box at the top of /mirrors. Somebody types what they need — *"a pre-start checklist for
 * switchboard work"*, *"how a new apprentice gets through their first week"* — and a mirror is
 * drafted, ready to read, edit and pin.
 *
 * ── The rule that shapes the whole thing: it may never invent a number ───────────────────────────
 *
 * A mirror can be six kinds (see BOARD_TYPES in lib/boards-live). Two of them — **Live data** and
 * **Scorecards** — are made of figures: this month's callback rate, the sell rate, the four pillars.
 * Those numbers come from the business's own systems and its own KPIs, and there is exactly one
 * honest source for them.
 *
 * A language model asked for a scorecard will produce a beautiful one, with plausible numbers in it,
 * every time. It cannot do otherwise — that is what it is for. And a mirror is not a chat reply that
 * scrolls away: it gets pinned, it gets shown in a meeting, a supervisor plans around it. An invented
 * 4.2% callback rate on a pinned board is a lie the business will act on, discovered in front of a
 * client six weeks later.
 *
 * So this drafts only the four kinds made of WORDS — plans, improvements, training and meeting
 * outputs — and `stripNumbers` removes any figures that arrive anyway. Live data and Scorecards are
 * built the way they already are: by pointing a row at a real criterion, which is read fresh every
 * time the mirror is opened. The box says so rather than silently refusing, because a person who
 * asked for the callback rate deserves to be told where it actually comes from.
 *
 * ── And it drafts. It never publishes ────────────────────────────────────────────────────────────
 *
 * Every draft lands unpinned, marked as a draft, with the words that asked for it kept beside it.
 * Somebody reads it and decides. The same rule the scheduler works to and for the same reason: the
 * business owns what its people are told, not the model.
 */

export type MirrorKind = 'plans' | 'improve' | 'training' | 'meetings';

/** The four a draft may be, and what each is for — in the words the box uses. */
export const CAN_DRAFT: { id: MirrorKind; label: string; for: string }[] = [
  { id: 'training', label: 'Training', for: 'How to do something properly, so the next person does not have to be shown.' },
  { id: 'plans', label: 'Plan', for: 'A piece of work broken into steps, with somebody against each.' },
  { id: 'improve', label: 'Improvement opportunity', for: 'Something that is not working, and what to try.' },
  { id: 'meetings', label: 'Meeting output', for: 'What was decided, and who is doing what by when.' },
];

/** The two it will not draft, and the honest reason, said on the page rather than hidden. */
export const WILL_NOT_DRAFT = [
  { label: 'Live data', why: 'Its numbers come from your connected systems. A drafted one would be guesses that look like readings.' },
  { label: 'Scorecards', why: 'These read your real KPIs afresh every time they are opened. Build one by pointing a row at the KPI it reports.' },
];

export const ASK_LABEL = 'What do you need?';

export const ASK_PLACEHOLDER =
  'A pre-start checklist for switchboard work — what to check, in order, and what stops the job';

export const ASK_HELP =
  'Plain words are enough. It comes back as a draft for you to read and change — nothing is pinned until you say so.';

/** Said where somebody asks for something made of figures. */
export const NUMBERS_COME_FROM_YOUR_SYSTEMS =
  'SPEC will not draft a mirror full of numbers. Figures come from your own systems and your own KPIs, read fresh each time a mirror is opened — anything drafted would be a guess that looked like a reading. Ask for the words and point the rows at your real numbers.';

export const A_DRAFT_NOT_A_DECISION =
  'Drafted, not published. It is yours to change, and nobody else sees it until you pin it.';

/** Too short to act on, and worth saying so before spending a call on it. */
export const TOO_SHORT = 'Say a little more about what you need — a sentence is plenty.';
export const MIN_ASK = 12;

export interface Draft {
  title: string;
  summary: string;
  kind: MirrorKind;
  steps: { text: string; owner: string; state: 'todo' }[];
}

/** Does this read like a request for figures rather than for words? */
export function wantsNumbers(ask: string): boolean {
  return /\b(kpi|kpis|scorecard|score card|dashboard|live data|metrics?|the numbers|rate|percentage|%)\b/i.test(ask);
}

/**
 * Which of the four a request is asking for.
 *
 * Deliberately simple and deliberately overridable: the person picks in the end, and this only sets
 * what the box opens on. A wrong guess costs one press; a clever guess nobody can override costs an
 * argument with the software.
 */
export function kindFor(ask: string): MirrorKind {
  if (/\b(train|teach|induct|how to|checklist|procedure|swms|method|show .* how)\b/i.test(ask)) return 'training';
  if (/\b(meeting|toolbox|minutes|decided|agenda|stand.?up)\b/i.test(ask)) return 'meetings';
  if (/\b(plan|roll ?out|project|schedule|steps to|by (when|friday|month))\b/i.test(ask)) return 'plans';
  return 'improve';
}

/**
 * Strip figures out of drafted text.
 *
 * Not prudishness about digits — step 1, 8am and a 32A breaker are all fine and all useful. What
 * comes out is the shape of a MEASUREMENT: a percentage, an amount of money, or a figure introduced
 * as a rate or a target. Those are the ones that get believed.
 */
export function stripNumbers(text: string): string {
  return text
    .replace(/\b\d+(\.\d+)?\s*%/g, 'your own figure')
    .replace(/\$\s?\d[\d,]*(\.\d+)?/g, 'your own figure')
    .replace(/\b(rate|target|average|margin|cost)\s+(of|is|was|at)\s+\d[\d.,]*/gi, '$1 $2 your own figure');
}

/** What Claude is told. Kept here so the rules and the page's promises are one text. */
export function systemPrompt(): string {
  return [
    'You draft a "mirror" for SPEC, an operating system for Australian trade businesses.',
    'A mirror is a resource a team pins and works from — like a good one-pager a supervisor wrote.',
    '',
    'Return ONLY JSON: {"title","summary","kind","steps":[{"text","owner"}]}.',
    `kind is one of: ${CAN_DRAFT.map(k => k.id).join(', ')}.`,
    'title: five words or fewer, what it is, no colons.',
    'summary: two or three sentences a tradesperson would actually read.',
    'steps: between 3 and 12. Each text is one action in plain words. owner is a ROLE ("Site supervisor", "Apprentice") or "" — never a person\'s name, because you do not know who works here.',
    '',
    'NEVER invent a figure. No percentages, no dollar amounts, no rates, no targets, no benchmarks.',
    'If a number matters, say which of the business\'s own numbers to look at instead.',
    'Australian English and Australian trade practice. No preamble, no markdown, no code fences.',
  ].join('\n');
}

/**
 * A usable mirror without asking anybody — the offline and no-key answer.
 *
 * Not a placeholder. Every caller in this codebase that reaches Claude has a deterministic version
 * that works on its own, because a key that has been revoked must degrade to something true rather
 * than to an empty box. This one turns the request itself into the first step, which is what a
 * person would write on a whiteboard before anybody helped them.
 */
export function starter(ask: string): Draft {
  const kind = kindFor(ask);
  const trimmed = ask.trim().replace(/\s+/g, ' ');
  const title = trimmed.length <= 40 ? trimmed : `${trimmed.slice(0, 37).trimEnd()}…`;
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    summary: `Started from what was asked for: "${trimmed}". Nothing has been filled in for you — add the steps your business actually takes, in the order it takes them.`,
    kind,
    steps: [
      { text: 'Write down the first thing somebody does.', owner: '', state: 'todo' },
      { text: 'Then the next, in the order it really happens.', owner: '', state: 'todo' },
      { text: 'Mark the step that stops the job if it is not done.', owner: '', state: 'todo' },
    ],
  };
}

/**
 * Read what came back, and refuse anything that is not a mirror.
 *
 * Returns null rather than throwing on a shape that does not fit, so a bad answer degrades to the
 * starter instead of to an error page. A model that returns prose on a bad day should cost somebody
 * one more press, not their afternoon.
 */
export function readDraft(text: string): Draft | null {
  const body = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;

  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  if (!title || !summary) return null;

  const kind = CAN_DRAFT.some(k => k.id === o.kind) ? (o.kind as MirrorKind) : 'improve';

  const steps = Array.isArray(o.steps)
    ? o.steps
        .map(s => (s && typeof s === 'object' ? s as Record<string, unknown> : null))
        .filter((s): s is Record<string, unknown> => s !== null)
        .map(s => ({
          text: stripNumbers(typeof s.text === 'string' ? s.text.trim() : ''),
          owner: typeof s.owner === 'string' ? s.owner.trim() : '',
          state: 'todo' as const,
        }))
        .filter(s => s.text.length > 0)
        .slice(0, 12)
    : [];
  if (!steps.length) return null;

  return {
    title: stripNumbers(title).slice(0, 80),
    summary: stripNumbers(summary),
    kind,
    steps,
  };
}
