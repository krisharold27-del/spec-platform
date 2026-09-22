import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getTenantById } from '@/lib/queries';
import { goalsFor } from '@/lib/goals-data';
import { GOAL_PROMPTS, GOAL_MAX, goalsAnswered, goalsSet } from '@/lib/goals';
import { saveBusinessGoals } from './actions';
import { nextStepAfter } from '@/lib/journey';
import { NextStepCallout } from '@/components/next-step';

export const dynamic = 'force-dynamic';

/**
 * Step one — what the business is actually for.
 *
 * ── Why this is before the business itself ───────────────────────────────────────────────────────
 *
 * Design export 5: "before a single role or KPI, the owner or director says what winning looks like.
 * Every target Claude proposes later gets checked against this — a KPI that doesn't serve one of
 * these goals is a KPI worth questioning."
 *
 * The order is the argument. A role proposed against a sector and a headcount is the shape of
 * business this USUALLY is; proposed against what this owner said winning looks like, it is the
 * business they are actually running. Same for a target: without the goals, "is 32% right?" has no
 * answer better than an average, and with them it has one.
 *
 * ── Why one answer is enough to finish the step ──────────────────────────────────────────────────
 *
 * Three empty boxes at the very front of setup is the moment a busy owner closes the tab. A step
 * that cannot be completed without writing three paragraphs would stop the whole business being
 * drawn, which costs more than the two missing answers are worth. One real sentence gives SPEC
 * something to check a KPI against; the page says the rest can come later, and means it.
 */
export default async function Goals({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const goals = await goalsFor(user.tenantId);
  const saved = String((await searchParams).saved ?? '') === '1';

  const answered = goalsAnswered(goals);
  const count = goalsSet(goals);
  const byId = new Map(goals.map(g => [g.promptId, g.answer]));
  const nextStep = await nextStepAfter(user.tenantId, '/setup/goals');

  return (
    <Shell
      title="What is this business actually for?"
      subtitle={`${tenant.name} · step 1, and everything after it is measured against your answer.`}
    >
      <section className="card max-w-3xl">
        <p className="max-w-2xl text-sm leading-7 text-ink">
          Before a single role or KPI, you say what winning looks like. Every target SPEC proposes
          later gets checked against this — <b>a KPI that does not serve one of these goals is a KPI
          worth questioning.</b>
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-light">
          Your words, not ours. SPEC reads them and never rewrites them.
        </p>

        {saved && (
          <p className="callout mt-5 text-sm text-ink">
            Saved. These carry through the whole setup, and stay on the board pack and the monthly
            scoring page.
          </p>
        )}

        <form action={saveBusinessGoals} className="mt-6 grid gap-6">
          {GOAL_PROMPTS.map(p => (
            <label key={p.id} className="grid gap-2">
              <span className="font-serif text-base leading-snug text-ink">{p.label}</span>
              <span className="text-xs leading-5 text-ink-light">{p.why}</span>
              <textarea
                name={p.id}
                aria-label={p.label}
                placeholder={p.placeholder}
                defaultValue={byId.get(p.id) ?? ''}
                maxLength={GOAL_MAX}
                rows={3}
                className="w-full rounded-2xl border border-ink/15 bg-cream p-3.5 text-[15px] leading-6 text-ink placeholder:text-ink-light"
              />
            </label>
          ))}

          {/*
            Two buttons because there are two people here: somebody running setup for the first
            time, who wants to get on to the next step, and somebody coming back to change a goal
            months later, who should not be thrown into a setup run they finished long ago.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton className="btn-primary">
              {answered ? 'Save and continue' : 'Save goals'}
            </SubmitButton>
            <button
              type="submit"
              name="stay"
              value="1"
              className="rounded-full border border-ink/20 px-5 py-2 text-sm text-ink hover:border-rust hover:text-rust"
            >
              Save and stay here
            </button>
            <Link href="/setup" className="text-sm text-ink-light underline hover:text-rust">
              Back to setup
            </Link>
          </div>

          <p className="text-xs leading-5 text-ink-light">
            {count === 0
              ? 'One answer is enough to move on. The other two can wait — they are worth more thought than a first sitting usually gets.'
              : count < GOAL_PROMPTS.length
                ? `${count} of ${GOAL_PROMPTS.length} answered. That is enough to carry on; come back for the rest when you have thought about them.`
                : 'All three answered.'}
          </p>
        </form>
      </section>

      <section className="card mt-6 max-w-3xl">
        <h2 className="font-serif text-lg text-ink">What SPEC does with them</h2>
        <ul className="mt-3 grid gap-2 text-sm text-ink-light">
          <li>Reads the goals you have set.</li>
          <li>Proposes roles that serve them.</li>
          <li>Checks every KPI target against them.</li>
        </ul>
        <p className="mt-4 text-sm leading-6 text-ink-light">
          This stays visible on the board pack and the monthly scoring page, so the goals are never
          lost under the numbers.
        </p>
      </section>

      <NextStepCallout step={nextStep} />
    </Shell>
  );
}
