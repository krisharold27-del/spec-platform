import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { journeyFor, STAGES, MILESTONES, type StepStatus } from '@/lib/journey';
import { Shell } from '@/components/ui';
import { requestProgram } from './actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  todo: { label: 'To do', cls: 'bg-cream text-slate-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-900' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-900' },
  blocked: { label: 'Blocked', cls: 'bg-red-100 text-red-900' },
};

export default async function Journey() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const steps = await journeyFor(user.tenantId);
  const next = steps.find(s => s.status !== 'done');
  const done = steps.filter(s => s.status === 'done').length;
  const four = (await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId))).filter(d => d.sectionId === 'four_questions');
  const hurting = four.filter(d => d.answer === 'yes').map(d => d.questionId);

  const PLAN_LABEL: Record<string, string> = { trial: 'Trial', basic: 'Basic (self-serve)', program: 'SPEC Program', lapsed: 'Lapsed' };

  return (
    <Shell title={`${tenant.name} — deployment journey`} subtitle={`${done} of ${steps.length} steps done · ${PLAN_LABEL[tenant.plan] ?? tenant.plan}`}>
      {tenant.plan === 'lapsed' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <span>Your subscription has lapsed — the business is read-only until it's renewed. Nothing has been deleted.</span>
          <form action="/api/stripe/checkout" method="post"><button className="ml-4 shrink-0 rounded-lg bg-red-900 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">Renew — $100/year</button></form>
        </div>
      )}
      {tenant.plan === 'trial' && (
        <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">
          <div className="font-medium">You're on a trial</div>
          <p className="mt-1 text-ink-light">Registering Claude, building the org chart and setting KPIs are all free. Scoring a month and generating the board output need a period open, which starts with <b>SPEC Basic — $100/year</b>.</p>
          <form action="/api/stripe/checkout" method="post" className="mt-3"><button className="rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Start Basic — $100/year</button></form>
        </div>
      )}
      {(tenant.plan === 'basic' || tenant.plan === 'program') && (
        <form action="/api/stripe/portal" method="post" className="mb-4 text-right"><button className="text-sm text-ink-light underline hover:text-rust">Billing</button></form>
      )}
      {four.length > 0 && (
        <div className="mb-4 rounded-lg bg-white p-4 text-sm">
          <span className="font-medium">Where it hurts, in your words:</span> {hurting.length ? hurting.map(h => h[0].toUpperCase() + h.slice(1)).join(', ') : 'nowhere yet'}.
          <span className="text-ink-light"> The journey below is how you learn why — and every KPI Claude proposes leans on those pillars first.</span>
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

      {tenant.plan !== 'program' && (
        <section className="mt-10 rounded-lg border-t-4 border-rust bg-ink p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-rust-light">Option</div>
          <div className="mt-1 font-serif text-lg font-bold">Run this as a SPEC Program</div>
          <p className="mt-1 text-sm text-slate-300">Basic gives you the system. A Program adds the consulting arm of SPEC Business Solutions: rollout led on site, supervisor and manager training with SPEC certification, and a principal at your board meeting each month. Businesses in the record that finish the year on a Program end up with an operation that runs without the owner in every decision.</p>
          <form action={requestProgram} className="mt-3">
            {tenant.programRequestedAt
              ? <span className="text-sm text-emerald-300">Requested — SPEC Business Solutions will be in touch.</span>
              : <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-200">Ask about a Program</button>}
          </form>
        </section>
      )}
    </Shell>
  );
}
