'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { isSetupToken } from '@/lib/onboarding';

/**
 * The three things a person may do to their OWN record, and the fence around them.
 *
 * ── Nobody is signed in here ─────────────────────────────────────────────────────────────────────
 *
 * The same trade-off as the customer page, for the same reason: a sparkie will not make an account
 * in order to tell his employer when his licence runs out, and if the first thing SPEC asks of
 * somebody is a password then the HR admin ends up typing thirty-eight sets of certificates off
 * photocopies anyway — which is the exact job this page exists to remove.
 *
 * So the token IS the authority, and that means one rule holds everything up: **every action finds
 * the person BY TOKEN and works only on what it finds.** A staff id from the form would let anybody
 * holding one link write to any person in any business. That is the whole risk of a page with no
 * sign-in, available in a single mistake, so it is not a convention here — there is no code path
 * that reads an id from the page.
 *
 * ── What it deliberately cannot do ───────────────────────────────────────────────────────────────
 *
 * It cannot see anybody else, see what anybody is paid, change what somebody is (team, leadership,
 * subcontractor), or mark its own induction complete. Those belong to the business. Somebody who
 * could tick their own induction could put themselves on a site they are not inducted for, and the
 * link is a text message — it can be forwarded, it can be read over a shoulder. It buys only the
 * ability to fill in your own details.
 */

const personFor = async (token: unknown) => {
  const t = String(token ?? '');
  if (!isSetupToken(t)) return null;
  const [person] = await db.select().from(schema.staff).where(eq(schema.staff.setupToken, t));
  return person ?? null;
};

const stamp = () => new Date().toISOString();
const txt = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);

const back = (token: string) => {
  revalidatePath(`/join/${token}`);
  revalidatePath('/people');
};

/** Their own name, phone and the email they will sign in with. */
export async function saveMyDetails(form: FormData) {
  const person = await personFor(form.get('token'));
  if (!person) return;

  const name = txt(form, 'name', 200);
  const phone = txt(form, 'phone', 40);
  const email = txt(form, 'email', 320).toLowerCase();

  /*
    A personal address is warned about on the office screen and warned about here, and saved in both
    places. Kris's rule is that a company address is what a business SHOULD do, not something SPEC
    refuses to proceed without — a new starter whose company mailbox is not set up yet still has to
    be able to finish this, and a person stopped by a rule they cannot act on just stops.
  */
  await db.update(schema.staff)
    .set({
      ...(name ? { name } : {}),
      phone: phone || person.phone,
      email: email || person.email,
    })
    .where(eq(schema.staff.id, person.id));
  back(String(form.get('token')));
}

/**
 * A licence or ticket, with the date it runs out.
 *
 * The expiry is the point. A licence with no date on it cannot stop somebody being booked the day
 * after it lapses, which is the one thing the whole compliance side of SPEC is for.
 */
export async function addMyLicence(form: FormData) {
  const person = await personFor(form.get('token'));
  if (!person) return;

  const what = txt(form, 'what', 120);
  if (!what) return;

  await db.insert(schema.obligations).values({
    id: randomUUID(),
    tenantId: person.tenantId,
    what,
    staffId: person.id,
    userId: person.userId ?? null,
    roleId: null,
    expiresAt: txt(form, 'expiresAt', 10) || null,
    evidence: null,
    createdAt: stamp(),
  });
  back(String(form.get('token')));
}

/** Remove one they added by mistake. Only ever their own, found through their own record. */
export async function removeMyLicence(form: FormData) {
  const person = await personFor(form.get('token'));
  if (!person) return;

  const id = txt(form, 'id', 64);
  if (!id) return;

  /*
    Scoped to this person as well as to the row. Matching on the id alone would let a forwarded link
    delete any obligation in any business that somebody could name.
  */
  const [row] = await db.select({ id: schema.obligations.id, staffId: schema.obligations.staffId })
    .from(schema.obligations).where(eq(schema.obligations.id, id));
  if (!row || row.staffId !== person.id) return;

  await db.delete(schema.obligations).where(eq(schema.obligations.id, id));
  back(String(form.get('token')));
}

/**
 * Say they have read the induction.
 *
 * NOT the same thing as being inducted, and the difference matters enough to be two fields. The
 * business marks somebody inducted; this records that the person has read it and says so. If the
 * person could complete their own induction, the check that stops an uninducted body walking onto
 * a site would be a check somebody can grant themselves.
 */
export async function readTheInduction(form: FormData) {
  const person = await personFor(form.get('token'));
  if (!person) return;
  await db.update(schema.staff)
    .set({ inductionReadAt: stamp() })
    .where(eq(schema.staff.id, person.id));
  back(String(form.get('token')));
}
