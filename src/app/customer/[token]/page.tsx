import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import {
  isToken, customerStage, headline, CUSTOMER_STAGES, VARIATION_ANSWERS, mayAnswer,
  type CustomerView, greeting,
} from '@/lib/customer-page';
import { pickSlot, answerVariation } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your job',
  /* Nobody's job should turn up in a search result. */
  robots: { index: false, follow: false },
};

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The customer's own page — designs/SPEC Customer Page.dc.html.
 *
 * ── The other side of the business ───────────────────────────────────────────────────────────────
 *
 * Every other screen in SPEC is for somebody who works at the business. This one is for the person
 * paying, on their phone, and it answers the five questions that make up most of the calls a trade
 * business fields: when are you coming, are you on your way, what is this extra going to cost, is
 * it finished, and how do I pay.
 *
 * ── No sign-in ───────────────────────────────────────────────────────────────────────────────────
 *
 * A customer will not make an account to find out when the electrician is arriving, so the link is
 * the key — 32 random characters, one per job. That is a real trade-off and it is treated as one:
 * the token is a credential, the page is never indexed, and it shows exactly the fields in
 * `CustomerView` and nothing else. What the work cost, the margin and the crew's rates are the
 * business's, and a test fails the build if any of them appear here.
 */
export default async function CustomerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isToken(token)) notFound();

  const [job] = await db.select().from(schema.jobs)
    .where(eq(schema.jobs.customerToken, token));
  if (!job) notFound();

  const [business] = await db.select({ name: schema.tenants.name })
    .from(schema.tenants).where(eq(schema.tenants.id, job.tenantId));

  const [variation] = await db.select({
    id: schema.jobBills.id, what: schema.jobBills.what,
    amountCents: schema.jobBills.amountCents, state: schema.jobBills.state,
  }).from(schema.jobBills)
    .where(and(
      eq(schema.jobBills.tenantId, job.tenantId),
      eq(schema.jobBills.jobId, job.id),
      eq(schema.jobBills.kind, 'variation'),
    ));

  const [invoice] = await db.select({
    id: schema.jobBills.id, what: schema.jobBills.what,
    amountCents: schema.jobBills.amountCents, state: schema.jobBills.state,
  }).from(schema.jobBills)
    .where(and(
      eq(schema.jobBills.tenantId, job.tenantId),
      eq(schema.jobBills.jobId, job.id),
      eq(schema.jobBills.kind, 'invoice'),
    ));

  /*
    Everything the page is allowed to know, built here. Nothing downstream can widen it, which is
    the point — the danger is never a decision somebody makes, it is a later edit handing the whole
    job row to a template that renders what it is given.
  */
  const view: CustomerView = {
    ref: job.ref,
    title: job.title,
    site: job.site,
    business: business?.name ?? 'Your tradesperson',
    stage: customerStage(job),
    who: (job.createdBy ?? '').trim().split(/\s+/)[0] ?? '',
    slot: job.bookedSlot,
    etaMinutes: job.etaMinutes,
    vehicle: job.vehicle,
    variation: variation ? { what: variation.what, amountCents: variation.amountCents, state: variation.state } : null,
    invoice: invoice ? { ref: invoice.what, amountCents: invoice.amountCents, state: invoice.state } : null,
  };

  /* Only the first name, worked out here; the customer's full name is never handed to the page. */
  const hi = greeting(job.client);
  const at = CUSTOMER_STAGES.findIndex(s => s.key === view.stage);
  const slots = nextSlots();

  return (
    <main className="mx-auto grid max-w-[560px] gap-4 px-4 py-6">
      <header className="grid gap-1">
        <span className="label-caps">{view.business}</span>
        <p className="text-sm text-ink">{hi}</p>
        <h1 className="font-serif text-2xl leading-tight text-ink">
          {headline(view.stage, view.who, view.slot)}
        </h1>
        <p className="text-sm text-ink-light">{view.title}{view.site ? ` · ${view.site}` : ''}</p>
      </header>

      {/* Where it has got to, in the customer's words rather than the board's. */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Where your job is up to">
        {CUSTOMER_STAGES.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === at ? 'step' : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              i < at ? 'bg-sage-200 text-sage-900' : i === at ? 'bg-ink text-white' : 'bg-cream text-ink-light'
            }`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {view.stage === 'approved' && (
        <section className="card">
          <h2 className="font-serif text-lg text-ink">Pick a time that suits you</h2>
          <p className="mt-1 text-sm text-ink-light">Whichever you choose, we will text you the morning before.</p>
          <div className="mt-3 grid gap-2">
            {slots.map(s => (
              <form key={s} action={pickSlot}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="slot" value={s} />
                {/* 48px, because this is somebody's thumb on a phone in a hallway. */}
                <SubmitButton className="btn-secondary min-h-[48px] w-full text-base" pending="Booking…">{s}</SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}

      {view.stage === 'on_the_way' && (
        <section className="card">
          <h2 className="font-serif text-lg text-ink">{view.who || 'Your electrician'} is on the way</h2>
          <p className="mt-1 text-sm text-ink-light">
            {view.etaMinutes ? `About ${view.etaMinutes} minutes away.` : 'On the way now.'}
            {view.vehicle ? ` ${view.vehicle}.` : ''} They will call when they are out the front.
          </p>
        </section>
      )}

      {view.variation && (
        <section className="card">
          <h2 className="font-serif text-lg text-ink">{view.who || 'Your electrician'} found something</h2>
          <p className="mt-1 text-sm text-ink">{view.variation.what}</p>
          <p className="mt-2 font-serif text-2xl text-ink">{money(view.variation.amountCents)}</p>
          {mayAnswer(view.variation, job.stage) ? (
            <div className="mt-3 grid gap-2">
              {VARIATION_ANSWERS.map(a => (
                <form key={a.key} action={answerVariation}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="answer" value={a.key} />
                  <SubmitButton
                    className={`min-h-[48px] w-full text-base ${a.key === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
                    pending="One moment…"
                  >
                    {a.label}
                  </SubmitButton>
                </form>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
              {view.variation.state === 'agreed' ? 'Approved — thank you.' : 'We will give you a call about this one.'}
            </p>
          )}
        </section>
      )}

      {view.invoice && (view.stage === 'done' || view.stage === 'paid') && (
        <section className="card">
          <h2 className="font-serif text-lg text-ink">
            {view.stage === 'paid' ? 'Paid. Thank you.' : 'All done. Here is your invoice.'}
          </h2>
          <p className="mt-2 font-serif text-3xl text-ink">{money(view.invoice.amountCents)}</p>
          <p className="mt-1 text-sm text-ink-light">{view.invoice.ref}</p>
          {view.stage !== 'paid' && (
            <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
              Your certificate of compliance comes with it. Pay by card or bank transfer using the
              details on the invoice — {view.business} will have sent it to you.
            </p>
          )}
        </section>
      )}

      <p className="text-center text-xs text-ink-light">
        This page is just for your job. {view.business} keeps it up to date as the work goes.
      </p>
    </main>
  );
}

/**
 * Four times to choose from, starting tomorrow.
 *
 * Deliberately not "any day you like": a customer given a calendar picks a date the crew is already
 * booked, and then somebody has to ring them back to say no. Four real options is a decision
 * somebody can make in five seconds.
 */
function nextSlots(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; out.length < 4 && i < 14; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const label = day.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    out.push(`${label} · 7am`);
    if (out.length < 4) out.push(`${label} · 12pm`);
  }
  return out.slice(0, 4);
}
