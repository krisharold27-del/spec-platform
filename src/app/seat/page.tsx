import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';
import { PasswordField } from '@/components/password-field';
import { SubmitButton } from '@/components/submit-button';
import { checkSeatToken, SEAT_REFUSAL_MESSAGE } from '@/lib/seat';
import { takeSeat } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Taking a seat somebody gave you.
 *
 * The other side of the invitation email. A person arriving here has been added to a business by
 * somebody else, has never seen SPEC, and is one refusal away from deciding it does not work — so
 * every way this can fail says what happened in their own words and offers the next step. None of
 * them says "invalid token".
 *
 * They choose a password here rather than being sent a second email. The invitation was the one
 * email; making them wait for another is how an invited person quietly never arrives.
 */
export default async function Seat({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await searchParams).t ?? '';

  const [row] = token
    ? await db.select().from(schema.users).where(eq(schema.users.seatToken, token))
    : [];

  const verdict = checkSeatToken(row ?? null, token);

  if (verdict !== true) {
    return (
      <main className="mx-auto max-w-sm px-6 py-20">
        <SpecMark size={40} />
        <h1 className="mt-4 font-serif text-2xl text-ink">That link did not work</h1>
        <p className="mt-3 text-base text-ink-light">{SEAT_REFUSAL_MESSAGE[verdict]}</p>
        <Link href="/signin" className="btn-primary mt-6 inline-block">Go to sign in</Link>
        <Footer />
      </main>
    );
  }

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, row.tenantId));

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <SpecMark size={40} />
      <h1 className="mt-4 font-serif text-2xl text-ink">Take your seat</h1>
      <p className="mt-2 text-base text-ink-light">
        {row.name}, you have been given a seat at <b className="text-ink">{tenant?.name ?? 'your business'}</b>.
        Choose a password and you are in.
      </p>

      <form action={takeSeat} className="mt-6 space-y-3">
        <input type="hidden" name="t" value={token} />
        {/* Bound to that address: the email is shown, not asked for, so a forwarded invitation
            cannot become somebody else's seat. */}
        <div className="rounded border border-ink/10 bg-cream px-3 py-2.5 text-sm text-ink-light">
          {row.email}
        </div>
        <PasswordField name="password" autoComplete="new-password" placeholder="Choose a password (8+ characters)" minLength={8} />
        <SubmitButton className="btn-primary w-full" pending="Taking your seat…">Take my seat</SubmitButton>
      </form>

      <p className="mt-4 text-xs text-ink-light">
        Nobody is emailed and nothing is billed by you doing this — the seat was already yours.
      </p>
      <Footer />
    </main>
  );
}
