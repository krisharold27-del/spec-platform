/**
 * The HOW for every candidate — pure, no I/O.
 *
 * ── Why this exists at all ───────────────────────────────────────────────────────────────────────
 *
 * From the engine brief's guiding rules:
 *
 *   **"Every suggestion says HOW, not just what. A suggestion without a build path is noise."**
 *
 * That is the difference between this and every consultant's report a business owner has been handed
 * before. "You could automate your quoting" is something anybody can say in a meeting. What makes it
 * worth reading is: here is what starts it, here are the steps, here is what it touches, here is the
 * bit a person still has to approve, here is roughly how big it is, and here is the number it moves.
 *
 * The solar brief is the shape being copied — it was written by hand and it is what a build actually
 * needs. This generates the same shape from what SPEC already knows.
 *
 * ── What it will not do ──────────────────────────────────────────────────────────────────────────
 *
 * It will not invent a number. The brief's guardrail is *"The engine never invents a KPI target or a
 * cost saving. If it doesn't have the number, it says so."* So `moves` carries the KPI's own words
 * and whether it is being met, and the effort estimate is a size rather than a figure — small,
 * medium or large, which is what anybody could defend, rather than a day count nobody could.
 */
import type { Scored } from './tasks';

export type Effort = 'small' | 'medium' | 'large';

export const EFFORT_MEANING: Record<Effort, string> = {
  small: 'A few days. One system, one trigger, no new data.',
  medium: 'A couple of weeks. More than one system, or data that has to be tidied first.',
  large: 'Longer, and worth breaking up. Several systems, or something has to be decided before it can start.',
};

