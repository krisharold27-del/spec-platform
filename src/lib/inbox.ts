/**
 * One queue of everything waiting on a person — pure functions, no I/O.
 *
 * The point of a single queue is that nothing waits in a place nobody looks. So most of what
 * appears here is DERIVED from the state it is about rather than stored as a task: a month waiting
 * to be signed is a period with status `submitted`; a training path waiting for a manager is a
 * finished path with no sign-off against it. Derived items cannot drift out of step with the
 * business, and nobody has to remember to close them.
 *
 * Only decisions that need a record of their own — a board approving a sensitive connector, money,
 * a target being renegotiated — are stored.
 *
 * Every item says what it blocks. An approval with no consequence is not urgent, and the queue is
 * more honest for saying so.
 */

export type InboxKind = 'Scoring' | 'Training' | 'Connection' | 'Spend' | 'KPI change' | 'Structure' | 'Other';

/** Who is entitled to decide. Two things are never delegable: a sensitive connector, and a period. */
export type DecideLevel = 'board' | 'administrator' | 'manager';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  /** Where the request came from. */
  from: string;
  detail: string;
  /** What is held up while this waits, or null when the honest answer is "nothing yet". */
  blocks: string | null;
  /** Days it has been waiting. */
  age: number;
  level: DecideLevel;
  /** Stored approvals can be decided from the queue; derived ones are done where they live. */
  href: string;
  /** Set for a stored approval, so the queue can act on it directly. */
  approvalId: string | null;
  tone: 'red' | 'amber' | 'green' | 'grey';
}

export const daysWaiting = (since: string, at: Date): number => {
  const t = Date.parse(since);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((at.getTime() - t) / 86_400_000));
};

/**
 * How loud an item is allowed to be.
 *
 * Age alone, deliberately: what it blocks is already stated in words, and colouring by importance
 * would mean SPEC ranking one person's decision above another's. Nothing here is a ranking.
 */
export function toneFor(age: number, blocks: string | null): InboxItem['tone'] {
  if (!blocks) return 'grey';
  if (age >= 14) return 'red';
  if (age >= 3) return 'amber';
  return 'green';
}

export interface StoredApproval {
  id: string;
  kind: string;
  title: string;
  detail: string;
  blocks: string | null;
  decidedByLevel: string;
  requestedBy: string;
  requestedAt: string;
  state: string;
}

const KIND: Record<string, InboxKind> = {
  connection: 'Connection',
  spend: 'Spend',
  kpi_change: 'KPI change',
};

export function fromStored(a: StoredApproval, at: Date): InboxItem {
  const age = daysWaiting(a.requestedAt, at);
  return {
    id: `approval:${a.id}`,
    kind: KIND[a.kind] ?? 'Other',
    title: a.title,
    from: `Requested by ${a.requestedBy}`,
    detail: a.detail,
    blocks: a.blocks,
    age,
    level: (['board', 'administrator', 'manager'] as const).includes(a.decidedByLevel as DecideLevel)
      ? (a.decidedByLevel as DecideLevel)
      : 'board',
    href: '/inbox',
    approvalId: a.id,
    tone: toneFor(age, a.blocks),
  };
}

export interface DerivedInputs {
  /** The open month, when it has been handed up and is waiting for a signature. */
  submittedPeriod: { period: string; submittedBy: string | null; submittedAt: string | null; scoredRoles: number; flagged: number } | null;
  /** Finished training paths with nobody's signature against them yet. */
  trainingSignoffs: { roleId: string; title: string; person: string; completedModules: number }[];
  /** Roles reporting in that nobody holds, with how long they have been open. */
  vacancies: { roleId: string; title: string; since: string | null }[];
  /** Targets proposed and not yet agreed. */
  targetChanges: { criterionId: string; roleId: string; text: string; proposed: string; agreed: string }[];
}

/** Everything waiting that SPEC can work out for itself, rather than being told. */
export function derived(input: DerivedInputs, at: Date): InboxItem[] {
  const items: InboxItem[] = [];

  if (input.submittedPeriod) {
    const p = input.submittedPeriod;
    const age = p.submittedAt ? daysWaiting(p.submittedAt, at) : 0;
    const blocks = 'Blocks: the period cannot lock and the board pack cannot issue.';
    items.push({
      id: `period:${p.period}`,
      kind: 'Scoring',
      title: `Sign off ${p.period} scoring`,
      from: p.submittedBy ? `Submitted by ${p.submittedBy}` : 'Submitted for sign-off',
      detail: `${p.scoredRoles} ${p.scoredRoles === 1 ? 'role' : 'roles'} scored${p.flagged ? `, ${p.flagged} ${p.flagged === 1 ? 'figure' : 'figures'} flagged as unmeasurable` : ''}.`,
      blocks,
      age,
      level: 'board',
      href: '/scoring',
      approvalId: null,
      tone: toneFor(age, blocks),
    });
  }

  for (const t of input.trainingSignoffs) {
    const blocks = 'Blocks: their Ace run cannot start until the path is signed.';
    items.push({
      id: `training:${t.roleId}`,
      kind: 'Training',
      title: `Sign off ${t.person}’s training path`,
      from: `Completed by ${t.person}, ${t.title}`,
      detail: `Every module passed — ${t.completedModules} in the path for this role.`,
      blocks,
      age: 0,
      level: 'manager',
      href: '/training',
      approvalId: null,
      tone: 'amber',
    });
  }

  for (const v of input.vacancies) {
    const age = v.since ? daysWaiting(v.since, at) : 0;
    const blocks = 'Blocks: the role has no score, and the work usually shows up as amber numbers around it.';
    items.push({
      id: `vacancy:${v.roleId}`,
      kind: 'Structure',
      title: `${v.title} is unfilled`,
      from: 'From the org chart',
      detail: 'A role with nobody in it keeps its KPIs and waits. It is left out of the roll-up rather than counted as a zero.',
      blocks,
      age,
      level: 'administrator',
      href: '/org',
      approvalId: null,
      tone: toneFor(age, blocks),
    });
  }

  for (const c of input.targetChanges) {
    items.push({
      id: `target:${c.criterionId}`,
      kind: 'KPI change',
      title: `${c.text} — ${c.proposed} proposed, ${c.agreed} agreed`,
      from: 'From the KPI negotiation',
      detail: 'The negotiation is kept rather than hidden, so the month is read against what was actually settled.',
      blocks: null,
      age: 0,
      level: 'manager',
      href: `/scorecard/${c.roleId}`,
      approvalId: null,
      tone: 'grey',
    });
  }

  return items;
}

/**
 * The queue, longest wait first.
 *
 * Not by importance: SPEC does not rank one person's decision above another's, and the consequence
 * of each is already written on it in words.
 */
export function queue(stored: StoredApproval[], input: DerivedInputs, at: Date = new Date()): InboxItem[] {
  const items = [
    ...stored.filter(a => a.state === 'waiting').map(a => fromStored(a, at)),
    ...derived(input, at),
  ];
  return items.sort((a, b) => b.age - a.age || a.title.localeCompare(b.title));
}

/** "waiting 12 days" — how it reads on the card. */
export function ageLabel(days: number): string {
  if (days <= 0) return 'waiting today';
  if (days === 1) return 'waiting 1 day';
  if (days < 21) return `waiting ${days} days`;
  const weeks = Math.floor(days / 7);
  return `waiting ${weeks} weeks`;
}
