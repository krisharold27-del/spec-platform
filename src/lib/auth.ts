/**
 * Sign-in via Supabase Auth (magic-link email). No passwords are handled here — Supabase sends
 * the link, the user clicks it, src/app/auth/callback/route.ts exchanges the code for a session.
 * getCurrentUser() resolves that Supabase identity to our own app-level user row (by tenant).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
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
/** Which of their businesses a person with more than one is looking at. Only ever one they hold a seat in. */
export const BUSINESS_COOKIE = 'spec_business';

type UserRow = typeof schema.users.$inferSelect;

/** Set on a sign-in identity once it has signed in through a link sent to its address. */
const PROVEN = 'spec_email_proven';
/** Proving needs the service key. Without it (a fresh local copy) every sign-in is by link anyway. */
const provingEnabled = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Record that this identity has proven its address — called whenever a sign-in link is used. */
export async function markEmailProven(authUserId: string): Promise<void> {
  if (!provingEnabled()) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(authUserId);
    if (data?.user && data.user.app_metadata?.[PROVEN] !== true) {
      await admin.auth.admin.updateUserById(authUserId, { app_metadata: { ...(data.user.app_metadata ?? {}), [PROVEN]: true } });
    }
  } catch (err) {
    console.error('[auth] could not record a proven address', (err as Error).message);
  }
}

/**
 * Signs a brand-new business's first person straight in — no email step. Links only the one seat
 * just created in that business; the address is NOT marked proven, so nothing else ever attaches
 * to it until they sign in through a link. Returns false when it cannot (no service key).
 */
export async function signInNewBusiness(email: string, tenantId: string): Promise<boolean> {
  if (!provingEnabled()) return false;
  const admin = createAdminClient();
  let { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) ({ data, error } = await admin.auth.admin.generateLink({ type: 'invite', email }));
  const props = data?.properties;
  if (error || !props?.hashed_token) return false;
  const supabase = await createClient();
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: props.hashed_token, type: emailOtpType(props.verification_type) ?? 'magiclink',
  });
  if (verifyError || !session?.user) return false;
  await db.update(schema.users).set({ authUserId: session.user.id, acceptedAt: now() })
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email), isNull(schema.users.authUserId)));
  return true;
}

/**
 * Every seat the signed-in person holds — one per business. One email can belong to several
 * businesses (a group owner, a consultant, a founder with a sandbox); each is its own row.
 */
const mySeats = cache(async (): Promise<UserRow[]> => {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) return [];
  const email = authUser.email.toLowerCase().trim();

  const linked = await db.select().from(schema.users).where(eq(schema.users.authUserId, authUser.id));
  // A seat added under this address — an invite, a second business — is linked only once the
  // address is PROVEN: signed into through a link sent to it. A business created at sign-up is
  // entered without an email, which proves nothing; without this, someone who signed up using
  // another person's address would inherit every seat later given to that address.
  const proven = !provingEnabled() || authUser.app_metadata?.[PROVEN] === true;
  const unlinked = proven
    ? await db.select().from(schema.users).where(and(eq(schema.users.email, email), isNull(schema.users.authUserId)))
    : [];
  for (const r of unlinked) {
    await db.update(schema.users).set({ authUserId: authUser.id, acceptedAt: r.acceptedAt ?? now() }).where(eq(schema.users.id, r.id));
  }
  const all = [...linked, ...unlinked.map(r => ({ ...r, authUserId: authUser.id, acceptedAt: r.acceptedAt ?? now() }))];
  // Stable order: the business they joined first comes first.
  return all.sort((a, b) => (a.acceptedAt ?? '').localeCompare(b.acceptedAt ?? '') || a.id.localeCompare(b.id));
}); // cache(): looked up once per request, however many places ask

/**
 * Resolves the signed-in Supabase Auth identity to our app-level user row — the seat in the business
 * they chose, or the first one they joined. Uses supabase.auth.getUser() (validated against the
 * Supabase Auth server) rather than trusting a local session cookie.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const seats = await mySeats();
  if (!seats.length) return null;
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const row = seats.find(s => s.tenantId === chosen) ?? seats[0];
  return { id: row.id, tenantId: row.tenantId, email: row.email, name: row.name, access: row.access as AccessLevel };
}

/** The businesses the signed-in person can open, for the switcher. */
export async function myBusinesses(): Promise<{ tenantId: string; name: string; current: boolean }[]> {
  const seats = await mySeats();
  if (!seats.length) return [];
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const current = (seats.find(s => s.tenantId === chosen) ?? seats[0]).tenantId;
  const tenants = await db.select({ id: schema.tenants.id, name: schema.tenants.name }).from(schema.tenants)
    .where(inArray(schema.tenants.id, seats.map(s => s.tenantId)));
  return seats.map(s => ({ tenantId: s.tenantId, name: tenants.find(t => t.id === s.tenantId)?.name ?? 'Business', current: s.tenantId === current }));
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
    const tooSoon = () => Object.assign(new Error('Sign-in email sent within the last minute.'), { status: 429 });
    if (!signInEmails.allow(address)) throw tooSoon();
    const admin = createAdminClient();
    // Across servers too: the last send is kept on the person's sign-in identity. Checked BEFORE a
    // new token is made, because making one would cancel the link already in their inbox.
    const knownId = (await db.select({ authUserId: schema.users.authUserId }).from(schema.users)
      .where(eq(schema.users.email, address)))[0]?.authUserId;
    if (knownId) {
      const { data: found } = await admin.auth.admin.getUserById(knownId);
      const last = Date.parse(String(found?.user?.app_metadata?.spec_link_sent_at ?? ''));
      if (Number.isFinite(last) && Date.now() - last < 60_000) throw tooSoon();
    }
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
    const u = data.user;
    if (u?.id) {
      // Best effort: the email has already gone, so a failure here must not look like a failed send.
      try {
        await admin.auth.admin.updateUserById(u.id, { app_metadata: { ...(u.app_metadata ?? {}), spec_link_sent_at: new Date().toISOString() } });
      } catch (err) {
        console.error('[signin] could not record the send time', (err as Error).message);
      }
    }
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
