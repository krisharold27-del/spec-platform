import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const file = process.env.DATABASE_URL?.replace(/^file:/, '') ?? 'data/dev.db';
const globalForDb = globalThis as unknown as { sqlite?: Database.Database };
const sqlite = globalForDb.sqlite ?? new Database(file);
if (process.env.NODE_ENV !== 'production') globalForDb.sqlite = sqlite;
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