export interface HowBrief {
  title: string;
  /** What starts it. Every automation is a trigger and a sequence; without the trigger there is nothing. */
  trigger: string;
  steps: string[];
  systems: string[];
  /** What a person must still approve. Empty is allowed, and is itself a statement. */
  guardrails: string[];
  effort: Effort;
  /** Which KPI this moves, and what it is doing now. Never a predicted percentage. */
  moves: string | null;
  /** Systems that have to be connected before any of it can be built. */
  blockedBy: string[];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Effort
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * How big, from what the task actually touches.
 *
 * Systems touched is the only honest proxy available without a person looking at it. One system is
 * a trigger and a write; three is an integration project. A missing connection adds to the effort
 * because connecting it IS part of the work, and pretending otherwise is how a "few days" becomes a
 * fortnight and the estimate stops being believed.
 */
export function effortOf(task: Scored): Effort {
  const surface = task.systems.length + task.needs.length;
  if (task.bucket === 'streamline' && surface <= 1) return 'small';
  if (surface <= 1) return 'small';
  if (surface <= 3) return 'medium';
  return 'large';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The brief
 * ───────────────────────────────────────────────────────────────────────────── */

export function howBrief(task: Scored): HowBrief {
  const systems = task.systems.length ? task.systems : ['none — it lives in somebody\'s head or their inbox'];

  return {
    title: task.name,
    trigger: triggerFor(task),
    steps: stepsFor(task),
    systems,
    guardrails: guardrailsFor(task),
    effort: effortOf(task),
    moves: movesFor(task),
    blockedBy: task.needs,
  };
}

/*
  The trigger.

  Left generic on purpose where SPEC does not know. "When somebody asks for it" is honest and
  useless-looking, which is the point: it tells whoever picks this up that the first question to ask
  the business is what actually starts this work. A confidently wrong trigger would be copied
  straight into a build.
*/
function triggerFor(task: Scored): string {
  const n = task.name.toLowerCase();
  if (/enquir|lead|quote/.test(n)) return 'A new enquiry arrives.';
  if (/timesheet|payroll|roster/.test(n)) return 'The end of the pay period.';
  if (/invoice|statement|reconcil|debtor/.test(n)) return 'An invoice or statement lands, or the month closes.';
  if (/report|pack|meeting|weekly|monthly|board/.test(n)) return 'The meeting it feeds, on its usual day.';
  if (/review|feedback|rating/.test(n)) return 'A job is marked complete.';
  if (/licence|license|ticket|induction|expiry|renew/.test(n)) return 'A set number of days before something expires.';
  if (/order|purchase|supplier|material/.test(n)) return 'A job needs materials it does not have.';
  return 'Not obvious from the description — ask the person who does it what actually starts it.';
}

/*
  The steps.

  Deliberately a SKELETON rather than a guess at the specifics. Anybody reading this knows their own
  business better than SPEC does; what they need is the shape, the split between what the process
  does and what stays with them, and the reminder that nothing may be silently dropped.

  That last step is the one carried over from the solar brief and it is not boilerplate: "Any step
  failing after the lead is created → the lead still exists... Never silently drop an enquiry."
*/
function stepsFor(task: Scored): string[] {
  const person = task.humanSignOff;
  return [
    'Read what came in, and record it straight away so nothing is lost if a later step fails.',
    task.bucket === 'streamline'
      ? 'Do the gathering, the chasing and the formatting — everything up to the point where somebody has to think.'
      : 'Do the sequence: the same steps, in the same order, every time.',
    person
      ? 'Stop, and put it in front of the person who has to put their name to it.'
      : 'Produce the output and file it where the business already looks for it.',
    'Write what happened against the record, so a person can see exactly what was done without asking.',
    'On any failure, keep the record, flag it, and surface it where somebody will see it. Never drop it quietly.',
  ];
}

/*
  Guardrails.

  For a safety or compliance task this is the whole point of the entry and is stated first — the
  brief requires that such a task is never fully automated and that the brief SAYS SO. Everything
  else inherits the two guardrails that belong on any build of this kind: a person can see what was
  done, and nothing invents a number.
*/
function guardrailsFor(task: Scored): string[] {
  const out: string[] = [];
  if (task.critical) {
    out.push('SAFETY OR COMPLIANCE — this is never fully automated. A named person signs off before it counts.');
  } else if (task.humanSignOff) {
    out.push('A person approves the result before it goes anywhere.');
  }
  out.push('Every automated action is logged against the record, so a person can see what was sent and when.');
  out.push('The process proposes; a fixed calculation decides any number. Nothing invents a figure.');
  if (task.needs.length) {
    out.push(`Cannot start until ${task.needs.join(' and ')} ${task.needs.length === 1 ? 'is' : 'are'} connected.`);
  }
  return out;
}

/*
  What it moves.

  The KPI's own words and its current state, and nothing more. No "this will improve turnaround by
  60%" — that is the kind of number that gets a build approved and then makes everything else on the
  page suspect when it turns out to be invention.
*/
function movesFor(task: Scored): string | null {
  if (!task.kpi) return null;
  if (task.kpi.met === false) return `${task.kpi.text} — currently NOT being met. This is the reason to do it first.`;
  if (task.kpi.met === true) return `${task.kpi.text} — currently being met. This protects it and gives the time back.`;
  return `${task.kpi.text} — not scored yet, so there is nothing to say about whether it is being met.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * As text, for the build queue
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The brief as markdown, which is what approving one produces.
 *
 * The same shape as the hand-written solar brief, because that shape is what a build actually
 * needed — and because somebody will paste this straight into Claude Code, which is exactly what it
 * is for.
 */
export function briefText(b: HowBrief): string {
  const L: string[] = [];
  L.push(`# ${b.title}`);
  L.push('');
  L.push(`**Effort:** ${b.effort} — ${EFFORT_MEANING[b.effort]}`);
  if (b.moves) L.push(`**KPI it moves:** ${b.moves}`);
  if (b.blockedBy.length) L.push(`**Blocked until connected:** ${b.blockedBy.join(', ')}`);
  L.push('');
  L.push('## Trigger');
  L.push(b.trigger);
  L.push('');
  L.push('## Steps');
  b.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
  L.push('');
  L.push('## Systems touched');
  b.systems.forEach(s => L.push(`- ${s}`));
  L.push('');
  L.push('## Guardrails');
  b.guardrails.forEach(g => L.push(`- ${g}`));
  L.push('');
  L.push('---');
  L.push('');
  L.push('_Generated by the SPEC automation review from the business\'s own roles, tasks and connected');
  L.push('systems. The steps are a skeleton: whoever builds it should confirm the trigger and the');
  L.push('specifics with the person who does the work today._');
  return L.join('\n');
}
