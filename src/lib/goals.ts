/**
 * What the business is actually for — the three questions, and what counts as having answered them.
 *
 * ── Why this is step one ─────────────────────────────────────────────────────────────────────────
 *
 * Design export 5 put it before everything: "before a single role or KPI, the owner or director says
 * what winning looks like. Every target Claude proposes later gets checked against this — a KPI that
 * doesn't serve one of these goals is a KPI worth questioning."
 *
 * That last clause is the whole point, and it is a real constraint rather than a nice sentence. SPEC
 * proposes roles and KPIs. Without the goals it proposes them against a sector and a headcount — the
 * shape a business like this USUALLY has — which produces a competent, generic scorecard that
 * measures a business nobody is actually running. With them it has something to check a target
 * against, and "this KPI does not serve any goal you named" is a question worth a leader's time.
 *
 * Pure: the questions, the validation, and the summary. The reading and writing is in lib/goals-data.
 */

export interface GoalPrompt {
  id: string;
  /** The question, in the design's own words. */
  label: string;
  /** A real answer, not a format hint — it shows the owner the altitude expected. */
  placeholder: string;
  /** Why SPEC is asking, for the people who want to know before they type. */
  why: string;
}

/**
 * Three questions, in this order, and the order is doing work.
 *
 * Far, then near, then the fear. A leader who is asked "what would make this year a win?" cold tends
 * to answer with whatever is on their desk this week; asked after three years, they answer against
 * something. And the third question is the one that gets the truth: the honest account of a business
 * is usually in what somebody is worried about, not in what they would put in a plan.
 */
export const GOAL_PROMPTS: GoalPrompt[] = [
  {
    id: 'g1',
    label: 'Where do you want the business in 3 years?',
    placeholder: 'e.g. Doubled revenue, second site open, off the tools myself',
    why: 'The shape of the business you are building decides which roles are missing from the chart.',
  },
  {
    id: 'g2',
    label: 'What would make this year a genuine win?',
    placeholder: 'e.g. Margin above 32% every month, no more than one resignation',
    why: 'This is what a KPI target gets measured against. A number that serves no goal here is worth questioning.',
  },
  {
    id: 'g3',
    label: 'What keeps you up at night about it?',
    placeholder: 'e.g. Whether it would survive me stepping back for a month',
    why: 'The honest account of a business is usually in what somebody is worried about, not in the plan.',
  },
];

export const GOAL_PROMPT_IDS = GOAL_PROMPTS.map(p => p.id);

/** The longest answer that will be stored. Room to think, short of somebody pasting a document. */
export const GOAL_MAX = 600;

export interface Goal {
  promptId: string;
  answer: string;
  updatedAt: string;
}

/**
 * Whether the goals have been set.
 *
 * ONE answer is enough, deliberately. Three empty boxes at the front of setup is the point at which
 * a busy owner closes the tab, and a step that cannot be finished without writing three paragraphs
 * is a step that stops the whole business being drawn. One real sentence is enough for SPEC to have
 * something to check a KPI against, and the other two can be filled in later — the page says so.
 *
 * Whitespace is not an answer, which is why this trims rather than testing for length.
 */
export function goalsAnswered(goals: Goal[]): boolean {
  return goals.some(g => g.answer.trim().length > 0);
}

/** How many of the three have something in them — for the step's own state line. */
export function goalsSet(goals: Goal[]): number {
  return goals.filter(g => g.answer.trim().length > 0).length;
}

/**
 * The goals as one block of text, for the places that show them rather than edit them.
 *
 * Ordered by the prompts rather than by what the database returned, so the board pack and the
 * monthly scoring page read them in the same order the owner answered them. Unanswered prompts are
 * left out entirely: a board pack is not the place to advertise a blank.
 */
export function goalLines(goals: Goal[]): { label: string; answer: string }[] {
  const byId = new Map(goals.map(g => [g.promptId, g.answer.trim()]));
  return GOAL_PROMPTS
    .map(p => ({ label: p.label, answer: byId.get(p.id) ?? '' }))
    .filter(l => l.answer.length > 0);
}

/**
 * Trim an answer to what will be stored, without silently losing the end of somebody's sentence.
 *
 * Returns the trimmed text and whether it had to cut, so the form can say so rather than the person
 * discovering it after they save. A field that quietly swallows the last half of an answer is worse
 * than one that refuses it.
 */
export function fitAnswer(raw: string): { answer: string; trimmed: boolean } {
  const answer = raw.trim();
  return answer.length <= GOAL_MAX
    ? { answer, trimmed: false }
    : { answer: answer.slice(0, GOAL_MAX).trimEnd(), trimmed: true };
}
