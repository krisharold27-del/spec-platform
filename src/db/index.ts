import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in.');

// One pooled connection per server instance. Supabase's transaction pooler (port 6543) does not
// support prepared statements, so they're disabled here.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };
const client = globalForDb.sql ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== 'production') globalForDb.sql = client;

export const db = drizzle(client, { schema });
export { schema };
