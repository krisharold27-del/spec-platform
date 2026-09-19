import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  kindOf, readList, readHeadline, liveAgainst, stillHere, initials, boardMeta,
  type BoardKind, type Feed, type Row, type Step, type StepState, type Headline,
} from './boards-live';
import type { MirrorKpi } from './mirror-kpis';

/**
 * Boards, against the database.
 *
 * Every read is scoped by tenant in the query itself rather than filtered afterwards — the rule the
 * whole product follows, and the one that leaked in boards-data once before: "read everything, then
 * keep ours" is one clause away from another business's numbers, and it grows with every customer.
 */

export interface BoardCard {
  id: string;
  title: string;
  summary: string;
  kind: BoardKind;
  /** Derived from the connections that exist RIGHT NOW, never from a stored flag. See liveAgainst. */
  live: boolean;
  /** Which named feeds are not working, when it claims to be live and is not. */
  missingFeeds: string[];
  feeds: Feed[];
  editors: string[];
  meta: string;
  updatedAt: string;
}

export interface BoardDetail extends BoardCard {
  rows: Row[];
  steps: Step[];
  headline: Headline | null;
  editingNow: string[];
  comments: { id: string; authorName: string; text: string; createdAt: string }[];
}

const connectionsFor = async (tenantId: string) =>
  db.select({ name: schema.systemConnections.name, status: schema.systemConnections.status })
    .from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      // A personal mailbox is not a business feed, and a board is a thing a team shares.
      isNull(schema.systemConnections.personalFor),
    ));

/** Everyone who has ever written on a board — what "3 editors" counts. */
async function editorsFor(tenantId: string, boardIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!boardIds.length) return out;
  const rows = await db
    .select({ boardId: schema.boardComments.boardId, name: schema.boardComments.authorName })
    .from(schema.boardComments)
    .where(eq(schema.boardComments.tenantId, tenantId));
  for (const r of rows) {
    if (!boardIds.includes(r.boardId)) continue;
    if (!out.has(r.boardId)) out.set(r.boardId, new Set());
    out.get(r.boardId)!.add(r.name);
  }
  return out;
}

export async function listBoards(tenantId: string): Promise<BoardCard[]> {
  const rows = await db.select().from(schema.boards)
    .where(eq(schema.boards.tenantId, tenantId))
    .orderBy(desc(schema.boards.updatedAt));
  const connected = await connectionsFor(tenantId);
  const editors = await editorsFor(tenantId, rows.map(r => r.id));

  return rows.map(r => {
    const feeds = readList<Feed>(r.feeds);
    const { live, missing } = liveAgainst(feeds, connected);
    const who = [...(editors.get(r.id) ?? new Set<string>())];
    // The person who made it is an editor even before anybody has said anything.
    if (!who.includes(r.createdBy)) who.unshift(r.createdBy);
    return {
      id: r.id,
      title: r.title,
      summary: r.summary,
      kind: kindOf(r.kind),
      live,
      missingFeeds: missing,
      feeds,
      editors: who,
      meta: boardMeta(who.length, r.updatedAt),
      updatedAt: r.updatedAt,
    };
  });
}

export async function getBoard(tenantId: string, boardId: string): Promise<BoardDetail | null> {
  const rows = await db.select().from(schema.boards)
    .where(and(eq(schema.boards.tenantId, tenantId), eq(schema.boards.id, boardId)));
  const r = rows[0];
  if (!r) return null;

  const connected = await connectionsFor(tenantId);
  const feeds = readList<Feed>(r.feeds);
  const { live, missing } = liveAgainst(feeds, connected);

  const comments = await db.select().from(schema.boardComments)
    .where(and(eq(schema.boardComments.tenantId, tenantId), eq(schema.boardComments.boardId, boardId)))
    .orderBy(schema.boardComments.createdAt);

  const viewers = await db
    .select({ seenAt: schema.boardViewers.seenAt, name: schema.users.name })
    .from(schema.boardViewers)
    .innerJoin(schema.users, eq(schema.users.id, schema.boardViewers.userId))
    .where(and(eq(schema.boardViewers.tenantId, tenantId), eq(schema.boardViewers.boardId, boardId)));

  const who = [...new Set([r.createdBy, ...comments.map(c => c.authorName)])];

  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    kind: kindOf(r.kind),
    live,
    missingFeeds: missing,
    feeds,
    editors: who,
    meta: boardMeta(who.length, r.updatedAt),
    updatedAt: r.updatedAt,
    rows: readList<Row>(r.rows),
    steps: readList<Step>(r.steps),
    headline: readHeadline(r.headline),
    editingNow: viewers.filter(v => stillHere(v.seenAt)).map(v => v.name),
    comments: comments.map(c => ({
      id: c.id, authorName: c.authorName, text: c.text, createdAt: c.createdAt,
    })),
  };
}

