'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { SETTABLE_PLANS, type SettablePlan } from '@/lib/plan';

/**
 * Put a business on a free beta, or take it off one.
 *
 * ── Why this is a control and not a database edit ────────────────────────────────────────────────
 *
 * "Can we turn the payment off for JBI so I can use it as a beta testing ground" is a question that
 * will be asked again for every beta business after them, and the answer should not be "ask whoever
 * has database access". It is a decision about a customer, so it belongs on a screen, with a name
 * and a date against it.
 *
 * ── Why it is on /admin and nowhere else ─────────────────────────────────────────────────────────
 *
 * This decides whether a business is charged. It is gated on the same allowlist as the cockpit —
 * an address in ADMIN_EMAILS, checked on the server — because it is SPEC Business Solutions' own
 * commercial decision and nobody else's, least of all the customer's.
 */
export async function setPlan(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/signin');

  const tenantId = String(form.get('tenantId') ?? '');
  const plan = String(form.get('plan') ?? '');

  // Only the values the product knows about. `plan` decides whether somebody is billed, so an
  // unrecognised string reaching the column would be a business in a state nothing can price.
  if (!tenantId || !SETTABLE_PLANS.includes(plan as SettablePlan)) redirect('/admin');

  await db.update(schema.tenants).set({ plan }).where(eq(schema.tenants.id, tenantId));

  revalidatePath('/admin');
  // The account page shows what it costs, so it must not serve a stale figure.
  revalidatePath('/settings');
  redirect('/admin?changed=1');
}
