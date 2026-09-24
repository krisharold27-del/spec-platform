'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { provisionTenant, assignPerson } from '@/lib/provision';
import { findUserByEmail, createSignIn, linkNewSeat, signInWithPassword, currentAuthUserId } from '@/lib/auth';
import { checkFormToken, formSecret, honeypotTripped, verifyTurnstile, waitOutMs } from '@/lib/bot-check';
import { currentLook, claimLook } from '@/lib/look';
import { logProblem } from '@/lib/register-data';
import { diagnose } from '@/lib/diagnose';
import { createThrottle } from '@/lib/throttle';
import { consentNow } from '@/lib/legal';

/*
  A script signs up in bulk; a business does not. But the limit here was three per address per
  HOUR, and that is a rule aimed at the wrong person.

  One address is one office. A firm with a shared connection where the owner sets up, then a
  manager tries, then somebody mistypes an email and starts again, hits three before lunch — and is
  then told to come back in an hour, which for a prospect means never. Losing a real customer to
  stop a script that would simply use a different address is the wrong trade.

  Ten in fifteen minutes: still nowhere near worth automating against, and no honest office can
  reach it.

  ── Twenty, because our own test suite reached it ────────────────────────────────────────────────

  CI walks thirteen journeys against one address inside a few minutes, and on 17 September the later
  ones started coming back `error=busy`. Three journeys reported product failures for a product that
  was working perfectly.

  That is evidence, not an inconvenience. A limit our own suite trips is a limit a shared office
  connection will trip — and the last time this number moved it was for exactly that reason, because
  losing a real customer to slow down a script that would simply use a different address is the
  wrong trade. The guards that actually stop bulk creation are the trap field, the signed timestamp
  and Turnstile; this is a speed bump, and a speed bump aimed at customers is worse than none.

  ── Sixty, and the third time this has happened ──────────────────────────────────────────────────

  24 September: twenty-five journeys now, and the setup journey — the twenty-fifth — came back
  `error=busy` on every check it ran. Eleven reported failures against a screen that was working.

  Three times is a pattern rather than three coincidences, and the pattern says this number is set
  against the wrong thing. It has been raised from three to ten, ten to twenty, and now again, each
  time because the suite outgrew it; it has never once been raised because it caught anybody. A
  limit whose only recorded effect is making our own checks lie about the product is not a security
  control, it is a source of false failures — and false failures are expensive in the way that
  matters most, because they teach whoever reads them to stop believing a red line.

  Sixty leaves room for the suite to keep growing without this being revisited a fourth time, and
  is still far below anything worth automating against. The real guards have not moved.
*/
const signupsByAddress = createThrottle(15 * 60_000, 10_000, 60);

/**
 * Sign up: four boxes, then straight in — no email step. The signer becomes the top role; the rest
 * is drawn inside SPEC, where they can see it. Email is confirmed later, the first time they add a seat.
 */
