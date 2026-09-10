'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { findUserByEmail, createSignIn, linkNewSeat, signInWithPassword } from '@/lib/auth';
import { checkFormToken, formSecret, honeypotTripped, verifyTurnstile } from '@/lib/bot-check';
import { createThrottle } from '@/lib/throttle';

// Real businesses sign up one at a time; a script does not. Three per network address per hour.
const signupsByAddress = createThrottle(60 * 60_000, 10_000, 3);

/**
 * Sign up: four boxes, then straight in — no email step. The signer becomes the top role; the rest
 * is drawn inside SPEC, where they can see it. Email is confirmed later, the first time they add a seat.
 */
export async function signUp(formData: FormData) {
  const back = (error: string): never => redirect(`/signup?error=${error}`);

  // A bot fills in the field people never see. Tell it nothing it could learn from.
  if (honeypotTripped(formData.get('website'))) redirect('/signin');
  const timing = checkFormToken(String(formData.get('form_token') ?? ''), formSecret());
  if (timing !== 'ok') back(timing === 'too_fast' ? 'too_fast' : 'expired');

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip))) back('check');

  const name = String(formData.get('name') ?? '').trim().slice(0, 200);
  const business = String(formData.get('business') ?? '').trim().slice(0, 200);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 320);
  const password = String(formData.get('password') ?? '');
  if (!name || !business || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('missing');
  if (password.length < 8) back('short');

  // Already on SPEC: sign in instead. A form never stands in for owning an address.
  if (await findUserByEmail(email)) redirect('/signin?known=1');
  if (!signupsByAddress.allow(ip)) back('busy');

  // The sign-in first, so an address that already has one is refused before anything is created.
  const signIn = await createSignIn(email, password);
  if (!signIn.ok) redirect(signIn.reason === 'exists' ? '/signin?known=1' : '/signup?error=failed');

  const { tenantId, roleIds } = await provisionTenant({ name: business, roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'] });
  await assignPerson(tenantId, roleIds.gm, { name, email });
  await linkNewSeat(signIn.authUserId, tenantId, email);

  if (!(await signInWithPassword(email, password))) redirect('/signin');
  redirect('/org?welcome=1');
}
