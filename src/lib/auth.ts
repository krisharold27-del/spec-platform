/**
 * Sign-in: email and password, straight in. No email step to get started — the beginning has to be
 * smooth. Email is used for exactly two things: "Forgot password?", and confirming the address the
 * first time someone adds a seat (security arrives when it matters, not at the door).
 * getCurrentUser() resolves the Supabase identity to our app-level user row (by business).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db, schema } from '../db';
import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { canSendEmail, sendSignInEmail } from './email';
import { signInUrl } from './auth-redirect';
import { createThrottle } from './throttle';

const emailLinks = createThrottle(60_000);

const now = () => new Date().toISOString();
const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

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

/** Which of their businesses a person with more than one is looking at. Only ever one they hold a seat in. */
export const BUSINESS_COOKIE = 'spec_business';

type UserRow = typeof schema.users.$inferSelect;

/** Set on a sign-in identity once it has used a link sent to its address — the only proof it is theirs. */
const PROVEN = 'spec_email_proven';
/** Proving needs the service key. Without it (a fresh local copy) every sign-in is by link anyway. */
const provingEnabled = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Record that this identity has proven its address — called whenever a link sent to it is used. */
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

/** Has the signed-in person confirmed their email? Asked only when they first add a seat. */
export async function emailConfirmed(): Promise<boolean> {
  if (!provingEnabled()) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.[PROVEN] === true;
}

export type NewSignIn = { ok: true; authUserId: string } | { ok: false; reason: 'exists' | 'failed' };

/**
 * Creates the sign-in for a brand-new business's first person. Done BEFORE the business is set up,
 * so an address that already has a sign-in is refused before anything is created. The address is
 * not proven by this, so nothing is ever attached to it by email until it is confirmed.
 */
export async function createSignIn(email: string, password: string): Promise<NewSignIn> {
  if (provingEnabled()) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user) {
      const exists = error?.status === 422 || /already/i.test(error?.message ?? '');
      if (!exists) console.error('[auth] could not create a sign-in', { status: error?.status, code: error?.code });
      return { ok: false, reason: exists ? 'exists' : 'failed' };
    }
    return { ok: true, authUserId: data.user.id };
  }
  // A fresh local copy with no service key: the provider's own sign-up.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) return { ok: false, reason: /already/i.test(error?.message ?? '') ? 'exists' : 'failed' };
  return { ok: true, authUserId: data.user.id };
}

/** Links the one seat just created in a new business to its sign-in. Nothing else. */
export async function linkNewSeat(authUserId: string, tenantId: string, email: string): Promise<void> {
  await db.update(schema.users).set({ authUserId, acceptedAt: now() })
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email), isNull(schema.users.authUserId)));
}

/** Email and password. Sets the session cookie; returns false if they do not match. */
export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password });
  return !error && Boolean(data.user);
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
  // address is PROVEN: a link sent to it was used. Signing up proves nothing about the address;
  // without this, someone who signed up using another person's address would inherit every seat
  // later given to it.
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
 * The signed-in person's seat in the business they chose, or the first one they joined. Uses
 * supabase.auth.getUser() (validated against the Supabase Auth server), not a local cookie alone.
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
 * Emails a one-time link to the address. Two uses only:
 *   'password' — forgot password, or never had one: lands on /account/password to set it.
 *   'confirm'  — confirm the address, asked the first time someone adds a seat.
 * Using either link proves the address is theirs (see /auth/confirm). At most one per minute.
 */
export async function sendEmailLink(email: string, purpose: 'password' | 'confirm', next?: string) {
  const address = email.toLowerCase().trim();
  if (!emailLinks.allow(address)) throw Object.assign(new Error('A link was sent within the last minute.'), { status: 429 });
  const landing = next ?? (purpose === 'password' ? '/account/password' : '/journey');

  if (provingEnabled() && canSendEmail()) {
    const admin = createAdminClient();
    // Only asks for a token — generateLink never sends anything itself.
    let { data, error } = await admin.auth.admin.generateLink({ type: purpose === 'password' ? 'recovery' : 'magiclink', email: address });
    // No sign-in yet (someone invited who has never been in): an invite token creates it.
    if (error) ({ data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: address }));
    if (error) throw error;
    const props = data.properties;
    if (!props?.hashed_token) throw new Error('No token was issued.');
    const type = props.verification_type === 'invite' ? 'invite' : purpose === 'password' ? 'recovery' : 'magiclink';
    await sendSignInEmail({
      to: address, url: signInUrl(appUrl(), props.hashed_token, type, landing),
      subject: purpose === 'password' ? 'Set your SPEC password' : 'Confirm your email for SPEC',
      button: purpose === 'password' ? 'Set my password' : 'Confirm my email',
    });
    return;
  }
  // A fresh local copy: the provider's own email.
  const supabase = await createClient();
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent(landing)}`;
  const { error } = purpose === 'password'
    ? await supabase.auth.resetPasswordForEmail(address, { redirectTo })
    : await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

/** Forgot password, or never had one. */
export const sendSetPasswordLink = (email: string) => sendEmailLink(email, 'password');

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Find a user by email across businesses. */
export async function findUserByEmail(email: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim()));
  return rows[0];
}
