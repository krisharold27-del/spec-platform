/**
 * Sign-in. Dev: email + cookie session in SQLite (no password — this is a local demo).
 * Production: replace `getCurrentUser` / `signIn` with Supabase Auth; everything else stays the same.
 */
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

const COOKIE = 'spec_session';
const now = () => new Date().toISOString();

export interface CurrentUser {
  id: string; tenantId: string; email: string; name: string; access: 'full' | 'readonly';
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db.select({ id: schema.users.id, tenantId: schema.users.tenantId, email: schema.users.email, name: schema.users.name, access: schema.users.access })
    .from(schema.sessions).innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.token, token)).get();
  return row ? { ...row, access: row.access as 'full' | 'readonly' } : null;
}

export async function signInUser(userId: string) {
  const token = randomUUID();
  db.insert(schema.sessions).values({ token, userId, createdAt: now() }).run();
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
  db.update(schema.users).set({ acceptedAt: now() }).where(eq(schema.users.id, userId)).run();
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
  jar.delete(COOKIE);
}

/** Find a user by email across tenants (dev only — production scopes by auth provider). */
export function findUserByEmail(email: string) {
  return db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim())).get();
}
