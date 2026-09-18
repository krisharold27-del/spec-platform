/**
 * Boards — the pure part. Types, filters, presence, and the words on the screen.
 *
 * Kris, 16 September: *"no build these boards (artifacts) now - this is a key component of running
 * the business properly"*.
 *
 * The design's own sentence is the brief: *"Live boards your team pins, builds on and discusses —
 * wired to the data connected through SPEC. Not a snapshot; it updates as the numbers move."*
 *
 * ── Why `live` is a fact and not a badge ─────────────────────────────────────────────────────────
 *
 * A board is marked live when the systems it names are actually connected in SPEC. The screen shows
 * that, because "this updates as the numbers move" and "this was true in August" are different
 * things to be arguing in front of, and a board is exactly where two people are about to disagree
 * about a number. So the badge is derived from the connections, never set by hand — see
 * `liveAgainst`.
 */

export type BoardKind = 'live' | 'plans' | 'kpi' | 'improve' | 'training' | 'meetings';

/** The order the filter chips appear in, and the words on them. Straight from the design. */
export const BOARD_TYPES: { id: BoardKind; label: string; card: string }[] = [
  { id: 'live', label: 'Live data', card: 'Live data' },
  { id: 'plans', label: 'Plans', card: 'Plan' },
  { id: 'kpi', label: 'Scorecards', card: 'Scorecard' },
  { id: 'improve', label: 'Improvement opportunities', card: 'Improvement opportunity' },
  { id: 'training', label: 'Training', card: 'Training' },
  { id: 'meetings', label: 'Meeting outputs', card: 'Meeting output' },
];

export const kindOf = (value: string | null | undefined): BoardKind =>
  (BOARD_TYPES.some(t => t.id === value) ? value : 'improve') as BoardKind;

/** The label a card shows for its type — singular, because a card is one of them. */
export const cardLabel = (kind: BoardKind): string =>
  BOARD_TYPES.find(t => t.id === kind)?.card ?? 'Board';

export interface Feed { system: string; what: string }
export interface Row { label: string; source: string; value: string }
export interface Step { text: string; owner: string; state: StepState }
export interface Headline { wasLabel: string; was: string; nowLabel: string; now: string; note: string }

/**
 * Where a step has got to.
 *
 * Four, and none of them is a score. A plan is a thing a team is doing, not a thing being marked —
 * putting a percentage on it would turn the one place people are honest about what is stuck into
 * another place they are being measured.
 */
export type StepState = 'doing' | 'blocked' | 'done' | 'todo';

export const STEP_STATE: Record<StepState, { label: string; colour: string }> = {
  doing: { label: 'Being done now', colour: '#7a8a5e' },
  blocked: { label: 'Stuck', colour: '#c67139' },
  done: { label: 'Done', colour: '#4f7a3f' },
  todo: { label: 'Not started', colour: '#8c8681' },
};

export const stepStateOf = (value: string | null | undefined): StepState =>
  (['doing', 'blocked', 'done', 'todo'].includes(String(value)) ? value : 'todo') as StepState;

/** JSON in a text column, and never a thrown page because somebody's row is malformed. */
export function readList<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function readHeadline(raw: string | null | undefined): Headline | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Partial<Headline>;
    return h && h.now ? { wasLabel: 'Was', was: '', nowLabel: 'Now', now: '', note: '', ...h } as Headline : null;
  } catch {
    return null;
  }
}

/**
 * Is this board really live?
 *
 * Every system it names has to be connected and working. One of two feeds being dead makes a board
 * that is *partly* current, which on a screen reads as fully current — so it is not live, and the
 * page says which feed is the reason rather than dropping the badge in silence.
 */
export function liveAgainst(feeds: Feed[], connected: { name: string; status: string }[]): {
  live: boolean; missing: string[];
} {
  if (!feeds.length) return { live: false, missing: [] };
  const working = new Set(
    connected.filter(c => c.status === 'live').map(c => c.name.trim().toLowerCase()),
  );
  const missing = feeds.filter(f => !working.has(f.system.trim().toLowerCase())).map(f => f.system);
  return { live: missing.length === 0, missing };
}

/** "Simpro — job cost feed", the way the design writes it. */
export const feedLabel = (f: Feed): string => `${f.system} — ${f.what}`;

/**
 * Who counts as being in the room, and for how long.
 *
 * Five minutes. Long enough that two people working through the same board see each other, short
 * enough that a name is never still there an hour after somebody closed the tab — which would be
 * worse than showing nobody, because it would be a fact the screen was asserting and getting wrong.
 */
export const EDITING_WINDOW_MS = 5 * 60_000;

export const stillHere = (seenAt: string, now: number = Date.now()): boolean =>
  now - new Date(seenAt).getTime() < EDITING_WINDOW_MS;

/** "KH" from "Kris Harold". Two letters, and never more, because it sits in a 28px circle. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

/**
 * "3 editors · updated today" — the line under every card.
 *
 * `editors` is how many people have ever written on it, not how many are here now. The two get
 * confused constantly and they answer different questions: one is how collective this board is, the
 * other is whether to expect an argument in the next minute.
 */
export function boardMeta(editors: number, updatedAt: string, now: Date = new Date()): string {
  const people = `${editors} ${editors === 1 ? 'editor' : 'editors'}`;
  return `${people} · updated ${agoWords(updatedAt, now)}`;
}

/** today / yesterday / 4d ago / 2w ago. Never a bare date — nobody reads a date as elapsed time. */
export function agoWords(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'recently';
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : `${Math.floor(days / 30)}mo ago`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The filter, applied. `null` is All. */
export const visible = <T extends { kind: BoardKind }>(all: T[], filter: BoardKind | null): T[] =>
  (filter ? all.filter(b => b.kind === filter) : all);

/**
 * What a board with nothing on it says.
 *
 * The design's words, and they do a particular job: they tell somebody the board is not broken and
 * not waiting on SPEC — it is waiting on them to put something on it.
 */
export const EMPTY_BOARD =
  'This board fills in as your team pins items to it — from an improvement opportunity, a scorecard, '
  + 'a training result or a meeting output.';

export const BOARDS_INTRO =
  'Live mirrors your team pins, builds on and discusses — wired to the data connected through SPEC. '
  + 'Not a snapshot; it updates as the numbers move.';

export const NOTHING_PINNED =
  'No boards yet. A board is the thing your team makes together and comes back to — a rate you are '
  + 'arguing about, a plan with an owner against each step, the outputs of a meeting that must not '
  + 'be lost. Start one and pin to it as you go.';
