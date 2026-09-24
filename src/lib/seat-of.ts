/**
 * Which seat the signed-in person is in — the one database read behind `lib/sight`.
 *
 * Kept apart from `lib/sight` so the rules there stay pure and testable without a database, the
 * same split every other pair in this codebase uses (`lib/coverage` and `lib/coverage-data`,
 * `lib/today` and `lib/today-data`).
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getScope } from './scope';
import { resolveSeatKind, type SeatKind } from './chart-seats';
import { seatOf, type Seat } from './sight';
import type { CurrentUser } from './auth';

/**
 * Three sources, in order of how deliberate each one is.
 *
 * The subcontractor tick and an explicit seat kind were both typed by somebody setting this
 * business up, so they win. The chart is the fallback: a role with people under it is leadership,
 * and that is a reasonable guess rather than a decision.
 *
 * ── Fails closed ────────────────────────────────────────────────────────────────────────────────
 *
 * Somebody with no staff row and no place on the chart resolves to `team`, not to leadership.
 * Money is the thing being protected here, so the direction of the unknown case matters more than
 * it usually does: an account SPEC cannot identify sees the work and not the numbers.
 */
export async function seatFor(user: CurrentUser): Promise<Seat> {
  const [person] = await db
    .select({ isSubcontractor: schema.staff.isSubcontractor, seatKind: schema.staff.seatKind })
    .from(schema.staff)
    .where(and(eq(schema.staff.tenantId, user.tenantId), eq(schema.staff.userId, user.id)));

  if (person?.isSubcontractor) return 'subcontractor';

  /* An explicit leadership or team mark on the person beats whatever the chart implies. */
  if (person?.seatKind === 'leadership' || person?.seatKind === 'team') {
    return seatOf({ isSubcontractor: false, seatKind: person.seatKind });
  }

  const scope = await getScope(user);
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  if (!mine) return 'team';

  /*
    `resolveSeatKind` rather than a second rule of my own. It is the one place that already decides
    this — an administrator's stated override beats the chart, and null defers to it — and billing
    has read it since 23 September. Two rules for what a leadership seat IS would disagree the first
    time somebody used the override, and the half that decides sight would be the half nobody
    noticed had gone stale.
  */
  const hasDirectReports = scope.roles.some(r => r.reportsToRoleId === mine.id);
  const override = mine.holder?.seatKindOverride;
  const fromChart: SeatKind = resolveSeatKind(
    { title: mine.title, hasDirectReports },
    override === 'leadership' || override === 'team' ? override : null,
  );
  return seatOf({ isSubcontractor: false, seatKind: fromChart });
}
