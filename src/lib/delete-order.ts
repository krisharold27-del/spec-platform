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
 * The SCHEMA holds the answer: every `.references(...)` is an edge saying "this one goes before
 * that one". So the order is sorted out of it, and a table added tomorrow, pointing anywhere, sorts
 * itself. See `referenceEdges` in schema-sql.ts.
 *
 * ── And not out of the database ──────────────────────────────────────────────────────────────────
 *
 * The first version asked `pg_constraint`, which is the obvious place and the wrong one: this
 * product's migration deliberately emits no foreign keys, so CI's database and production's have
 * none to find. It returned zero edges, sorted nothing, and deleted parents before their children —
 * silently, because there was no constraint left to refuse it either.
 *
 * It was correct on a developer machine, whose database had been built by drizzle push and did have
 * the keys. That is the shape of the bug worth remembering: asking the database was asking the one
 * copy that could not answer.
 *
 * Both the product's own delete and the journeys' clean-up use this, so they cannot drift apart.
 */

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
