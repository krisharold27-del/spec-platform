import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';
import { PasswordField } from '@/components/password-field';
import { CONSENT_LABEL, CONSENT_REQUIRED } from '@/lib/legal';
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
/*
  What a bounce says.

  This page had NO error display at all: `takeSeat` redirected back with `?error=short` and the page
  showed the form again, unchanged, with no explanation. Somebody invited into a business chose a
  six-character password, pressed the button, and watched the screen do nothing — on the one screen
  where they have never seen SPEC before and are one refusal away from deciding it does not work.

  Found while adding the agreement checkbox, whose refusal would have been silent in exactly the
  same way.
*/
const SEAT_ERRORS: Record<string, string> = {
  short: 'Choose a password of at least 8 characters.',
  consent: CONSENT_REQUIRED,
  failed: 'That did not work. Try once more.',
  down: 'Taking your seat is temporarily unavailable — that is our end, not yours. Try again in a few minutes.',
};

export default async function Seat({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const token = sp.t ?? '';
  const error = sp.error ? SEAT_ERRORS[sp.error] ?? SEAT_ERRORS.failed : null;

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

      {error && <p className="mt-4 text-sm text-rust-dark">{error}</p>}

      <form action={takeSeat} className="mt-6 space-y-3">
        <input type="hidden" name="t" value={token} />
        {/* Bound to that address: the email is shown, not asked for, so a forwarded invitation
            cannot become somebody else's seat. */}
        <div className="rounded border border-ink/10 bg-cream px-3 py-2.5 text-sm text-ink-light">
          {row.email}
        </div>
        <PasswordField name="password" autoComplete="new-password" placeholder="Choose a password (8+ characters)" minLength={8} />
        {/*
          Taking a seat creates an account and starts storing this person's work, so agreement is
          asked here for the same reason it is asked at sign-up. Their manager agreeing on their
          behalf is not agreement — the person whose data it is has to be the one who ticks it.
        */}
        <label className="flex items-start gap-2.5 pt-1 text-left text-sm text-ink-light">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            required
            aria-label={CONSENT_LABEL}
            className="mt-0.5 h-4 w-4 shrink-0 accent-rust"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener" className="underline hover:text-rust">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener" className="underline hover:text-rust">Privacy Policy</a>
          </span>
        </label>
        <SubmitButton className="btn-primary w-full" pending="Taking your seat…">Take my seat</SubmitButton>
      </form>

      <p className="mt-4 text-xs text-ink-light">
        Nobody is emailed and nothing is billed by you doing this — the seat was already yours.
      </p>
      <Footer />
    </main>
  );
}
