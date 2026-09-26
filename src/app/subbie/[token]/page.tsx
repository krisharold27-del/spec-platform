import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { isSetupToken } from '@/lib/onboarding';
import {
  CHECKS, THEIRS, OURS, NOT_YOURS_TO_TICK, checkLabel, stateOf, type Check,
} from '@/lib/subbies';
import { saveMyContact, recordMyCheck } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your paperwork',
  /* A subcontractor's insurance should never turn up in a search result. */
  robots: { index: false, follow: false },
};

/**
 * The page a subcontractor opens on their own phone.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * The Subcontractors screen has said "They set themselves up on their phone in about ten minutes"
 * since it was built, and required a mobile number on the grounds that it was "how they get the
 * link to set themselves up". There was no link. No token was ever issued, no message was ever
 * offered, and all six checks were typed in by the office — which is exactly the transcription job
 * `/join` exists to remove for employees, left in place for the people whose paperwork expires most
 * often.
 *
 * So the promise is kept rather than the sentence deleted. Prose is not behaviour; this is the
 * behaviour.
 *
 * ── Four, not six ────────────────────────────────────────────────────────────────────────────────
 *
 * A subbie hands over what is theirs: ABN, public liability, workers' comp, licence. The subcontract
 * is the business's document and the induction is the business's mark — the same rule that stops an
 * employee inducting themselves, applied to somebody who is on the job rather than beside it. The
 * page says so out loud, because a subbie who thinks they are blocked on a tick that was never
 * theirs stops and waits.
 */
