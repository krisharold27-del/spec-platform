'use server';
import { redirect } from 'next/navigation';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { sendMagicLink, findUserByEmail } from '@/lib/auth';

/** Sign up: the signer becomes the top role. Only the GM role is created — the rest is the journey. */
export async function signUp(formData: FormData) {
  const business = String(formData.get('business') ?? '').trim();
  const sector = String(formData.get('sector') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const topRole = String(formData.get('topRole') ?? 'gm');
  if (!business || !name || !email) throw new Error('Business, your name and email are required.');
  if (await findUserByEmail(email)) redirect('/signin?exists=1');

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
    for (const p of ['safety', 'people', 'earnings', 'compliance']) {
      const v = formData.get(`q_${p}`);
      if (v) await db.insert(schema.diagnostics).values({ id: randomUUID(), tenantId, sectionId: 'four_questions', questionId: p, answer: String(v), answeredBy: email, answeredAt: new Date().toISOString() });
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
