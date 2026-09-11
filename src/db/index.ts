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

  // One pooled connection per server instance. Supabase's transaction pooler (port 6543) does not
  // support prepared statements, so they're disabled here. Kept on globalThis outside production so
  // a hot reload does not open a new pool every time a file is saved.
  const client = globalForDb.sql ?? postgres(connectionString, { prepare: false });
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
