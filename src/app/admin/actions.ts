'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { SETTABLE_PLANS, type SettablePlan } from '@/lib/plan';
import { PACKAGE_KEYS, type Package } from '@/lib/pricing';

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

/**
 * Put a business on one of the four packages.
 *
 * ── Why the administrator and never the customer ─────────────────────────────────────────────────
 *
 * Kris, 16 September: *"these are controlled by the administrator"*.
 *
 * Two of the four are a seat price and could safely be self-serve. The other two are a share of one
 * person's week — four hours a month, or a full day every week plus chairing the board meeting — and
 * a business that clicks its way into one of those has bought time that may not exist. There are
 * only so many Tuesdays, and a checkout button cannot know how many are left.
 *
 * So the last two are always a conversation first and this screen second. The gate is the same
 * allowlist as the cockpit, checked on the server.
 */
export async function setPackage(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/signin');

  const tenantId = String(form.get('tenantId') ?? '');
  const pkg = String(form.get('package') ?? '');

  // Only the four the product knows. An unrecognised value reaching this column would be a business
  // in a state nothing can price, which is the same fault `plan` is guarded against above.
  if (!tenantId || !PACKAGE_KEYS.includes(pkg as Package)) redirect('/admin');

  await db.update(schema.tenants).set({ package: pkg }).where(eq(schema.tenants.id, tenantId));

  revalidatePath('/admin');
  // The account page prints what it costs, so it must not serve a stale figure.
  revalidatePath('/settings');
  redirect('/admin?changed=1');
}

/**
 * Delete a business, permanently.
 *
 * Kris, 16 September: "yes build a safe way to clear the test businesses". The alternative was
 * somebody typing DELETE into a console at the same keyboard that holds the only copy of every real
 * customer, so the safety is the feature — see lib/delete-business for the guards and for the
 * orphan check that rolls the whole thing back rather than leaving half a business behind.
 *
 * Here it only does the two things a server action must never delegate: prove who is asking, and
 * refuse to act on anything the form claims about itself. The name is compared against the database,
 * never against a hidden field.
 */
export async function removeBusiness(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/signin');

  const tenantId = String(form.get('tenantId') ?? '');
  const typedName = String(form.get('confirmName') ?? '');
  if (!tenantId) redirect('/admin');

  const { deleteBusiness } = await import('@/lib/delete-business');
  const outcome = await deleteBusiness(tenantId, typedName, user.tenantId);

  // Said out loud in the server log either way: this is the one action with no undo.
  console.warn('[admin] delete business', tenantId, 'by', user.email, '→',
    outcome.ok ? `DELETED ${outcome.deleted.name}` : `refused: ${outcome.refusal}`);

  revalidatePath('/admin');
  redirect(outcome.ok ? '/admin?deleted=1' : `/admin?refused=${outcome.refusal}`);
}

/**
 * Take the Stripe marks off a business, so the ordinary delete can then be run on it.
 *
 * Kris, 17 September: *"yes build the admin control to clear hall contracting"* — a business that
 * went through Stripe in TEST mode, which `deleteBusiness` refuses on sight and correctly so. It sat
 * on the live admin list with no way off it.
 *
 * This is deliberately NOT part of the delete. It is a smaller, separate act with its own typed
 * confirmation, after which every one of the delete's guards still applies. Two decisions, not one
 * button that quietly does both.
 *
 * The judgement about whether this is real money is Stripe's, not the administrator's — see
 * lib/detach-stripe. Same allowlist as everything else here, checked on the server, and the name is
 * compared against the database rather than against a hidden field.
 */
export async function detachStripe(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/signin');

  const tenantId = String(form.get('tenantId') ?? '');
  const typedName = String(form.get('confirmName') ?? '');
  if (!tenantId) redirect('/admin');

  const { detachFromStripe } = await import('@/lib/detach-stripe');
  const outcome = await detachFromStripe(tenantId, typedName, user.tenantId);

  // Said out loud either way. This is the act that makes a refusal-proof business deletable.
  console.warn('[admin] detach from Stripe', tenantId, 'by', user.email, '→',
    outcome.ok
      ? `DETACHED ${outcome.name} (mode=${outcome.facts.mode}, found=${outcome.facts.found})`
      : `refused: ${outcome.refusal}`);

  revalidatePath('/admin');
  revalidatePath('/settings');
  redirect(outcome.ok ? '/admin?detached=1' : `/admin?nodetach=${outcome.refusal}`);
}
