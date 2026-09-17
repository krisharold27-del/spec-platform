import { sql } from 'drizzle-orm';
import { db } from '../db';
import { tableShapes } from './schema-sql';
import { FK_EDGES_SQL, sortByDependency } from './delete-order';

/**
 * Deleting a business, permanently — the most dangerous thing in SPEC.
 *
 * ── Why it exists ────────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 16 September: *"yes build a safe way to clear the test businesses"*. Production has a
 * handful of throwaways in it — Hall Contracting and the businesses these journeys create — and they
 * were about to be cleared by somebody typing DELETE into a database console at the same keyboard
 * that holds the only copy of every real customer.
 *
 * So the point of this file is not that it deletes. Deleting is one line. The point is everything
 * that has to be true first, and the proof afterwards that it did what it said.
 *
 * ── The guards ───────────────────────────────────────────────────────────────────────────────────
 *
 *   Only SPEC's own people can reach it     — ADMIN_EMAILS, checked on the server (the caller).
 *   The name has to be typed, exactly       — no list of buttons where the wrong row is one pixel
 *                                              away from the right one.
 *   Never the business you are signed into  — deleting the room you are standing in.
 *   NEVER ONE THAT HAS EVER PAID            — a Stripe customer or subscription id means a real
 *                                              customer, whatever the name looks like. This is the
 *                                              guard that matters, because the others protect
 *                                              against a slip and this one protects against being
 *                                              wrong about what a business IS.
 *
 * ── And it checks its own work ───────────────────────────────────────────────────────────────────
 *
 * Everything happens inside one transaction, and before committing it asks the database whether any
 * row anywhere is now pointing at a parent that no longer exists. If a single orphan is found, the
 * whole thing rolls back and says so.
 *
 * That check is why a table I forgot cannot leave a half-deleted business behind. SPEC has 32 tables
 * and 23 of them carry a tenant id; the other nine hang off roles, periods or criteria. Enumerating
 * them by hand and getting it right is exactly the kind of thing that is right today and wrong the
 * next time somebody adds a table — so the deletion is generated from the schema, and the proof is
 * asked of the database rather than of my memory.
 */

export type Refusal = 'not_found' | 'name_mismatch' | 'own_business' | 'has_paid' | 'left_orphans';

export interface Standing {
  id: string;
  name: string;
  plan: string;
  /** Has money ever been involved? The one fact that outranks every other consideration. */
  everPaid: boolean;
  counts: { people: number; roles: number; problems: number; marks: number };
}

/** Every table that carries a tenant id, straight from the schema rather than from a list. */
export const tenantTables = (): string[] =>
  tableShapes()
    .filter(t => t.columns.some(c => c.name === 'tenant_id'))
    .map(t => t.name)
    .sort();

/**
 * The tables that belong to a business WITHOUT saying so, and what they hang off.
 *
 * Each is deleted through its parent before the parent goes. Written out because the relationship
 * is the point — a reader has to be able to see why `gates` is a business's data at all.
 */
export const INDIRECT: { table: string; clear: (tenantId: string) => ReturnType<typeof sql> }[] = [
  {
    table: 'assessments',
    clear: id => sql`delete from assessments where role_id in (select id from roles where tenant_id = ${id})`,
  },
  {
    table: 'board_outputs',
    clear: id => sql`delete from board_outputs where period_id in (select id from assessment_periods where tenant_id = ${id})`,
  },
  {
    table: 'gates',
    clear: id => sql`delete from gates where period_id in (select id from assessment_periods where tenant_id = ${id})`,
  },
  {
    table: 'role_curriculum',
    clear: id => sql`delete from role_curriculum where role_id in (select id from roles where tenant_id = ${id})`,
  },
  {
    table: 'role_assignments',
    clear: id => sql`delete from role_assignments where role_id in (select id from roles where tenant_id = ${id})`,
  },
  {
    table: 'criteria',
    clear: id => sql`delete from criteria where role_id in (select id from roles where tenant_id = ${id})`,
  },
  /*
    Boards' children go before boards, and boards goes before users — a viewer points at both. They
    all carry a tenant id, so the generated pass would reach them, but the ORDER is what matters:
    without this, deleting `users` trips the viewer foreign key. The orphan check would have caught
    it and rolled back, which is the safe answer and not the right one.
  */
  {
    table: 'board_viewers',
    clear: id => sql`delete from board_viewers where tenant_id = ${id}`,
  },
  {
    table: 'board_comments',
    clear: id => sql`delete from board_comments where tenant_id = ${id}`,
  },
  {
    table: 'boards',
    clear: id => sql`delete from boards where tenant_id = ${id}`,
  },
];

