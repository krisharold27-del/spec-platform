import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * The database handle, connected on FIRST USE rather than on import.
 *
 * This file used to throw at module load when DATABASE_URL was missing. Almost every module in the
 * app imports `db`, so that one line turned a single missing setting into a total failure: the
 * production build collapsed while collecting page data for an API route, and at runtime every page
 * died — including the marketing pages, which never touch the database at all. One absent value
 * should degrade the thing that needs it, not detonate everything at once.
 *
 * Connecting lazily means the failure lands where it belongs. A page that reads nothing serves
 * normally. A route that queries fails on that request, with the error handled there. `/api/health`
 * reports the missing setting by name. Nothing else notices.
 *
 * The Proxy keeps every call site unchanged — `db.select()` still reads as an ordinary object — so
 * this is a change of failure behaviour and not a change anybody has to write code around.
 */

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

let handle: PostgresJsDatabase<typeof schema> | null = null;

function connect(): PostgresJsDatabase<typeof schema> {
  if (handle) return handle;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Thrown on the first QUERY now, never on import. The caller decides what to do about it.
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }

  /*
    ── The settings that decide whether a slow database becomes an outage ─────────────────────────

    This said `postgres(connectionString, { prepare: false })` and inherited every other default,
    and each of those defaults is the wrong one for a product sold by the seat.

    **max: 1.** The library opens up to ten connections per instance. Vercel runs many instances and
    adds more under load, so ten becomes hundreds, and Supabase's pooler has a hard ceiling. Hitting
    it does not degrade gracefully — further connections are refused, which is every page failing
    for everybody, at precisely the moment the product is busiest. One connection per instance,
    released immediately, is how a serverless app is meant to talk to a pooler. At twenty thousand
    seats this is the difference between scaling and falling over.

    **connect_timeout: 10.** With no timeout, a database that accepts a socket and then goes quiet
    leaves the request hanging until the platform kills it — half a minute of blank tab, which a
    customer reads as "it's down". Ten seconds is far longer than a healthy connect needs, and short
    enough to fail while somebody is still looking at the screen.

    **idle_timeout: 20.** Serverless instances are frozen and thrown away constantly. A connection
    left open by an instance that no longer exists holds a slot nobody can use until the server
    reclaims it, and enough of those reach the same ceiling as above, silently.

    Prepared statements stay off: Supabase's transaction pooler on 6543 does not support them.

    Kept on globalThis outside production so a hot reload does not open a new pool on every save.
  */
  const client = globalForDb.sql ?? postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  if (process.env.NODE_ENV !== 'production') globalForDb.sql = client;

  handle = drizzle(client, { schema });
  return handle;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, property, receiver) {
    return Reflect.get(connect() as object, property, receiver);
  },
  has(_target, property) {
    return Reflect.has(connect() as object, property);
  },
});

export { schema };