export default async function SubbieSetup({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSetupToken(token)) notFound();

  const [subbie] = await db.select().from(schema.subcontractors)
    .where(eq(schema.subcontractors.setupToken, token));
  if (!subbie) notFound();

  const [business] = await db.select({ name: schema.tenants.name })
    .from(schema.tenants).where(eq(schema.tenants.id, subbie.tenantId));

  const rows = await db.select({
    kind: schema.subbieChecks.kind,
    expiresAt: schema.subbieChecks.expiresAt,
    state: schema.subbieChecks.state,
    note: schema.subbieChecks.note,
  }).from(schema.subbieChecks)
    .where(and(
      eq(schema.subbieChecks.tenantId, subbie.tenantId),
      eq(schema.subbieChecks.subbieId, subbie.id),
    ));

  const today = new Date().toISOString().slice(0, 10);
  const found = (kind: string) => rows.find(r => r.kind === kind) ?? null;
  const isIn = (kind: string) => {
    const r = found(kind);
    if (!r) return false;
    const s = stateOf(r as Check, today);
    return s === 'current' || s === 'expiring';
  };
  const doneCount = THEIRS.filter(isIn).length;

  return (
    <main className="mx-auto w-full max-w-[540px] px-4 pb-24 pt-8">
      <header className="grid gap-2">
        {/*
          The business's name exactly as they write it, doing security work rather than decoration.
          A link arriving from a number nobody has saved looks like a scam, and the one thing that
          makes it not look like one is seeing the name spelled the way the sender spells it.
        */}
        <p className="text-[14px] font-medium tracking-[0.01em] text-ink-light">{business?.name ?? 'The business'}</p>
        <h1 className="font-serif text-[30px] leading-[1.15] text-ink">
          {subbie.business.trim() || 'Your paperwork'}
        </h1>
        <p className="text-[15px] leading-[24px] text-ink/80">
          Four things off your own certificates, and then you can be put on jobs. It takes about ten
          minutes and you only do it once — after that SPEC watches the dates for you.
        </p>
        <p className="mt-1 text-[13px] text-ink-light" data-subbie-progress>
          {doneCount === THEIRS.length
            ? 'All four in — thank you. Your office does the last two.'
            : `${doneCount} of ${THEIRS.length} done`}
        </p>
      </header>

      {/* ── Who you are ───────────────────────────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-[20px] bg-surface p-5">
        <h2 className="font-serif text-[20px] text-ink">How they reach you</h2>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">
          So a supervisor can get hold of you about a job, and SPEC can tell you before something
          runs out rather than after.
        </p>
        <form action={saveMyContact} className="mt-4 grid gap-3">
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Your name
            <input
              name="contact" defaultValue={subbie.contact} autoComplete="name"
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Mobile
            <input
              name="mobile" type="tel" inputMode="tel" autoComplete="tel"
              defaultValue={subbie.mobile}
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-light">
            Email
            <input
              name="email" type="email" inputMode="email" autoComplete="email"
              defaultValue={subbie.email ?? ''}
              className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
            />
          </label>
          <SubmitButton className="btn-primary w-full py-3.5 text-[16px]" pending="Saving…">
            Save
          </SubmitButton>
        </form>
      </section>

      {/* ── The four that are yours ───────────────────────────────────────────────────────────── */}
      {CHECKS.filter(c => THEIRS.includes(c.key)).map(c => {
        const r = found(c.key);
        const state = r ? stateOf(r as Check, today) : 'missing';
        return (
          <section key={c.key} className="mt-5 rounded-[20px] bg-surface p-5" data-subbie-check={c.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-[20px] text-ink">{c.label}</h2>
              <span className="text-[12.5px] text-ink-light" data-subbie-state={state}>
                {state === 'missing' ? 'Not in yet'
                  : state === 'expired' ? 'Run out — send the new one'
                  : state === 'expiring' ? `Runs out ${r?.expiresAt}`
                  : r?.expiresAt ? `In, runs out ${r.expiresAt}` : 'In'}
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">{c.why}</p>

            <form action={recordMyCheck} className="mt-4 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="kind" value={c.key} />
              <label className="grid gap-1.5 text-[13px] text-ink-light">
                {c.key === 'abn' ? 'Your ABN' : 'Policy or licence number, if it has one'}
                <input
                  name="note" defaultValue={r?.note ?? ''}
                  inputMode={c.key === 'abn' ? 'numeric' : 'text'}
                  placeholder={c.key === 'abn' ? '11 digits' : ''}
                  className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
                />
              </label>
              {c.expires && (
                <label className="grid gap-1.5 text-[13px] text-ink-light">
                  {/*
                    The date is the whole point of the row. `stateOf` reads it rather than whatever
                    anybody typed, so a policy recorded as current in March stops counting in
                    October without anybody touching it.
                  */}
                  When does it run out? Copy it off the certificate.
                  <input
                    name="expiresAt" type="date" defaultValue={r?.expiresAt ?? ''}
                    className="w-full rounded-[14px] border border-ink/15 bg-cream px-4 py-3 text-[16px] text-ink"
                  />
                </label>
              )}
              <SubmitButton className="btn-primary w-full py-3.5 text-[16px]" pending="Saving…">
                {r ? 'Update it' : 'Send it through'}
              </SubmitButton>
            </form>
            {c.key === 'abn' && r && r.state === 'missing' && r.note && (
              /*
                Checked by arithmetic on the number, never by asking the register — see lib/ato. So
                it can say this without ever being wrong about a valid ABN. Kept rather than
                refused: a subbie who is turned away simply stops.
              */
              <p className="mt-3 rounded-[14px] bg-cream px-4 py-3 text-[13px] leading-[20px] text-ink/80" data-subbie-abn-wrong>
                That is not a valid ABN — the check digits do not add up, so a number has been typed
                wrong somewhere. It is saved, and it will not count until it is right.
              </p>
            )}
          </section>
        );
      })}

      {/* ── The two that are not ──────────────────────────────────────────────────────────────── */}
      <section className="mt-5 rounded-[20px] bg-cream p-5" data-subbie-not-yours>
        <h2 className="font-serif text-[18px] text-ink">The last two are your office&rsquo;s</h2>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-ink/80">{NOT_YOURS_TO_TICK}</p>
        <ul className="mt-3 grid gap-1">
          {OURS.map(k => (
            <li key={k} className="text-[13.5px] text-ink-light">{checkLabel(k)}</li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-center text-[13px] leading-[20px] text-ink-light">
        This link is just for you. If it came to the wrong person, tell the business and they will
        send a new one — the old one stops working straight away.
      </p>
    </main>
  );
}
