import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { journeyFor, minutesLeft, STAGES, MILESTONES, type StepStatus } from '@/lib/journey';
import { Shell } from '@/components/ui';
import { planState, trialLabel, TRIAL_DAYS } from '@/lib/plan';
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
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-900' },
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
  billing_error: { tone: 'warn', text: "We couldn't open the payment page just then. Nothing has been charged. Try again, and if it happens twice email hello@specbizhq.com and we'll sort it at our end." },
};

export default async function Journey({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const notice = BILLING_NOTICE[Object.keys(BILLING_NOTICE).find(k => sp[k]) ?? ''];
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const plan = planState({ id: tenant.id, plan: tenant.plan, startDate: tenant.startDate });
  const steps = await journeyFor(user.tenantId);
  const momentum = await momentumFor(user.tenantId);
  const next = steps.find(s => !s.optional && s.status !== 'done');
  const built = steps.filter(s => s.status === 'done' && !s.optional);
  const done = built.length;
  const required = steps.filter(s => !s.optional);
  const left = minutesLeft(steps);
  const offers = steps.filter(s => s.optional && s.status !== 'done');
  const four = (await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId))).filter(d => d.sectionId === 'four_questions');
  const hurting = four.filter(d => d.answer === 'yes').map(d => d.questionId);

  const PLAN_LABEL: Record<string, string> = { trial: 'Trial', basic: 'Basic (self-serve)', program: 'SPEC Program', lapsed: 'Lapsed' };

  return (
    <Shell title={tenant.name} subtitle={done === 0 ? `Setting up · ${PLAN_LABEL[tenant.plan] ?? tenant.plan}` : `${done} of ${required.length} done · ${PLAN_LABEL[tenant.plan] ?? tenant.plan}`}>
      {notice && (
        <div className={`mb-4 rounded-lg border-l-4 p-4 text-sm ${notice.tone === 'ok' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-amber-400 bg-white text-ink'}`}>
          {notice.text}
        </div>
      )}
      {plan.lapsed && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <span>Your subscription has lapsed — the business is read-only until it's renewed. Nothing has been deleted.</span>
          <form action="/api/stripe/checkout" method="post"><button className="ml-4 shrink-0 rounded-lg bg-red-900 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">Renew — $100/year</button></form>
        </div>
      )}
      {plan.onTrial && (
        <div className="mb-4 rounded-lg border-l-4 border-emerald-500 bg-white p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-medium">Free trial — {trialLabel(plan)}</div>
            <span className="label-caps text-[10px]">No card needed</span>
          </div>
          <p className="mt-1 text-ink-light">Everything is unlocked: build the org chart, set the KPIs, score a month, generate the board output. Try the whole thing, then decide.</p>
          <form action="/api/stripe/checkout" method="post" className="mt-3"><button className="btn-primary">Continue after the trial — $100/year</button></form>
        </div>
      )}
      {plan.trialExpired && (
        <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">
          <div className="font-medium">Your {TRIAL_DAYS}-day free trial has ended</div>
          <p className="mt-1 text-ink-light">Everything you set up is still here and nothing has been deleted — the business is read-only until you subscribe.</p>
          <form action="/api/stripe/checkout" method="post" className="mt-3"><button className="btn-primary">Subscribe — $100/year</button></form>
        </div>
      )}
      {plan.paid && (
        <form action="/api/stripe/portal" method="post" className="mb-4 text-right"><button className="text-sm text-ink-light underline hover:text-rust">Billing</button></form>
      )}
      {four.length > 0 && (
        <div className="mb-4 rounded-lg bg-white p-4 text-sm">
          <span className="font-medium">Where it hurts, in your words:</span> {hurting.length ? hurting.map(h => h[0].toUpperCase() + h.slice(1)).join(', ') : 'nowhere yet'}.
          <span className="text-ink-light"> The journey below is how you learn why — and every KPI Claude proposes leans on those pillars first.</span>
        </div>
      )}
      {momentum.quiet && next && momentum.lastChangeAt && (
        <div className="mb-4 rounded-lg border border-ink/15 bg-white p-4 text-sm">
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
          <div className="mt-1 font-serif text-2xl font-bold text-ink">{next.title}</div>
          <p className="mt-2 text-sm text-ink"><span className="font-medium">When it&apos;s done:</span> {next.payoff}</p>
          <p className="mt-1 text-sm text-ink-light">{next.detail}</p>
          <Link href={next.href} className="mt-4 inline-block rounded-lg bg-rust px-5 py-2.5 text-sm font-medium text-white hover:bg-rust-dark">Start</Link>
          <p className="mt-3 text-xs text-ink-light">
            Every answer saves as you type. Stop wherever you like and come back — you will land on the next unanswered question, not back at the start.
          </p>
        </div>
      )}
      {!next && <div className="rounded-lg bg-emerald-50 p-4 text-emerald-900">Setup is done. From here the rhythm carries it: the weekly meeting, monthly scoring, monthly board output.</div>}

      {/* What they have already built, in results rather than ticks. Progress is worth feeling. */}
      {built.length > 0 && (
        <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5">
          <div className="label-caps">What you have already built</div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-light">
            {built.map(b => <li key={b.id} className="flex gap-2"><span className="text-emerald-700">✓</span><span>{b.payoff}</span></li>)}
          </ul>
          {left > 0 && <p className="mt-3 text-sm text-ink">Roughly {mins(left).replace('about ', '')} of setup left, in pieces this size.</p>}
        </section>
      )}

      {/* Optional accelerators — offered, never owed. Nothing here blocks anything. */}
      {offers.length > 0 && (
        <section className="mt-6 rounded-lg border border-dashed border-ink/20 bg-white p-5">
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
        * The whole road is here for anyone who wants to see it, but folded away by default. Seeing
        * every remaining step at once is what makes a long job feel impossible; being unable to see
        * it at all is what makes it feel like a trap. So: closed, and one click from open.
        */}
      <details className="group mt-8 rounded-lg border border-ink/10 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
          See the whole journey
          <span className="ml-2 font-normal text-ink-light">— {required.length} steps, start to a working board pack</span>
        </summary>
        <div className="border-t border-ink/10 p-4 pt-2">
          {[0, 1, 2, 3].map(stage => steps.some(s => s.stage === stage) && (
            <section key={stage} className="mt-5">
              <h2 className="label-caps">{STAGES[stage]}</h2>
              <ol className="mt-2 divide-y rounded-lg border bg-white">
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
            <ol className="mt-2 divide-y rounded-lg border bg-white">
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
      {tenant.plan !== 'program' && (
        <section className="mt-10">
          <h2 className="label-caps">Two ways to do this</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-light">
            Both end in the same place: a business that runs well, visibly, without you in every decision.
            The only choice that doesn&apos;t get you there is stopping.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-lg border border-ink/10 bg-white p-5">
              <div className="label-caps">On your own</div>
              <div className="mt-1 font-serif text-lg font-bold text-ink">You work through it</div>
              <p className="mt-2 flex-1 text-sm text-ink-light">
                The system leads each step and Claude explains why each one exists, so you are never guessing what
                comes next. You set the pace. Most businesses can do this — it asks for honesty and a few hours a month,
                not expertise.
              </p>
              <div className="mt-3 text-sm font-medium text-ink">$100 a year</div>
              {!plan.paid && (
                <form action="/api/stripe/checkout" method="post" className="mt-3">
                  <button className="btn-secondary w-full">Keep going on my own</button>
                </form>
              )}
            </div>

            <div className="flex flex-col rounded-lg border border-ink/10 bg-white p-5">
              <div className="label-caps">With someone alongside you</div>
              <div className="mt-1 font-serif text-lg font-bold text-ink">We walk it with you</div>
              <p className="mt-2 flex-1 text-sm text-ink-light">
                SPEC Business Solutions runs the rollout with you: on site, manager and supervisor training with SPEC
                certification, and a principal at your board meeting each month. For when the problems are big enough
                that you would rather not do this alone.
              </p>
              <div className="mt-3 text-sm font-medium text-ink">Quoted per business</div>
              <form action={requestProgram} className="mt-3">
                {tenant.programRequestedAt
                  ? <span className="text-sm text-emerald-800">Requested — SPEC Business Solutions will be in touch.</span>
                  : <button className="btn-primary w-full">Ask about doing it together</button>}
              </form>
            </div>
          </div>
        </section>
      )}
    </Shell>
  );
}
