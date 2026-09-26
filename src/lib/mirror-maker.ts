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

import { checkRunnable } from './runnable';

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
  /**
   * The document, as markdown. Empty when the thing really is just a checklist.
   *
   * Kris, 26 September: *"mirrors must be as powerful as artifacts."* A rate card is a table, an
   * induction is headings and paragraphs, a scope of works is both plus a list of exclusions.
   * Forced through `steps`, every one of those becomes a worse version of itself.
   */
  body: string;
  /**
   * A tool, when the thing asked for is one — a calculator, a sizing check, an estimator.
   *
   * Kris, 26 September: *"mirrors must be as powerful as artifacts."* Empty for almost every
   * mirror; most are documents and a tool is the exception. Sealed off when it runs — lib/runnable.
   */
  runnable: string;
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
    'Return ONLY JSON: {"title","summary","kind","body","runnable","steps":[{"text","owner"}]}.',
    `kind is one of: ${CAN_DRAFT.map(k => k.id).join(', ')}.`,
    'title: five words or fewer, what it is, no colons.',
    'summary: two or three sentences a tradesperson would actually read.',
    'body: the document itself, as markdown. Use whatever shape the thing needs — headings, paragraphs, a table, a list. A rate card is a table; an induction is headings. Leave it "" only when the thing genuinely is nothing but a checklist.',
    'Markdown only in body. No HTML tags: they will be shown as characters, not rendered.',
    'runnable: leave it "" unless what was asked for is a TOOL somebody uses — a calculator, a sizing check, an estimator. Then it is one self-contained HTML fragment with its own inline <style> and <script>.',
    'A tool runs sealed off: it CANNOT load anything from the internet and CANNOT reach any data. No src or href to another site, no CDN, no fonts, no images from elsewhere. Write everything it needs into the fragment.',
    'A tool never states a rate, a price or a benchmark of its own. It takes the business\'s numbers as inputs.',
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
    /* Deliberately empty. An invented body would be the confident-looking template this whole file
       refuses to produce — the steps below are a real prompt to write one; a fake document is not. */
    body: '',
    runnable: '',
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
    /* Scrubbed like everything else, and capped: one runaway answer must not become a document
       nobody can scroll past. */
    body: stripNumbers(typeof o.body === 'string' ? o.body.trim() : '').slice(0, 20_000),
    /*
      A tool is kept only if it passes `checkRunnable` — refused whole, never half-stripped. Half a
      calculator that still runs is one that gives a wrong answer with nothing on screen to say so.
      NOT put through `stripNumbers`: a tool's digits are its arithmetic, and rewriting `* 2.5` into
      prose would break it silently. The prompt forbids stated rates instead.
    */
    runnable: keepRunnable(typeof o.runnable === 'string' ? o.runnable.trim() : ''),
    steps,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHANGING ONE THAT ALREADY EXISTS

   Kris, 26 September: mirrors are to be *"exactly the same as artifacts"*. An artifact is not
   written once and kept — it is argued into shape. "Make it shorter." "Add a step about isolating
   the board." "That is not how we do it here." Each answer replaces the last, and the going back
   and forth IS the feature.

   ── The danger that shapes this half ──────────────────────────────────────────────────────────

   A drafted mirror nobody has read yet is harmless. A mirror somebody asks to CHANGE is one that is
   already pinned, already being worked to, and already has somebody's judgement in it. Ask for a
   small change at four on a Friday and a rewrite will cheerfully hand back a tidier version with
   the isolation step gone — not because it decided to remove it, but because it regenerated the
   list and that one did not come back.

   Nothing on the screen would say so. The new version reads perfectly.

   Two things stand against that, and they are different in kind:

     `boardVersions` keeps what it was, so the change can be undone. That is the backstop.
     `dropped()` below says what disappeared, BEFORE anybody accepts it. That is the point.

   A backstop nobody knows they need is not much use on a Friday afternoon. Being told "this removed
   two steps, here they are" is what actually stops the bad version being pinned.
   ───────────────────────────────────────────────────────────────────────────── */

export const CHANGE_LABEL = 'Change this mirror';

export const CHANGE_PLACEHOLDER =
  'Make it shorter — and add a step about isolating the board before anyone opens it';

export const CHANGE_HELP =
  'Say what to change in plain words. What it says now is kept, so you can put it back.';

/** Said above a revision that took something out. The steps themselves are listed under it. */
export const THIS_REMOVED = 'This change removed:';

export const PUT_IT_BACK = 'Undo this change';

/**
 * Steps that were there before and are not there now.
 *
 * Matched on the text, which is how this codebase already matches steps elsewhere — a step whose
 * wording was tidied counts as dropped, and that is the right way for it to be wrong. Telling
 * somebody a step went when it was only reworded costs them a glance; missing a real removal costs
 * a crew the step that stopped the job.
 */
export function dropped(before: { text: string }[], after: { text: string }[]): string[] {
  const now = new Set(after.map(s => s.text.trim().toLowerCase()));
  return before.map(s => s.text).filter(t => !now.has(t.trim().toLowerCase()));
}

/** What Claude is told when changing one that exists, rather than drafting a new one. */
export function revisePrompt(): string {
  return [
    systemPrompt(),
    '',
    'You are CHANGING a mirror that already exists and that people are working to.',
    'Return the WHOLE mirror in the same JSON shape, not a description of your changes.',
    'Keep every step the request did not ask you to change, in its own words.',
    'Keep the body the same except where the request asks otherwise. Return it in full — a shortened body is a document the business has lost half of.',
    'If it has a runnable tool, return that in full too, working, and still loading nothing from the internet.',
    'A step that stops a job if it is not done is never removed unless the request says to remove it.',
  ].join('\n');
}

/** The current mirror, as the message that goes with the request. */
export function currentAsText(m: { title: string; summary: string; body?: string; steps: { text: string; owner: string }[] }, ask: string): string {
  return [
    `TITLE: ${m.title}`,
    `SUMMARY: ${m.summary}`,
    ...(m.body ? ['BODY:', m.body, ''] : []),
    'STEPS:',
    ...m.steps.map((s, i) => `${i + 1}. ${s.text}${s.owner ? ` — ${s.owner}` : ''}`),
    '',
    `CHANGE ASKED FOR: ${ask}`,
  ].join('\n');
}

/**
 * Keep a drafted tool only if it is safe and whole.
 *
 * Refused rather than repaired. A tool that reaches for a script on the internet will silently do
 * nothing inside the sealed frame, and the person reading the answer has no way to tell. An empty
 * string here means the mirror is simply a document, which is an honest outcome; a half-working
 * calculator is not.
 */
export function keepRunnable(html: string): string {
  if (!html) return '';
  return checkRunnable(html) === null ? html : '';
}
