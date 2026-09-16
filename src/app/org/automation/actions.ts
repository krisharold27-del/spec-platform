'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { decide } from '@/lib/automation-data';
import { mayReadAutomationReview, type Verdict, type ReviewLevel } from '@/lib/automation';

const VERDICTS: Verdict[] = ['person', 'assisted', 'automated', 'unknown'];

/**
 * Record what the leader decided about one measure.
 *
 * ── The gate is here, not on the page ────────────────────────────────────────────────────────────
 *
 * The page hides itself from anybody below the top of the chart, and hiding a page is not access
 * control — this codebase says so in lib/permissions and has been caught by it before. So the same
 * question is asked again on the server, on the write path, where it actually counts.
 *
 * The level is read from the person's own role rather than from their access flag. A manager can
 * hold `full` access legitimately — that is how they score their team — and `full` must not become
 * a way to read, or change, a page about whether somebody's job still exists.
 */
export async function setVerdict(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  const level = (mine?.level === 'gm' || mine?.reportsToRoleId === null ? 'gm' : mine?.level) as ReviewLevel | undefined;
  if (!mayReadAutomationReview(level)) redirect('/today');

  const criterionId = String(form.get('criterionId') ?? '');
  const raw = String(form.get('verdict') ?? '');
  const verdict = VERDICTS.includes(raw as Verdict) ? (raw as Verdict) : null;

  /*
    Hours are taken exactly as typed, and a blank stays a blank.

    This is the only number in SPEC that becomes a dollar figure a leader would repeat to a board.
    Reading an empty box as nought would be fine; reading it as "about the same as last time", or
    filling it with an estimate, would not — and once one invented hour is in the total, the total
    is worth nothing. A bad number here is worse than no number.
  */
  const hoursRaw = String(form.get('hours') ?? '').trim();
  const hours = hoursRaw === '' ? null : Number(hoursRaw);
  const clean = hours !== null && Number.isFinite(hours) && hours >= 0 ? hours : null;

  if (!criterionId) redirect('/org/automation');

  await decide({
    tenantId: user.tenantId,
    criterionId,
    verdict,
    hours: clean,
    note: String(form.get('note') ?? '') || null,
    by: user.email,
  });

  revalidatePath('/org/automation');
  redirect('/org/automation?saved=1');
}
