'use server';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { createSignIn, signInWithPassword } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { checkSeatToken } from '@/lib/seat';

/**
 * Taking a seat.
 *
 * The token is checked again here, not trusted from the page that rendered the form. The page is a
 * GET anybody can replay; this is the write, so this is where the rule has to hold.
 *
 * The seat is marked taken in the same breath as the sign-in being created — that is what makes
 * "single use" true rather than merely intended.
 */
export async function takeSeat(formData: FormData) {
  const token = String(formData.get('t') ?? '');
  const password = String(formData.get('password') ?? '');
  const back = (why: string): never => redirect(`/seat?t=${encodeURIComponent(token)}&error=${why}`);

  if (password.length < 8) back('short');

  const [row] = token
    ? await db.select().from(schema.users).where(eq(schema.users.seatToken, token))
    : [];
  if (checkSeatToken(row ?? null, token) !== true) redirect('/seat');

  // The address comes from the seat, never from the form. A forwarded invitation cannot become
  // somebody else's seat, which is the "bound to that address" half of the rule.
  const email = row.email;

  const made = await createSignIn(email, password);
  if (!made.ok) {
    // Their sign-in already exists — they were invited to a second business, or came back here
    // after taking it. Their existing password is the one that works.
    if (made.reason === 'exists') {
      if ((await signInWithPassword(email, password)) !== 'ok') redirect('/signin?known=1');
    } else {
      back(made.reason === 'unavailable' ? 'down' : 'failed');
    }
  }

  const authUserId = made.ok ? made.authUserId : null;

  /*
    Take the seat in one write, guarded on it not already being taken — so two clicks on the same
    link cannot both succeed, and single use is enforced by the database rather than by the order
    the code happens to run in.

    The token is KEPT, and acceptedAt is what spends it.

    Nulling it looked tidier and was wrong. Clicking your own invitation twice is the ordinary case
    — the back button, a second device, an email opened again later — and with the token gone the
    row cannot be found, so the person who just took their seat is told their link "does not match
    an invitation" and to ask for another. Keeping it lets them be told the true thing: it is
    already taken, so just sign in.

    The token is inert either way: checkSeatToken refuses anything with acceptedAt set.
  */
  const spent = await db.update(schema.users)
    .set({
      acceptedAt: new Date().toISOString(),
      ...(authUserId ? { authUserId } : {}),
    })
    .where(and(eq(schema.users.id, row.id), eq(schema.users.seatToken, token), isNull(schema.users.acceptedAt)))
    .returning({ id: schema.users.id });

  if (spent.length === 0) redirect('/signin?known=1');

  if ((await signInWithPassword(email, password)) !== 'ok') redirect('/signin');
  redirect(DEFAULT_AFTER_SIGN_IN);
}