/**
 * Mark somebody as being in the room.
 *
 * Called when a board is opened. One row per person per board, refreshed — so the table stays the
 * size of the team rather than growing with every page view.
 */
export async function markViewing(tenantId: string, boardId: string, userId: string): Promise<void> {
  const seenAt = new Date().toISOString();
  const existing = await db.select({ id: schema.boardViewers.id })
    .from(schema.boardViewers)
    .where(and(eq(schema.boardViewers.boardId, boardId), eq(schema.boardViewers.userId, userId)));
  if (existing[0]) {
    await db.update(schema.boardViewers).set({ seenAt }).where(eq(schema.boardViewers.id, existing[0].id));
    return;
  }
  await db.insert(schema.boardViewers).values({
    id: randomUUID(), tenantId, boardId, userId, seenAt,
  });
}

export async function createBoard(opts: {
  tenantId: string; title: string; kind: BoardKind; summary?: string; createdBy: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(schema.boards).values({
    id,
    tenantId: opts.tenantId,
    title: opts.title,
    summary: opts.summary ?? '',
    kind: opts.kind,
    live: false,
    feeds: '[]', rows: '[]', steps: '[]',
    createdBy: opts.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Say something on a board.
 *
 * Touching `updatedAt` is the point: a board somebody argued on this morning is a board that moved
 * this morning, whatever the numbers did. The card says "updated today" because it was.
 */
export async function commentOnBoard(opts: {
  tenantId: string; boardId: string; authorName: string; text: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.boardComments).values({
    id: randomUUID(),
    tenantId: opts.tenantId,
    boardId: opts.boardId,
    authorName: opts.authorName,
    text: opts.text,
    createdAt: now,
  });
  await db.update(schema.boards).set({ updatedAt: now })
    .where(and(eq(schema.boards.tenantId, opts.tenantId), eq(schema.boards.id, opts.boardId)));
}

export { initials };

/**
 * Read a mirror's KPI lines, live, for one month.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — *"live and interactive,
 * not a report"* — and *"align to key kpi's in the business"*.
 *
 * Every number on a mirror was stored text, written once. This is the half that is not: a line that
 * names a criterion is looked up again on every open, against whichever period is being viewed. No
 * second copy, nothing to refresh, and no way for the mirror to drift away from the scorecard it is
 * quoting — because it is not quoting it, it is reading it.
 *
 * ── The rule that decides what a viewer may see ──────────────────────────────────────────────────
 *
 * `visible` is the viewer's scope, from lib/scope. A mirror is a conversation object and people
 * will put things on it; that must never become a way to read a scorecard belonging to somebody
 * outside your own part of the chart. So a line whose role is out of scope is dropped here, at the
 * read, rather than hidden in the page — and the caller is told how many went, because a mirror
 * that silently shows a different number of rows to different people is its own kind of trouble.
 */
export async function mirrorKpisFor(opts: {
  tenantId: string;
  rows: Row[];
  periodId: string | null;
  visible: Set<string>;
}): Promise<{ kpis: MirrorKpi[]; hidden: number }> {
  const named = opts.rows.filter(r => r.criterionId && r.roleId);
  if (!named.length) return { kpis: [], hidden: 0 };

  const inScope = named.filter(r => opts.visible.has(r.roleId!));
  const hidden = named.length - inScope.length;
  if (!inScope.length) return { kpis: [], hidden };

  const criterionIds = [...new Set(inScope.map(r => r.criterionId!))];
  const roleIds = [...new Set(inScope.map(r => r.roleId!))];

  const criteria = await db.select().from(schema.criteria)
    .where(inArray(schema.criteria.id, criterionIds));
  const roles = await db.select().from(schema.roles)
    .where(and(inArray(schema.roles.id, roleIds), eq(schema.roles.tenantId, opts.tenantId)));

  /*
    Scoped by TENANT through the roles, not by trusting the criterion id on the row.

    A mirror's rows are JSON that people edit. A criterion id sitting in one is somebody else's text
    until a query proves it belongs to this business, and `criteria` has no tenant column of its own
    — it reaches the business through its role. So the role is what is checked, and a line whose
    role is not in this tenant simply is not there.
  */
  const roleById = new Map(roles.map(r => [r.id, r]));

  const answers = opts.periodId
    ? await db.select().from(schema.assessments)
        .where(and(
          eq(schema.assessments.periodId, opts.periodId),
          inArray(schema.assessments.criterionId, criterionIds),
        ))
    : [];
  const answerFor = new Map(answers.map(a => [a.criterionId, a]));

  const kpis: MirrorKpi[] = [];
  for (const row of inScope) {
    const criterion = criteria.find(c => c.id === row.criterionId);
    const role = roleById.get(row.roleId!);
    if (!criterion || !role || criterion.roleId !== role.id) continue;

    const answer = answerFor.get(criterion.id);
    kpis.push({
      criterionId: criterion.id,
      roleId: role.id,
      text: criterion.text,
      pillar: criterion.pillar as MirrorKpi['pillar'],
      roleTitle: role.title,
      target: criterion.target,
      status: (answer?.status as MirrorKpi['status']) ?? null,
      result: answer?.result ?? null,
    });
  }
  return { kpis, hidden };
}

/**
 * Put one of the business's KPIs onto a mirror.
 *
 * Stored as a POINTER — the criterion and its role — and never as the number, which is the whole
 * point: a copied figure is out of date the moment the month is scored.
 */
export async function addKpiToBoard(opts: {
  tenantId: string;
  boardId: string;
  criterionId: string;
  roleId: string;
}): Promise<{ added: boolean }> {
  const [board] = await db.select().from(schema.boards)
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  if (!board) return { added: false };

  // The criterion has to belong to a role in THIS business. See the note above about trusting ids.
  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, opts.roleId), eq(schema.roles.tenantId, opts.tenantId)));
  const [criterion] = await db.select().from(schema.criteria)
    .where(eq(schema.criteria.id, opts.criterionId));
  if (!role || !criterion || criterion.roleId !== role.id) return { added: false };

  const rows = readList<Row>(board.rows);
  if (rows.some(r => r.criterionId === opts.criterionId)) return { added: false };

  rows.push({
    label: criterion.text,
    source: role.title,
    value: '',
    criterionId: criterion.id,
    roleId: role.id,
  });

  await db.update(schema.boards)
    .set({ rows: JSON.stringify(rows), updatedAt: new Date().toISOString() })
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  return { added: true };
}

/** Take a KPI back off a mirror. The KPI itself is untouched — this is only what the mirror shows. */
export async function removeKpiFromBoard(opts: {
  tenantId: string; boardId: string; criterionId: string;
}): Promise<void> {
  const [board] = await db.select().from(schema.boards)
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  if (!board) return;

  const rows = readList<Row>(board.rows).filter(r => r.criterionId !== opts.criterionId);
  await db.update(schema.boards)
    .set({ rows: JSON.stringify(rows), updatedAt: new Date().toISOString() })
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
}

/**
 * Working IN a plan, rather than reading one.
 *
 * ── Why a plan on a mirror had to become something you can move ──────────────────────────────────
 *
 * Kris, 19 September: *"so the King of the Mountain mirror must be interactive"*.
 *
 * King of the Mountain is the plan mirror — what needs fixing, who is doing it, and where each one
 * has got to. It was a printed list. The states were right there on the screen, in the business's
 * own words, and the only way to move one was for somebody to go and edit a row of JSON. So the
 * thing a team is looking at in a meeting could not be changed in that meeting, which is the moment
 * it is worth changing.
 *
 * ── What is deliberately still forbidden ─────────────────────────────────────────────────────────
 *
 * A plan is never scored. There is no "60% complete" and no count of steps done, because a plan
 * carrying a number becomes a number people manage rather than work they do — `scripts/
 * boards-journey.mjs` holds that rule against the plan's own section of the screen.
 *
 * Steps are matched by their TEXT rather than by an index. A list two people are moving at once is
 * exactly where "the third one" stops meaning the same thing to both of them, and the cost of
 * getting it wrong is somebody else's step silently changing state.
 */
export async function moveStep(opts: {
  tenantId: string;
  boardId: string;
  text: string;
  state: StepState;
}): Promise<{ moved: boolean }> {
  const [board] = await db.select().from(schema.boards)
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  if (!board) return { moved: false };

  const steps = readList<Step>(board.steps);
  const found = steps.find(s => s.text === opts.text);
  if (!found) return { moved: false };
  if (found.state === opts.state) return { moved: false };

  found.state = opts.state;
  await db.update(schema.boards)
    .set({ steps: JSON.stringify(steps), updatedAt: new Date().toISOString() })
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  return { moved: true };
}

/** Add a step to a plan. Starts Not started, because claiming work is a separate act from doing it. */
export async function addStep(opts: {
  tenantId: string; boardId: string; text: string; owner: string;
}): Promise<{ added: boolean }> {
  const text = opts.text.trim().slice(0, 300);
  if (!text) return { added: false };

  const [board] = await db.select().from(schema.boards)
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  if (!board) return { added: false };

  const steps = readList<Step>(board.steps);
  // The same words twice is a list nobody can move a single line of — see the note about matching
  // steps by their text.
  if (steps.some(s => s.text === text)) return { added: false };

  steps.push({ text, owner: opts.owner.trim().slice(0, 120) || 'Nobody yet', state: 'todo' });
  await db.update(schema.boards)
    .set({ steps: JSON.stringify(steps), updatedAt: new Date().toISOString() })
    .where(and(eq(schema.boards.id, opts.boardId), eq(schema.boards.tenantId, opts.tenantId)));
  return { added: true };
}
