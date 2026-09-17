/**
 * What order to delete tables in, worked out from the foreign keys rather than remembered.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Twice now the order has been a list, and twice the list has been wrong.
 *
 *   `role_tasks` names its business AND points at `criteria`, which does not.
 *     → "tenant tables first" is wrong.
 *   `role_curriculum` does NOT name its business AND points at `training_modules`, which does.
 *     → "children first" is wrong too.
 *
 * The two rules contradict each other. There is no fixed order that satisfies both, because the
 * dependencies interleave — and every time a table is added the answer can change again.
 *
 * Postgres already holds the answer and will not forget it: every foreign key is an edge saying
 * "this one goes before that one". So the order is sorted out of `pg_constraint` at run time. A
 * table added tomorrow, pointing anywhere, sorts itself.
 *
 * Both the product's own delete and the journeys' clean-up use this, so they cannot drift apart.
 */

/** Every foreign key in the public schema: which table points at which. Self-references excluded. */
export const FK_EDGES_SQL = `
  select rc.relname as child, pr.relname as parent
  from pg_constraint c
  join pg_class rc on rc.oid = c.conrelid
  join pg_class pr on pr.oid = c.confrelid
  join pg_namespace n on n.oid = rc.relnamespace
  where c.contype = 'f' and n.nspname = 'public' and rc.relname <> pr.relname`;

export type Edge = [child: string, parent: string];

/**
 * Children before parents.
 *
 * Kept pure, and separate from the querying, so it can be handed shapes that would take an
 * afternoon to build in a real database — including the one that matters most: a cycle.
 *
 * A cycle cannot be satisfied by any order, so whatever is left over is appended rather than
 * dropped. The database then refuses that statement and names the table, which is a far better
 * answer than a table quietly never being deleted.
 */
export function sortByDependency(tables: string[], edges: Edge[]): string[] {
  const want = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map(t => [t, new Set<string>()]));
  for (const [child, parent] of edges) {
    if (want.has(child) && want.has(parent)) parents.get(child)!.add(parent);
  }

  const order: string[] = [];
  const done = new Set<string>();
  // A table may go as soon as nothing still waiting points at it.
  let moved = true;
  while (moved && done.size < tables.length) {
    moved = false;
    for (const t of tables) {
      if (done.has(t)) continue;
      const stillPointedAt = tables.some(o => !done.has(o) && o !== t && parents.get(o)!.has(t));
      if (!stillPointedAt) { order.push(t); done.add(t); moved = true; }
    }
  }
  for (const t of tables) if (!done.has(t)) order.push(t);
  return order;
}
