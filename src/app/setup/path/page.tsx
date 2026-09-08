import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { requestProgram } from '../../journey/actions';

export const dynamic = 'force-dynamic';

/**
 * The fork, placed early — straight after the diagnostic, before the leader has invested hours.
 *
 * Two real options, weighted equally. Asking for help is not the expensive path and doing it
 * yourself is not the cheap one; the only choice that costs a business anything is stopping. That
 * is the whole message, and it is why this is a fork and not a pricing table: someone who feels
 * sold to at the point they have just admitted things are going wrong closes the tab.
 */
export default async function ChoosePath() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;

  return (
    <Shell
      title="Two ways to do this"
      subtitle="Both end in the same place. Pick the one that fits how much you have got in front of you right now."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-ink/10 bg-white p-6">
          <div className="label-caps">On your own</div>
          <div className="mt-1 font-serif text-2xl font-bold text-ink">You work through it</div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-light">
            The system leads each step and explains why it exists, so you are never guessing what comes
            next. You set the pace, and you can stop and pick it up whenever you like. Most businesses
            do it this way — it asks for honesty and a few hours a month, not expertise.
          </p>
          <div className="mt-4 text-sm text-ink">
            <b>Free to build.</b> Draw your whole structure and set the KPIs at no cost — you only pay
            once you invite real people in.
          </div>
          <a href="/setup/roles" className="btn-primary mt-4 text-center">Start building</a>
        </div>

        <div className="flex flex-col rounded-lg border border-ink/10 bg-white p-6">
          <div className="label-caps">With someone alongside you</div>
          <div className="mt-1 font-serif text-2xl font-bold text-ink">We walk it with you</div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-light">
            SPEC Business Solutions runs the rollout with you: on site, managers and supervisors trained
            and certified, and a principal at your board meeting each month. For when the problems are
            big enough that you would rather not do this alone — which is a judgement about workload,
            not ability.
          </p>
          <div className="mt-4 text-sm text-ink"><b>Quoted per business.</b> Sized to what you actually need.</div>
          <form action={requestProgram} className="mt-4">
            {tenant.programRequestedAt
              ? <span className="text-sm text-emerald-800">Requested — SPEC Business Solutions will be in touch. You can keep building in the meantime.</span>
              : <button className="btn-secondary w-full">Ask about doing it together</button>}
          </form>
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-light">
        You can change your mind at any point, and asking for help later costs you nothing you have
        already built. The only option that leaves the business where it is, is stopping here.
      </p>
    </Shell>
  );
}
