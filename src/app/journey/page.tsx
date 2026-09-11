import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { journeyFor, minutesLeft, isCore, businessShape, shapeSentence, STAGES, MILESTONES, type StepStatus } from '@/lib/journey';
import { Shell } from '@/components/ui';
import { planStateFor, costLabel } from '@/lib/plan';
import { seatLabel } from '@/lib/pricing';
import { requestCurrency } from '@/lib/request-currency';
import { momentumFor, onDate } from '@/lib/momentum';
import { requestProgram } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Quiet labels. The earlier version shouted "To do" and "Blocked" in amber and red down the whole
 * page — fifteen accusations at someone who came here because things are already going wrong.
 * Only finished work gets colour now; everything else is simply not finished yet, which is normal.
 */
const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  todo: { label: 'Not started', cls: 'bg-cream text-ink-light' },
  in_progress: { label: 'Started', cls: 'bg-cream text-ink' },
  done: { label: 'Done', cls: 'bg-sage-200 text-sage-900' },
  blocked: { label: 'Waiting', cls: 'bg-cream text-ink-light' },
};

function mins(n: number) {
  if (n <= 0) return '';
  if (n < 60) return `about ${n} minutes`;
  const h = Math.round(n / 30) / 2;
  return `about ${h % 1 === 0 ? h : h.toFixed(1)} hours, and it can be split`;
}

/**
 * Anything that can go wrong on the way back from Stripe lands here as a query string. Every one of
 * them gets a plain sentence and a way forward — a leader who clicks "subscribe" and silently lands
 * back on the same page assumes the product is broken, and they are already dealing with enough.
 */
const BILLING_NOTICE: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  upgraded: { tone: 'ok', text: 'Payment received — you are on SPEC Basic. Nothing you set up during the trial has changed.' },
  upgrade_cancelled: { tone: 'warn', text: 'Checkout was cancelled, so nothing has been charged. Your trial is untouched and you can subscribe whenever you are ready.' },
  nothing_to_bill: { tone: 'ok', text: 'Nothing to pay — you have not invited anyone in yet, and the structure you are building is free.' },
  billing_error: { tone: 'warn', text: "We couldn't open the payment page just then. Nothing has been charged. Try again, and if it happens twice email hello@specbizhq.com and we'll sort it at our end." },
};

