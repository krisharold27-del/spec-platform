'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { findUserByEmail, createSignIn, linkNewSeat, signInWithPassword, currentAuthUserId } from '@/lib/auth';
import { checkFormToken, formSecret, honeypotTripped, verifyTurnstile } from '@/lib/bot-check';
import { currentLook, claimLook } from '@/lib/look';
import { createThrottle } from '@/lib/throttle';

// Real businesses sign up one at a time; a script does not. Three per network address per hour.
const signupsByAddress = createThrottle(60 * 60_000, 10_000, 3);

/**
 * Sign up: four boxes, then straight in — no email step. The signer becomes the top role; the rest
 * is drawn inside SPEC, where they can see it. Email is confirmed later, the first time they add a seat.
 */
export async function signUp(formData: FormData) {
  // Annotated on the variable, not the arrow: that is what lets TypeScript know the branches
  // calling it do not continue.
  const back: (error: string) => never = error => redirect(`/signup?error=${error}`);

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

  /*
    RESUMING A SIGN-UP THAT STOPPED HALF WAY.

    The sign-in is deliberately created before the business, which leaves a gap: if anything after
    it fails, the person owns an account attached to nothing. Signing in then works, every page
    finds no seat and sends them to /signin, and /signin shows the form again — an unbreakable loop
    with no message, at the exact moment somebody is deciding whether to trust this product.

    We already know there is no seat for this address, because findUserByEmail said so above. So an
    account that exists here is that half-finished state, and the right answer is to finish it —
    but only for somebody who can prove the password, since an address must never be claimable by
    filling in a form.
  */
  let authUserId: string;
  if (signIn.ok) {
    authUserId = signIn.authUserId;
  } else if (signIn.reason === 'exists') {
    if ((await signInWithPassword(email, password)) !== 'ok') redirect('/signin?known=1');
    const resumed = await currentAuthUserId();
    if (!resumed) redirect('/signin?known=1');
    authUserId = resumed;
  } else {
    // Our end is down, not theirs. Say so, and do not make them wonder what they typed wrong.
    back(signIn.reason === 'unavailable' ? 'down' : 'failed');
  }

  /*
    KEEPING WHAT THEY WERE LOOKING AT.

    Somebody who walked through a look-around and decided they liked it should not be started over
    from nothing — the whole point of viewing the house is that it is the house you then buy. Their
    tenant already exists, with the chart and the marked month they have just been reading, so it is
    renamed to their business and handed to them. `claimLook` also clears the visitor token, which
    is what stops that browser, or any other, from reaching it again without a seat.
  */
  const look = await currentLook();
  let tenantId: string;
  let gmRoleId: string;

  if (look) {
    await claimLook(look.tenantId, business);
    tenantId = look.tenantId;
    const [gm] = await db.select({ id: schema.roles.id }).from(schema.roles)
      .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.level, 'gm')));
    if (!gm) back('failed');
    gmRoleId = gm.id;
  } else {
    const fresh = await provisionTenant({ name: business, roleTemplates: ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'] });
    tenantId = fresh.tenantId;
    gmRoleId = fresh.roleIds.gm;
  }

  await assignPerson(tenantId, gmRoleId, { name, email });
  await linkNewSeat(authUserId, tenantId, email);

  if ((await signInWithPassword(email, password)) !== 'ok') redirect('/signin');
  redirect(look ? '/org?kept=1' : '/org?welcome=1');
}
