import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell, Callout } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { getTenantById } from '@/lib/queries';
import { automationReview } from '@/lib/automation-data';
import { mayReadAutomationReview, WHY_RESTRICTED, type ReviewLevel } from '@/lib/automation';
import { AutomationReview } from '@/components/automation-review';
import { ReviewEngine } from '@/components/review-engine';
import { runReview } from '@/lib/review-engine';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPEC — what a process could do' };

/**
 * Which parts of each role a coded process could take on, and what that would be worth.
 *
 * ── Why it exists ────────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 16 September 2026, calling it "a key for this entire system": map every role and its KPIs,
 * automate what can be automated, and tell the leader what it saves. It has a first real case — a
 * solar quote turnaround of four days against a one-day standard the team correctly said a person
 * could not meet — and that case is the shape of the whole idea:
 *
 *   **A standard the business already agreed to, which a person cannot reach, is the signal to
 *   build a process. Not a cost-cutting exercise looking for somewhere to land.**
 *
 * The other half matters more to the people not being automated: a role a process cannot absorb is
 * confirmed here as a real job, in as many words, and that is said on the page rather than implied.
 *
 * ── Why it is behind the narrowest gate in the product ───────────────────────────────────────────
 *
 * Read one desk down, this is a page about whether somebody still has a job — while it is still a
 * proposal, before anybody has decided anything. So: the Managing Director, the CEO and the board.
 * Not managers, not for their own teams, and no administrator can grant it. The gate is checked
 * again on the server in ./actions.ts, because hiding a page is not access control.
 */
export default async function Automation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  /*
    Top of the chart counts as GM even when the role is titled something else.

    A business whose top role is "Owner" or "Managing Director" or "Principal" must not be locked
    out of its own review because the title does not match a keyword. `reportsToRoleId === null` is
    the structural fact; the title is decoration.
  */
  const level = (mine?.level === 'gm' || mine?.reportsToRoleId === null ? 'gm' : mine?.level) as ReviewLevel | undefined;

  if (!mayReadAutomationReview(level)) {
    return (
      <Shell title="Not this one" subtitle="This page is for the Managing Director and the board.">
        <Callout eyebrow="Why">
          <p className="text-sm text-ink-light">{WHY_RESTRICTED}</p>
          <p className="mt-3 text-sm">
            <Link href="/today" className="underline">Back to today</Link>
          </p>
        </Callout>
      </Shell>
    );
  }

  const tenant = (await getTenantById(user.tenantId))!;
  const [engine, byMeasure] = await Promise.all([
    runReview(user.tenantId),
    automationReview(user.tenantId, hourlyRate(tenant.ceilings)),
  ]);

  return (
    <Shell
      title="What a process could do"
      subtitle={`${tenant.name} — every job in the business, what to build, and what to protect.`}
    >
      {String(sp.needsreason ?? '') === '1' && (
        <p className="mb-4 rounded-lg bg-cream p-3 text-sm text-ink">
          A rejection needs one line saying why, so it can be revisited later rather than re-argued
          from scratch. Nothing was changed.
        </p>
      )}

      {/*
        Two grains of the same question, in the order a leader needs them.

        The ENGINE is first: tasks, which are what somebody actually builds. Below it, the same
        business read at the level of the scorecard — which is the grain a leader already thinks in,
        and the one that answers "so what does this mean for that person's card".
      */}
      <ReviewEngine review={engine} />

      <h2 className="mt-8 font-serif text-xl text-ink">And how each scorecard reads</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        The same business at the other grain: not the work, but the measures each role is judged on.
      </p>
      <div className="mt-3">
        <AutomationReview review={byMeasure} saved={String(sp.saved ?? '') === '1'} />
      </div>
    </Shell>
  );
}

/**
 * What an hour costs, if the business has ever said.
 *
 * It rides on the ceilings JSON because that is the one place a business already tells SPEC about
 * money per level, and adding a second place to say it would guarantee the two disagreed. Missing
 * is the ordinary case and produces hours with no dollar figure beside them, which is the honest
 * output — see lib/automation.saving on why no rate is ever assumed.
 */
function hourlyRate(ceilings: string | null): number | null {
  if (!ceilings) return null;
  try {
    const parsed = JSON.parse(ceilings) as { hourly_rate?: number };
    const rate = parsed.hourly_rate;
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
