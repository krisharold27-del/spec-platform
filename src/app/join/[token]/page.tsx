import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { isSetupToken, isPersonalEmail, WHY_COMPANY_EMAIL, PHONE_STEPS } from '@/lib/onboarding';
import { saveMyDetails, addMyLicence, removeMyLicence, readTheInduction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your details',
  /* Somebody's licences should never turn up in a search result. */
  robots: { index: false, follow: false },
};

/**
 * The page a person opens on their own phone — the other half of "Set everybody up".
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September, setting JBI up: the office does the structure and the money, and the person's
 * half gets done *"on their phone"*. The reason is not convenience. **The certificate is in their
 * wallet.** An HR admin working down thirty-eight people is typing licence numbers off photocopies
 * that are out of date, and getting the expiry dates wrong — which is the one field that has to be
 * right, because it is what stops somebody being booked the day after their ticket lapses.
 *
 * The office screen has issued these links and shown their progress since the 24th. Until now the
 * link went nowhere, which made the whole feature a promise.
 *
 * ── What it is like to use ───────────────────────────────────────────────────────────────────────
 *
 * Three things, in order, on a phone, standing in a driveway. No app, no password, no account. Big
 * targets, one column, nothing that needs two hands. It says who the business is at the top so that
 * a link arriving by text is obviously not a scam, and it says what it is for in one line.
 *
 * ── What it deliberately does not do ─────────────────────────────────────────────────────────────
 *
 * It shows this person and nothing else — no colleague, no pay, no job. And it cannot mark its own
 * induction complete: that is the business's mark, and a link that arrives as a text message is a
 * link that can be forwarded. See `actions.ts`.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSetupToken(token)) notFound();

  const [person] = await db.select().from(schema.staff).where(eq(schema.staff.setupToken, token));
  if (!person) notFound();

  const [business] = await db.select({ name: schema.tenants.name })
    .from(schema.tenants).where(eq(schema.tenants.id, person.tenantId));

  const licences = await db.select({
    id: schema.obligations.id,
    what: schema.obligations.what,
    expiresAt: schema.obligations.expiresAt,
  }).from(schema.obligations).where(eq(schema.obligations.staffId, person.id));

  const hasEmail = Boolean(person.email?.trim());
  const personal = hasEmail && isPersonalEmail(person.email!);
  const done = [hasEmail, licences.length > 0, Boolean(person.inductionReadAt)];
  const doneCount = done.filter(Boolean).length;

  return (
    <main className="mx-auto w-full max-w-[540px] px-4 pb-24 pt-8">
      <header className="grid gap-2">
        {/*
          The business's name exactly as they write it — not upper-cased, not styled.

          This line is doing security work rather than decoration. A link arriving as a text message
          from a number somebody does not have saved looks exactly like a scam, and the one thing
          that makes it not look like one is seeing their employer's name spelled the way their
          employer spells it. "JBI ELECTRICAL" is not how JBI writes it, and a name in the wrong
          case is a name that reads as a form letter.
        */}
        <p className="text-[14px] font-medium tracking-[0.01em] text-ink-light">{business?.name ?? 'Your business'}</p>
        <h1 className="font-serif text-[30px] leading-[1.15] text-ink">
          Hello {person.name.trim().split(/\s+/)[0] || 'there'}
        </h1>
        <p className="text-[15px] leading-[24px] text-ink/80">
          Three things, and then you are set up. It takes about two minutes, and you only have to do
          it once.
        </p>
        {/*
          Progress, said as a count rather than a bar. Somebody halfway down a driveway wants to
          know how much is left, and "1 of 3" answers that without a graphic that needs explaining.
        */}
        <p className="mt-1 text-[13px] text-ink-light">
          {doneCount === 3 ? 'All done — thank you. You can close this.' : `${doneCount} of 3 done`}
        </p>
      </header>

      {/* ── 1. Your details ───────────────────────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-[20px] bg-surface p-5">
        <h2 className="font-serif text-[20px] text-ink">{PHONE_STEPS[0].label}</h2>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">{PHONE_STEPS[0].why}</p>

        <form action={saveMyDetails} className="mt-4 grid gap-3">
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Your name
            <input
              name="name" defaultValue={person.name} autoComplete="name"
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Your mobile
            {/*
              `type="tel"` and `inputMode` bring up the number pad. On a phone that is the whole
              difference between a field somebody fills in and a field somebody gives up on.
            */}
            <input
              name="phone" type="tel" inputMode="tel" autoComplete="tel"
              defaultValue={person.phone ?? ''}
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Your work email — this is how you will sign in
            <input
              name="email" type="email" inputMode="email" autoComplete="email"
              defaultValue={person.email ?? ''}
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          {personal && (
            /*
              Warned, saved anyway. Somebody whose company mailbox is not set up on their first
              morning still has to be able to finish this — and a person stopped by a rule they
              cannot act on simply stops.
            */
            <p className="rounded-[14px] bg-cream px-4 py-3 text-[13px] leading-[20px] text-ink/80">
              That looks like a personal address. {WHY_COMPANY_EMAIL} Your office can change it later.
            </p>
          )}
          <SubmitButton className="btn-primary w-full py-3.5 text-[16px]" pending="Saving…">
            Save my details
          </SubmitButton>
        </form>
      </section>

      {/* ── 2. Licences and tickets ───────────────────────────────────────────────────────────── */}
      <section className="mt-5 rounded-[20px] bg-surface p-5">
        <h2 className="font-serif text-[20px] text-ink">{PHONE_STEPS[1].label}</h2>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">{PHONE_STEPS[1].why}</p>
        <p className="mt-2 text-[13px] leading-[20px] text-ink-light">
          Take them out of your wallet and copy the dates off them. The date is the important part —
          it is what stops you being put on a job after it has run out.
        </p>

        {licences.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {licences.map(l => (
              <li key={l.id} className="flex items-center gap-3 rounded-[14px] bg-cream px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{l.what}</span>
                  <span className="block text-[12.5px] text-ink-light">
                    {l.expiresAt ? `Runs out ${l.expiresAt}` : 'No date on it'}
                  </span>
                </span>
                <form action={removeMyLicence}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="id" value={l.id} />
                  <SubmitButton className="btn-secondary shrink-0 px-3 py-2 text-[13px]" pending="…">
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addMyLicence} className="mt-4 grid gap-3">
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            What is it?
            <input
              name="what" placeholder="A-grade electrical licence"
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            When does it run out?
            <input
              name="expiresAt" type="date"
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <SubmitButton className="btn-primary w-full py-3.5 text-[16px]" pending="Adding…">
            Add it
          </SubmitButton>
        </form>
        <p className="mt-3 text-[13px] text-ink-light">
          Add as many as you have — licence, white card, EWP, first aid, anything with a date on it.
        </p>
      </section>

      {/* ── 3. The induction ──────────────────────────────────────────────────────────────────── */}
      <section className="mt-5 rounded-[20px] bg-surface p-5">
        <h2 className="font-serif text-[20px] text-ink">{PHONE_STEPS[2].label}</h2>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">{PHONE_STEPS[2].why}</p>

        {person.inductionReadAt ? (
          <p className="mt-4 rounded-[14px] bg-cream px-4 py-3 text-[14px] leading-[21px] text-ink/80">
            You have said you have read it. {person.inductedAt
              ? 'Your office has signed it off too — you are right to go.'
              : 'Your office will sign it off with you. That part is theirs to do, not yours.'}
          </p>
        ) : (
          <form action={readTheInduction} className="mt-4 grid gap-3">
            <input type="hidden" name="token" value={token} />
            <p className="text-[13.5px] leading-[21px] text-ink/80">
              Read your business’s induction, then say so here. Somebody will go through it with you
              as well — this just tells them you have had it.
            </p>
            <SubmitButton className="btn-primary w-full py-3.5 text-[16px]" pending="…">
              I have read the induction
            </SubmitButton>
          </form>
        )}
      </section>

      <p className="mt-8 text-center text-[13px] leading-[20px] text-ink-light">
        This link is just for you. If it was sent to the wrong person, tell the office and they will
        send a new one — the old one stops working straight away.
      </p>
    </main>
  );
}
