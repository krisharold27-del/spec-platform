'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { sendMagicLink, findUserByEmail } from '@/lib/auth';
import { checkFormToken, formSecret, honeypotTripped, verifyTurnstile } from '@/lib/bot-check';
import { createThrottle } from '@/lib/throttle';

// Real businesses sign up one at a time; a script does not. Three per network address per hour.
const signupsByAddress = createThrottle(60 * 60_000, 10_000, 3);

/** Sign up: the signer becomes the top role. Only the GM role is created — the rest is the journey. */
export async function signUp(formData: FormData) {
  // Anything sent back to the form keeps the four answers, so nobody answers twice.
  const answers = ['safety', 'people', 'earnings', 'compliance']
    .map(p => [`q_${p}`, String(formData.get(`q_${p}`) ?? '')] as [string, string])
    .filter(([, v]) => v);
  const back = (error: string): never => redirect(`/signup?${new URLSearchParams([...answers, ['error', error]])}`);

  // A bot fills in the field people never see. Tell it nothing it could learn from.
  if (honeypotTripped(formData.get('website'))) redirect('/signin?sent=1');
  const timing = checkFormToken(String(formData.get('form_token') ?? ''), formSecret());
  if (timing !== 'ok') back(timing === 'too_fast' ? 'too_fast' : 'expired');

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip))) back('check');

  const business = String(formData.get('business') ?? '').trim().slice(0, 200);
  const sector = String(formData.get('sector') ?? '').trim().slice(0, 200);
  const name = String(formData.get('name') ?? '').trim().slice(0, 200);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 320);
  const topRole = String(formData.get('topRole') ?? 'gm');
  if (!business || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('missing');
  // Already on SPEC: nothing to set up. Send the sign-in link now rather than making them type the
  // address again on another form. Only the owner of the inbox can use the link.
  if (await findUserByEmail(email)) {
    let outcome: 'known' | 'ratelimited' | 'failed' = 'known';
    try {
      await sendMagicLink(email, '/journey');
    } catch (err) {
      outcome = (err as { status?: number })?.status === 429 ? 'ratelimited' : 'failed';
    }
    redirect(outcome === 'known' ? '/signin?sent=1&known=1' : `/signin?error=${outcome}`);
  }
  if (!signupsByAddress.allow(ip)) back('busy');

  const { tenantId, roleIds } = await provisionTenant({ name: business, sector, roleTemplates: ['gm'] });
  if (topRole !== 'gm') {
    const { db, schema } = await import('@/db');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.roles).set({ title: topRole === 'owner' ? 'Owner / Managing Director' : 'General Manager' }).where(eq(schema.roles.id, roleIds.gm));
  }
  await assignPerson(tenantId, roleIds.gm, { name, email });
  // The four questions are the first diagnostic on record.
  {
    const { db, schema } = await import('@/db');
    const { randomUUID } = await import('node:crypto');
    for (const [key, v] of answers) {
      if (v !== 'yes' && v !== 'no') continue;
      await db.insert(schema.diagnostics).values({ id: randomUUID(), tenantId, sectionId: 'four_questions', questionId: key.slice(2), answer: v, answeredBy: email, answeredAt: new Date().toISOString() });
    }
  }
  // The business exists from here, so a failed email must not become an error page: signing up
  // again would only say "that email already has a role". Send them to sign in instead.
  try {
    await sendMagicLink(email, '/setup/focus');
  } catch (err) {
    const { status, code, message } = (err ?? {}) as { status?: number; code?: string; message?: string };
    console.error('[signup] sign-in email failed after provisioning', { status, code, message });
    redirect('/signin?error=signup_email');
  }
  redirect('/signin?sent=1');
}
