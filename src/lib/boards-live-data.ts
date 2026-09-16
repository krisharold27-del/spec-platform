import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  kindOf, readList, readHeadline, liveAgainst, stillHere, initials, boardMeta,
  type BoardKind, type Feed, type Row, type Step, type Headline,
} from './boards-live';

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
