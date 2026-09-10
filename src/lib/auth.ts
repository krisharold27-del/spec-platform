/**
 * Sign-in via Supabase Auth (magic-link email). No passwords are handled here — Supabase sends
 * the link, the user clicks it, src/app/auth/callback/route.ts exchanges the code for a session.
 * getCurrentUser() resolves that Supabase identity to our own app-level user row (by tenant).
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { createClient } from './supabase/server';

const now = () => new Date().toISOString();

/** See db/schema.ts users.access for what each level may do. */
export type AccessLevel = 'administrator' | 'full' | 'readonly';

/**
 * May this person manage — KPIs, marks, the chart — within their own scope? An administrator
 * manages exactly like `full`; administration is added on top, never instead. Checking for 'full'
 * alone locks the GM, who is the tenant's first administrator, out of their own business.
 */
export const canManage = (access: string) => access === 'full' || access === 'administrator';
export const MANAGING_ACCESS = ['full', 'administrator'] as const;

export interface CurrentUser {
  id: string; tenantId: string; email: string; name: string; access: AccessLevel;
}

/**
 * Resolves the signed-in Supabase Auth identity to our app-level user row.
 * Uses supabase.auth.getUser() (validates against the Supabase Auth server) rather than trusting
 * a local session cookie. Backfills users.authUserId by email the first time someone signs in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  const byAuthId = await db.select().from(schema.users).where(eq(schema.users.authUserId, authUser.id));
  let row = byAuthId[0];

  if (!row) {
    // First sign-in for this identity — link it to the app user by email.
    const byEmail = await db.select().from(schema.users).where(eq(schema.users.email, authUser.email.toLowerCase().trim()));
    row = byEmail[0];
    if (row) {
      await db.update(schema.users).set({ authUserId: authUser.id, acceptedAt: row.acceptedAt ?? now() }).where(eq(schema.users.id, row.id));
      row = { ...row, authUserId: authUser.id };
    }
  }

  if (!row) return null;
  return { id: row.id, tenantId: row.tenantId, email: row.email, name: row.name, access: row.access as AccessLevel };
}

/** Sends a magic-link sign-in email. `next` is where the callback route sends them afterwards. */
export async function sendMagicLink(email: string, next?: string) {
  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const redirectTo = `${appUrl}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  const { error } = await supabase.auth.signInWithOtp({ email: email.toLowerCase().trim(), options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Find a user by email across tenants (used to check invitation status before sending a link). */
export async function findUserByEmail(email: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim()));
  return rows[0];
}
