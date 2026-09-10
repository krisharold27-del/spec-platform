'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { sendMagicLink, findUserByEmail, signInNewBusiness } from '@/lib/auth';
import { checkFormToken, formSecret, honeypotTripped, verifyTurnstile } from '@/lib/bot-check';
import { createThrottle } from '@/lib/throttle';

// Real businesses sign up one at a time; a script does not. Three per network address per hour.
const signupsByAddress = createThrottle(60 * 60_000, 10_000, 3);

/**
 * Sign up: three fields, then straight in — no email step for a brand-new business. The signer
 * becomes the top role; the rest is drawn inside SPEC, where they can see it.
 */
export async function signUp(formData: FormData) {
  const back = (error: string): never => redirect(`/signup?error=${error}`);

  // A bot fills in the field people never see. Tell it nothing it could learn from.
  if (honeypotTripped(formData.get('website'))) redirect('/signin?sent=1');
  const timing = checkFormToken(String(formData.get('form_token') ?? ''), formSecret());
  if (timing !== 'ok') back(timing === 'too_fast' ? 'too_fast' : 'expired');

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip))) back('check');

  const name = String(formData.get('name') ?? '').trim().slice(0, 200);
  const business = String(formData.get('business') ?? '').trim().slice(0, 200);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 320);
  if (!name || !business || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('missing');

  // Already on SPEC: never let a form stand in for owning the address. Send a sign-in link to it.
  if (await findUserByEmail(email)) {
    let outcome: 'known' | 'ratelimited' | 'failed' = 'known';
    try { await sendMagicLink(email, '/journey'); } catch (err) {
      outcome = (err as { status?: number })?.status === 429 ? 'ratelimited' : 'failed';
    }
    redirect(outcome === 'known' ? '/signin?sent=1&known=1' : `/signin?error=${outcome}`);
  }
  if (!signupsByAddress.allow(ip)) back('busy');

  const { tenantId, roleIds } = await provisionTenant({ name: business, roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'] });
  await assignPerson(tenantId, roleIds.gm, { name, email });

  // Straight in. If that is not possible here (no service key — a fresh local copy), fall back to a link.
  if (await signInNewBusiness(email, tenantId)) redirect('/org?welcome=1');
  try {
    await sendMagicLink(email, '/org?welcome=1');
  } catch (err) {
    console.error('[signup] sign-in email failed after provisioning', (err as Error).message);
    redirect('/signin?error=signup_email');
  }
  redirect('/signin?sent=1');
}
