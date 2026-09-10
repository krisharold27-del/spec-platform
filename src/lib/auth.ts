/**
 * Sign-in via Supabase Auth (magic-link email). No passwords are handled here — Supabase sends
 * the link, the user clicks it, src/app/auth/callback/route.ts exchanges the code for a session.
 * getCurrentUser() resolves that Supabase identity to our own app-level user row (by tenant).
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { canSendEmail, sendSignInEmail } from './email';
import { emailOtpType, signInUrl } from './auth-redirect';
import { createThrottle } from './throttle';

const signInEmails = createThrottle(60_000);

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

/**
 * Sends the sign-in email. `next` is where they land afterwards.
 *
 * SPEC makes the one-time token and sends the email itself, linking to its own one-press page
 * (/auth/confirm). A link straight to the auth provider is spent by the first thing that opens it —
 * and email security scanners open every link — so people arrived at "Email link is invalid or has
 * expired". The one-press page spends nothing until a person presses it, and works on any device.
 *
 * Without the service-role key or Resend (a fresh local checkout) it falls back to the auth
 * provider's own email — degrade, don't break.
 */
export async function sendMagicLink(email: string, next?: string) {
  const address = email.toLowerCase().trim();
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && canSendEmail()) {
    // Supabase's own send limit no longer applies on this path, so SPEC keeps one of its own.
    if (!signInEmails.allow(address)) throw Object.assign(new Error('Sign-in email sent within the last minute.'), { status: 429 });
    const admin = createAdminClient();
    // Only asks for a token — generateLink never sends anything itself.
    let { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: address });
    if (error) {
      // No sign-in identity yet (the first sign-in straight after sign-up): an invite token creates it.
      ({ data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: address }));
    }
    if (error) throw error;
    const props = data.properties;
    if (!props?.hashed_token) throw new Error('No sign-in token was issued.');
    const type = emailOtpType(props.verification_type) ?? 'magiclink';
    await sendSignInEmail({ to: address, url: signInUrl(appUrl, props.hashed_token, type, next) });
    return;
  }

  const supabase = await createClient();
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