/**
 * Rows that reference something no longer there. Asked of the whole database, not of this business,
 * because the question "did I leave a mess" is not one you ask only where you were looking.
 */
const ORPHAN_CHECKS: { label: string; query: string }[] = [
  { label: 'assessments without a role', query: 'select count(*)::int as n from assessments a left join roles r on r.id = a.role_id where r.id is null' },
  { label: 'assessments without a period', query: 'select count(*)::int as n from assessments a left join assessment_periods p on p.id = a.period_id where p.id is null' },
  { label: 'assessments without a criterion', query: 'select count(*)::int as n from assessments a left join criteria c on c.id = a.criterion_id where c.id is null' },
  { label: 'criteria without a role', query: 'select count(*)::int as n from criteria c left join roles r on r.id = c.role_id where r.id is null' },
  { label: 'role assignments without a role', query: 'select count(*)::int as n from role_assignments ra left join roles r on r.id = ra.role_id where r.id is null' },
  { label: 'curriculum without a role', query: 'select count(*)::int as n from role_curriculum rc left join roles r on r.id = rc.role_id where r.id is null' },
  { label: 'curriculum without a module', query: 'select count(*)::int as n from role_curriculum rc left join training_modules m on m.id = rc.module_id where m.id is null' },
  { label: 'board packs without a period', query: 'select count(*)::int as n from board_outputs b left join assessment_periods p on p.id = b.period_id where p.id is null' },
  { label: 'gates without a period', query: 'select count(*)::int as n from gates g left join assessment_periods p on p.id = g.period_id where p.id is null' },
  { label: 'training records without a person', query: "select count(*)::int as n from training_records t left join users u on u.id = t.user_id where t.user_id is not null and u.id is null" },
  { label: 'board comments without a board', query: 'select count(*)::int as n from board_comments c left join boards b on b.id = c.board_id where b.id is null' },
  { label: 'board viewers without a board', query: 'select count(*)::int as n from board_viewers v left join boards b on b.id = v.board_id where b.id is null' },
  { label: 'board viewers without a person', query: 'select count(*)::int as n from board_viewers v left join users u on u.id = v.user_id where u.id is null' },
];

/** What is about to be destroyed, in numbers, so nobody deletes a business they have not looked at. */
export async function standingOf(tenantId: string): Promise<Standing | null> {
  const rows = await db.execute(sql`
    select t.id, t.name, t.plan, t.stripe_customer_id, t.stripe_subscription_id,
      (select count(*)::int from users u where u.tenant_id = t.id) as people,
      (select count(*)::int from roles r where r.tenant_id = t.id) as roles,
      (select count(*)::int from register_entries e where e.tenant_id = t.id) as problems,
      (select count(*)::int from assessments a
        where a.role_id in (select id from roles where tenant_id = t.id)) as marks
    from tenants t where t.id = ${tenantId}`);

  const r = (rows as unknown as Record<string, unknown>[])[0];
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    plan: String(r.plan),
    everPaid: Boolean(r.stripe_customer_id) || Boolean(r.stripe_subscription_id),
    counts: {
      people: Number(r.people), roles: Number(r.roles),
      problems: Number(r.problems), marks: Number(r.marks),
    },
  };
}

export type Outcome =
  | { ok: true; deleted: Standing }
  | { ok: false; refusal: Refusal; detail?: string };

/**
 * Delete it, having checked everything, and check again before committing.
 *
 * `typedName` must match the stored name exactly once trimmed. `signedIntoTenantId` is the business
 * the person doing this is currently inside, which is never a business they may delete.
 */
