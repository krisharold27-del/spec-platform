'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { isSetupToken } from '@/lib/onboarding';
import { isTheirs, mayBook, type Check } from '@/lib/subbies';
import { looksLikeAbn } from '@/lib/ato';

/**
 * What a subcontractor may record about themselves, and the fence around it.
 *
 * ── Nobody is signed in here ─────────────────────────────────────────────────────────────────────
 *
 * The same trade-off `/join` makes for employees, for the same reason: a subbie will not make an
 * account in order to tell a business when their public liability runs out, and if the first thing
 * SPEC asks for is a password then the office goes back to typing four certificates per subbie off
 * emailed PDFs — which is the job this page exists to remove.
 *
 * So the token IS the authority, and one rule holds everything up: **every action finds the subbie
 * BY TOKEN and works only on what it finds.** A subbie id read from the form would let anybody
 * holding one link write to any subcontractor in any business. That is the whole risk of a page
 * with no sign-in, available in a single mistake, so there is no code path here that reads an id
 * from the page.
 *
 * ── What it deliberately cannot do ───────────────────────────────────────────────────────────────
 *
 * Four of the six checks, and only those four — see `THEIRS` in lib/subbies. It cannot tick the
 * subcontract, because that is the business's document and a subbie who could tick it could declare
 * terms nobody at the business had seen; and it cannot tick its own induction, for exactly the
 * reason an employee cannot tick theirs: the link arrives as a message, messages get forwarded, and
 * inducting yourself is how an uninducted body walks onto a site.
 *
 * It also cannot see the business's prices, anybody else's record, or what it is being charged out
 * at. It buys the ability to hand over your own paperwork and nothing else.
 */

const subbieFor = async (token: unknown) => {
  const t = String(token ?? '');
  if (!isSetupToken(t)) return null;
  const [row] = await db.select().from(schema.subcontractors)
    .where(eq(schema.subcontractors.setupToken, t));
  return row ?? null;
};

const stamp = () => new Date().toISOString();
const txt = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);

const back = (token: string) => {
  revalidatePath(`/subbie/${token}`);
  revalidatePath('/people');
};

/** Their own contact details. Never the business name — that is what the business calls them. */
export async function saveMyContact(form: FormData) {
  const subbie = await subbieFor(form.get('token'));
  if (!subbie) return;

  const contact = txt(form, 'contact', 120);
  const mobile = txt(form, 'mobile', 40);
  const email = txt(form, 'email', 320).toLowerCase();

  await db.update(schema.subcontractors)
    .set({
      /* Only what they actually typed. A blank box is somebody skipping a field, not clearing one. */
      ...(contact ? { contact } : {}),
      ...(mobile ? { mobile } : {}),
      ...(email ? { email } : {}),
    })
    .where(eq(schema.subcontractors.id, subbie.id));

  back(String(form.get('token') ?? ''));
}

/**
 * One of the four checks that are theirs, with the date off the certificate in their hand.
 *
 * The date is the whole point of the row. A policy recorded as current in March is not current in
 * October, and `stateOf` in lib/subbies reads the DATE rather than whatever anybody typed — so a
 * check handed in without one is recorded and still does not make them bookable.
 */
export async function recordMyCheck(form: FormData) {
  const token = String(form.get('token') ?? '');
  const subbie = await subbieFor(token);
  if (!subbie) return;

  const kind = txt(form, 'kind', 32);
  /*
    The fence, enforced here rather than by the page not drawing a button. A form is a thing anybody
    can post to, and a rule that lives only in the markup is a rule that holds until somebody opens
    the console.
  */
  if (!isTheirs(kind)) return;

  const expiresAt = txt(form, 'expiresAt', 10) || null;
  const note = txt(form, 'note', 200) || null;

  /*
    An ABN that fails the published checksum is kept and NOT counted.

    `looksLikeAbn` is arithmetic on the number itself, not a call to the register — see lib/ato. So
    it can say "that is not a valid ABN" without ever being wrong about a valid one, and a digit
    typed wrong on a phone is caught here rather than eighteen months later by the ATO. It is still
    saved, because a subbie who is refused outright simply stops.
  */
  const badAbn = kind === 'abn' && Boolean(note) && !looksLikeAbn(note!);

  const [existing] = await db.select({ id: schema.subbieChecks.id })
    .from(schema.subbieChecks)
    .where(and(
      eq(schema.subbieChecks.tenantId, subbie.tenantId),
      eq(schema.subbieChecks.subbieId, subbie.id),
      eq(schema.subbieChecks.kind, kind),
    ));

  const state = badAbn ? 'missing' : 'current';
  if (existing) {
    await db.update(schema.subbieChecks)
      .set({ expiresAt, state, note, updatedAt: stamp() })
      .where(eq(schema.subbieChecks.id, existing.id));
  } else {
    await db.insert(schema.subbieChecks).values({
      id: randomUUID(),
      tenantId: subbie.tenantId,
      subbieId: subbie.id,
      kind,
      expiresAt,
      state,
      note,
      updatedAt: stamp(),
    });
  }

  /*
    The status is worked out from the checks, never set — the same rule `recordSubbieCheck` follows,
    so the office screen and this one can never disagree about whether somebody is set up.
  */
  const rows = await db.select({
    kind: schema.subbieChecks.kind,
    expiresAt: schema.subbieChecks.expiresAt,
    state: schema.subbieChecks.state,
  }).from(schema.subbieChecks)
    .where(and(
      eq(schema.subbieChecks.tenantId, subbie.tenantId),
      eq(schema.subbieChecks.subbieId, subbie.id),
    ));

  const today = new Date().toISOString().slice(0, 10);
  await db.update(schema.subcontractors)
    .set({ status: mayBook(rows as Check[], today).ok ? 'active' : 'onboarding' })
    .where(eq(schema.subcontractors.id, subbie.id));

  back(token);
}