export async function signUp(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim().slice(0, 200);
  const business = String(formData.get('business') ?? '').trim().slice(0, 200);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 320);
  const password = String(formData.get('password') ?? '');

  /*
    GOING BACK WITH WHAT THEY TYPED STILL IN THE BOXES.

    Every bounce here used to return an empty form. Choose a seven-character password and SPEC threw
    away your name, your business AND your email, then asked for all four again — on the first
    screen, before anybody has a reason to put up with it.

    The password is the one thing that never travels. It would end up in the address bar, in the
    browser history and in every log that records a URL, which is a far worse problem than typing
    it a second time.

    Annotated on the variable, not the arrow: that is what lets TypeScript know the branches
    calling it do not continue.
  */
  const back: (error: string) => never = error => {
    const keep = new URLSearchParams({ error });
    if (name) keep.set('name', name);
    if (business) keep.set('business', business);
    if (email) keep.set('email', email);
    const carried = String(formData.get('problem') ?? '').slice(0, 2000);
    if (carried) keep.set('problem', carried);
    redirect(`/signup?${keep}`);
  };

  // A bot fills in the field people never see. Tell it nothing it could learn from.
  if (honeypotTripped(formData.get('website'))) redirect('/signin');

  /*
    Filling the form in quickly is not a reason to refuse anybody — see `waitOutMs`. Somebody with a
    password manager is held for the remainder of the three seconds and never notices; a script is
    slowed to three seconds a go, and still meets the ten-per-fifteen-minutes limit behind it. Only
    a replayed or forged form is turned away.
  */
  const token = String(formData.get('form_token') ?? '');
  const held = waitOutMs(token, formSecret());
  if (held > 0) await new Promise(resolve => setTimeout(resolve, held));
  /*
    Say which one it was.

    Every failure here used to come back as "expired", including `too_fast` — so somebody who typed
    quickly, was held for three seconds and came out a millisecond short was told their form had
    expired. It had not. Telling a customer something untrue on the first screen of the product is
    worse than telling them nothing, and it is the kind of thing nobody ever reports: they try again,
    it works, and they quietly think less of the software.

    `WAIT_MARGIN_MS` should mean `too_fast` never reaches here at all. Its own message exists anyway,
    because "cannot happen" is how the last one got written.
  */
  const verdict = checkFormToken(token, formSecret());
  if (verdict === 'too_fast') back('too_fast');
  if (verdict !== 'ok') back('expired');

  /*
    Agreement, checked on the SERVER.

    The box is `required` in the browser too, which is the right thing for the person — but that is
    a convenience, not a control: it is one line of devtools away from gone. What gets recorded
    against the account has to be true, so the only check that counts is this one.
  */
  if (String(formData.get('consent') ?? '') !== 'yes') back('consent');

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip))) back('check');

  if (!name || !business || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('missing');
  if (password.length < 8) back('short');

  /*
    Already on SPEC: sign in instead. A form never stands in for owning an address.

    Guarded, because this is the first thing sign-up touches and the database can be down. When it
    was not guarded, a database outage threw here, the server action died, and the person was left
    sitting on the form with NO MESSAGE AT ALL — they press the button, nothing happens, and the
    only conclusion available to them is that the product does not work.

    There is already an honest message for this ("that is our end, not yours") and it was simply
    never reached. Same rule as sign-in: never let somebody believe they got it wrong when the fault
    is ours.

    The catch is narrow on purpose — it wraps the lookup and nothing else. redirect() works by
    throwing, so a try that also covered the redirect below would turn "you already have an account"
    into "we are down".
  */
  let existing: Awaited<ReturnType<typeof findUserByEmail>>;
  try {
    existing = await findUserByEmail(email);
  } catch {
    back('down');
  }
  if (existing) redirect('/signin?known=1');
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
  // Guarded for the same reason as the lookup above: a visitor token that cannot be read is not a
  // reason to kill a sign-up. No look-around simply means a fresh business, which is the ordinary case.
  const look = await currentLook().catch(() => null);
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

  // The version they ticked, stamped on the account at the moment they ticked it. See lib/legal.
  await assignPerson(tenantId, gmRoleId, { name, email }, consentNow());
  await linkNewSeat(authUserId, tenantId, email);

  /*
    The problem they typed on the front door, put where the page said it would be.

    Best effort on purpose: a business that has just been created successfully must never be lost
    because the register write failed. They are inside either way, and a missing entry is something
    they can retype in ten seconds — an error on this screen is not.
  */
  const problem = String(formData.get('problem') ?? '').trim().slice(0, 2000);
  if (problem.length >= 8) {
    try {
      await logProblem(tenantId, problem, await diagnose(problem), name);
    } catch {
      // Nothing to do about it here, and nothing worth stopping for.
    }
  }

  if ((await signInWithPassword(email, password)) !== 'ok') redirect('/signin');

  /*
    Into My Page, which is where every day starts from here on.

    This used to land on the org chart, and doing so broke the one promise the front door actually
    makes. The landing page says, in these words: "your page is waiting, with this problem already
    sitting in the middle of it" — and then sent them to a blank chart, carrying a `?welcome=1` that
    nothing anywhere read. The problem they had just typed WAS logged, on My Page, and they were
    taken somewhere else so as not to see it.

    Building the chart is still the first real task and My Page says so. But it says it on the page
    they will open every morning for the next five years, with their own problem sitting above it,
    which is the difference between arriving somewhere and being handed a form.
  */
  redirect(look ? '/my-page?kept=1' : '/my-page?welcome=1');
}
