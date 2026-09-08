import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { journeyFor, STAGES, MILESTONES, type StepStatus } from '@/lib/journey';
import { Shell } from '@/components/ui';
import { planState, trialLabel, TRIAL_DAYS } from '@/lib/plan';
import { momentumFor, onDate } from '@/lib/momentum';
import { requestProgram } from './actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  todo: { label: 'To do', cls: 'bg-cream text-slate-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-900' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-900' },
  blocked: { label: 'Blocked', cls: 'bg-red-100 text-red-900' },
};

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
  const next = steps.find(s => s.status !== 'done');
  const done = steps.filter(s => s.status === 'done').length;
  const four = (await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId))).filter(d => d.sectionId === 'four_questions');
  const hurting = four.filter(d => d.answer === 'yes').map(d => d.questionId);

  const PLAN_LABEL: Record<string, string> = { trial: 'Trial', basic: 'Basic (self-serve)', program: 'SPEC Program', lapsed: 'Lapsed' };

  return (
    <Shell title={`${tenant.name} — deployment journey`} subtitle={`${done} of ${steps.length} steps done · ${PLAN_LABEL[tenant.plan] ?? tenant.plan}`}>
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
      {next && (
        <div className="callout">
          <div className="label-caps">Next step</div>
          <div className="mt-1 text-lg font-medium"><Link href={next.href} className="hover:underline">{next.title}</Link></div>
          <p className="mt-1 text-sm text-ink-light">{next.why}</p>
          <p className="mt-2 text-sm"><span className="font-medium">Where you're at:</span> {next.detail}</p>
          <Link href={next.href} className="mt-3 inline-block rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Go to this step</Link>
        </div>
      )}
      {!next && <div className="rounded-lg bg-emerald-50 p-4 text-emerald-900">Every setup step is done. From here the rhythm carries it: weekly SOG meeting, monthly scoring, monthly board output.</div>}

      {[0, 1, 2, 3].map(stage => (
        <section key={stage} className="mt-8">
          <h2 className="label-caps">Stage {stage} — {STAGES[stage]}</h2>
          <ol className="mt-2 divide-y rounded-lg border bg-white">
            {steps.filter(s => s.stage === stage).map(s => (
              <li key={s.id} className="flex items-start gap-4 p-4">
                <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                <div className="flex-1">
                  <Link href={s.href} className="font-medium hover:underline">{s.title}</Link>
                  <div className="text-sm text-ink-light">{s.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="mt-8">
        <h2 className="label-caps">Stage 4 — {STAGES[4]}</h2>
        <ol className="mt-2 divide-y rounded-lg border bg-white">
          {MILESTONES.map(m => <li key={m.when} className="flex gap-4 p-4 text-sm"><span className="w-20 shrink-0 font-medium">{m.when}</span><span className="text-ink-light">{m.what}</span></li>)}
        </ol>
      </section>

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