export async function deleteBusiness(
  tenantId: string,
  typedName: string,
  signedIntoTenantId: string,
): Promise<Outcome> {
  const standing = await standingOf(tenantId);
  if (!standing) return { ok: false, refusal: 'not_found' };
  if (standing.name.trim() !== typedName.trim()) return { ok: false, refusal: 'name_mismatch' };
  if (tenantId === signedIntoTenantId) return { ok: false, refusal: 'own_business' };
  /*
    Money outranks everything. A business Stripe has heard of is a real customer whatever it is
    called, and no amount of typing the name correctly makes it safe to remove their records.
  */
  if (standing.everPaid) return { ok: false, refusal: 'has_paid' };

  let orphaned: string | null = null;
  let blocked: string | null = null;

  await db.transaction(async tx => {
    /*
      One statement per table, run in the order the foreign keys dictate.

      The order used to be written down here, and it was wrong twice. `role_tasks` names its
      business AND points at `criteria`, which does not — so "tenant tables first" is wrong.
      `role_curriculum` does NOT name its business AND points at `training_modules`, which does —
      so "children first" is wrong too. No fixed order satisfies both.

      When it was wrong, Postgres refused and the orphan guard below turned that into "stopped and
      put everything back": safe, and the wrong answer, because a business that can never be deleted
      looks exactly like a business that is protected. So the order is asked of `pg_constraint`
      instead — see `delete-order.ts`.
    */
    const byTable = new Map<string, ReturnType<typeof sql>>();
    for (const table of tenantTables()) {
      // The table name is an identifier from OUR schema; the id is bound. Never string-built with
      // a value from a form in it — this is the one function in SPEC that deletes a business.
      byTable.set(table, sql`delete from ${sql.identifier(table)} where tenant_id = ${tenantId}`);
    }
    for (const { table, clear } of INDIRECT) byTable.set(table, clear(tenantId));
    byTable.set('tenants', sql`delete from tenants where id = ${tenantId}`);

    const rows = await tx.execute(sql.raw(FK_EDGES_SQL));
    const edges = (rows as unknown as { child: string; parent: string }[]);
    const order = sortByDependency([...byTable.keys()], [...edges].map(e => [e.child, e.parent]));
    for (const table of order) await tx.execute(byTable.get(table)!);

    // The proof. Anything still pointing at something that has gone means a table was missed, and
    // a half-deleted business is worse than one that is still there.
    for (const { label, query } of ORPHAN_CHECKS) {
      const rows = await tx.execute(sql.raw(query));
      const n = Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
      if (n > 0) { orphaned = `${n} ${label}`; break; }
    }
    if (orphaned) tx.rollback();
  }).catch((err: unknown) => {
    // tx.rollback() throws by design; anything else is a real failure and must not read as success.
    if (orphaned) return;
    /*
      A foreign key stopped it — which is the database doing this file's job better than this file
      can, and is exactly what happens if somebody adds a table and does not add it here.

      Proven by forcing a wrong delete order: Postgres refuses to delete the row something still
      points at, the whole transaction rolls back, and NOTHING is deleted. That was already the safe
      outcome; what it was not was a sentence. It arrived as a stack trace, which on the admin screen
      is the generic "something went wrong" page — the same fault this product spent a day fixing
      everywhere else.

      ── And the sentence had quietly stopped arriving ──────────────────────────────────────────

      Putting the fault back is how that was found. Drizzle WRAPS the Postgres error in a
      DrizzleQueryError, so `err.code` is undefined and the real one is on `err.cause` — this read
      the outer error, matched nothing, rethrew, and the admin screen was back to "something went
      wrong". A check that had been proven once had stopped being true, and nothing said so.
    */
    const pg = (err as { code?: string; cause?: unknown })?.code
      ? (err as { code?: string; table_name?: string })
      : ((err as { cause?: { code?: string; table_name?: string } })?.cause ?? {});
    const code = pg.code;
    const table = pg.table_name;
    if (code === '23503') {
      blocked = table ? `rows in ${table} still point at it` : 'rows elsewhere still point at it';
      return;
    }
    throw err;
  });

  if (blocked) return { ok: false, refusal: 'left_orphans', detail: blocked };
  if (orphaned) return { ok: false, refusal: 'left_orphans', detail: orphaned };
  return { ok: true, deleted: standing };
}

/** What each refusal means, in the words the screen shows. */
export const REFUSAL_SAID: Record<Refusal, string> = {
  not_found: 'That business is not there — it may already have been deleted.',
  name_mismatch: 'The name did not match, so nothing was deleted. It has to be typed exactly.',
  own_business: 'That is the business you are signed into. Switch to another one first.',
  has_paid:
    'That business has been through Stripe, so it is a real customer and cannot be deleted from here. '
    + 'If it genuinely needs to go, cancel the subscription first and say so out loud.',
  left_orphans:
    'Stopped and put everything back: the delete would have left rows behind pointing at records '
    + 'that no longer exist. Nothing was changed. This means SPEC has a table this does not know about.',
};