export default async function Journey({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const notice = BILLING_NOTICE[Object.keys(BILLING_NOTICE).find(k => sp[k]) ?? ''];
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const currency = await requestCurrency();
  const plan = await planStateFor(user.tenantId, currency);
  const steps = await journeyFor(user.tenantId);
  const momentum = await momentumFor(user.tenantId);
  const next = steps.find(s => isCore(s) && s.status !== 'done');
  const core = steps.filter(isCore);
  const built = core.filter(s => s.status === 'done');
  const done = built.length;
  const required = core;
  const left = minutesLeft(steps);
  const offers = steps.filter(s => s.optional && s.status !== 'done');
  // Steps that sharpen SPEC but must never stand between an owner and their first dashboard.
  const deepen = steps.filter(s => s.later && !s.optional && s.status !== 'done');
  const shape = await businessShape(user.tenantId);
  const four = (await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId))).filter(d => d.sectionId === 'four_questions');
  const hurting = four.filter(d => d.answer === 'yes').map(d => d.questionId);



  return (
    <Shell title={tenant.name} subtitle={`${shapeSentence(shape)} · ${costLabel(plan)}`}>
      {notice && (
        <div className={`mb-4 rounded-lg border-l-4 p-4 text-sm ${notice.tone === 'ok' ? 'border-sage-600 bg-sage-100 text-sage-900' : 'border-rust-400 bg-surface text-ink'}`}>
          {notice.text}
        </div>
      )}
      {plan.lapsed && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rust-300 bg-rust-100 p-4 text-sm text-rust-800">
          <span>A payment didn&apos;t go through, so the business is read-only until it&apos;s sorted. Nothing has been deleted.</span>
          <form action="/api/stripe/checkout" method="post"><button className="ml-4 shrink-0 rounded-full bg-rust-800 px-4 py-2 text-sm font-medium text-cream hover:bg-rust-900">Fix payment</button></form>
        </div>
      )}
      {/*
        * No trial and no countdown. Building the business costs nothing and never expires; the meter
        * starts only when a real person is invited in. A clock on someone who has just admitted four
        * things are going wrong is the last thing they need.
        */}
      {plan.free && (
        <div className="mb-4 rounded-lg border-l-4 border-sage-600 bg-surface p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-medium">Free — nothing to pay yet</div>
            <span className="label-caps text-[10px]">No card needed</span>
          </div>
          <p className="mt-1 text-ink-light">
            Draw the whole business, set every KPI, take as long as you like. It only costs anything once
            you invite a real person in — {seatLabel(currency)} a month each. Roles with nobody in them are always free.
          </p>
        </div>
      )}
      {plan.billing && (
        <div className="mb-4 flex items-baseline justify-between gap-3 rounded-lg bg-surface p-4 text-sm">
          <span><b>{costLabel(plan)}</b> <span className="text-ink-light">· each extra person is {seatLabel(currency)} a month</span></span>
          <form action="/api/stripe/portal" method="post"><button className="text-sm text-ink-light underline hover:text-rust">Billing</button></form>
        </div>
      )}
      {four.length > 0 && (
        <div className="mb-4 rounded-lg bg-surface p-4 text-sm">
          <span className="font-medium">Where it hurts, in your words:</span> {hurting.length ? hurting.map(h => h[0].toUpperCase() + h.slice(1)).join(', ') : 'nowhere yet'}.
          <span className="text-ink-light"> The journey below is how you learn why — and every KPI Claude proposes leans on those pillars first.</span>
        </div>
      )}
      {momentum.quiet && next && momentum.lastChangeAt && (
        <div className="mb-4 rounded-lg border border-ink/15 bg-surface p-4 text-sm">
          <div className="label-caps">Where this stands</div>
          <p className="mt-1 text-ink-light">
            Nothing has changed in {tenant.name} since {onDate(momentum.lastChangeAt)}. {done} of {steps.length} steps
            are done and the next one is <b className="text-ink">{next.title}</b>. Both ways of finishing it are below.
          </p>
        </div>
      )}
      {/*
        * One thing. Not fifteen. Someone arriving here is already holding more open items than they
        * can carry — the page's job is to hand them a single next action, say how long it takes and
        * what they get for it, and make stopping halfway explicitly fine.
        */}
      {next && (
        <div className="callout">
          <div className="flex items-baseline justify-between gap-3">
            <div className="label-caps">Do this next</div>
            {next.minutes > 0 && <span className="text-xs text-ink-light">{mins(next.minutes)}</span>}
          </div>
          <div className="mt-1 font-serif text-2xl text-ink">{next.title}</div>
          <p className="mt-2 text-sm text-ink"><span className="font-medium">When it&apos;s done:</span> {next.payoff}</p>
          <p className="mt-1 text-sm text-ink-light">{next.detail}</p>
          <Link href={next.href} className="mt-4 inline-block rounded-full bg-rust px-5 py-2.5 text-sm font-medium text-cream hover:bg-rust-600">Start</Link>
          <p className="mt-3 text-xs text-ink-light">
            Every answer saves as you type. Stop wherever you like and come back — you will land on the next unanswered question, not back at the start.
          </p>
        </div>
      )}
      {!next && <div className="rounded-lg bg-sage-100 p-4 text-sage-900">Setup is done. From here the rhythm carries it: the weekly meeting, monthly scoring, monthly board output.</div>}

      {/* What they have already built, in results rather than ticks. Progress is worth feeling. */}
      {built.length > 0 && (
        <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-5">
          <div className="label-caps">What you have already built</div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-light">
            {built.map(b => <li key={b.id} className="flex gap-2"><span className="text-sage-700">✓</span><span>{b.payoff}</span></li>)}
          </ul>
          {left > 0 && <p className="mt-3 text-sm text-ink">Roughly {mins(left).replace('about ', '')} of setup left, in pieces this size.</p>}
        </section>
      )}

      {/* Optional accelerators — offered, never owed. Nothing here blocks anything. */}
      {offers.length > 0 && (
        <section className="mt-6 rounded-lg border border-dashed border-ink/20 bg-surface p-5">
          <div className="label-caps">Optional — when you want it working harder</div>
          {offers.map(o => (
            <div key={o.id} className="mt-2">
              <Link href={o.href} className="font-medium hover:underline">{o.title}</Link>
              <p className="text-sm text-ink-light">{o.why}</p>
            </div>
          ))}
        </section>
      )}

      {/*
        * The consultant's questions. They make SPEC sharper and they are worth doing — but asked on
        * day one they are forms standing where a business should be, so they sit here, offered, once
        * there is something to sharpen.
        */}
      {deepen.length > 0 && done > 0 && (
        <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-5">
          <div className="label-caps">When you want to go deeper</div>
          <p className="mt-1 text-sm text-ink-light">
            None of these are needed to run SPEC. Each one makes what it tells you sharper.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {deepen.slice(0, 6).map(d => (
              <li key={d.id} className="text-sm">
                <Link href={d.href} className="font-medium hover:underline">{d.title}</Link>
                <span className="text-ink-light"> · {mins(d.minutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        * The whole road is here for anyone who wants to see it, but folded away by default. Seeing
        * every remaining step at once is what makes a long job feel impossible; being unable to see
        * it at all is what makes it feel like a trap. So: closed, and one click from open.
        */}
      <details className="group mt-8 rounded-lg border border-ink/10 bg-surface">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
          See the whole journey
          <span className="ml-2 font-normal text-ink-light">— {required.length} steps, start to a working board pack</span>
        </summary>
        <div className="border-t border-ink/10 p-4 pt-2">
          {[0, 1, 2, 3].map(stage => steps.some(s => s.stage === stage) && (
            <section key={stage} className="mt-5">
              <h2 className="label-caps">{STAGES[stage]}</h2>
              <ol className="mt-2 divide-y rounded-lg border bg-surface">
                {steps.filter(s => s.stage === stage).map(s => (
                  <li key={s.id} className="flex items-start gap-4 p-4">
                    <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                    <div className="flex-1">
                      <Link href={s.href} className="font-medium hover:underline">{s.title}</Link>
                      {s.optional && <span className="ml-2 text-xs text-ink-light">optional</span>}
                      <div className="text-sm text-ink-light">{s.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <section className="mt-5">
            <h2 className="label-caps">{STAGES[4]}</h2>
            <ol className="mt-2 divide-y rounded-lg border bg-surface">
              {MILESTONES.map(m => <li key={m.when} className="flex gap-4 p-4 text-sm"><span className="w-20 shrink-0 font-medium">{m.when}</span><span className="text-ink-light">{m.what}</span></li>)}
            </ol>
          </section>
        </div>
      </details>

      {/*
        * Two journeys, not a pricing table. The destination is identical; what differs is whether
        * the leader walks it alone. Presented with equal weight and named honestly, because the
        * only outcome that costs a business anything is stopping — and a leader who feels sold to
        * at the point of difficulty stops.
        */}
      {!plan.program && (
        <p className="mt-8 text-sm text-ink-light">
          Would you rather not do this alone? <a href="/setup/path" className="underline hover:text-rust">SPEC Business Solutions can run the rollout with you</a> — on site, managers and supervisors trained and certified, and a principal at your board meeting each month.
        </p>
      )}

    </Shell>
  );
}
