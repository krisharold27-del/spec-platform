import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getScorecard } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { TechDayPhone, type ClearToWork } from '@/components/tech-day-phone';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Today — siteVIP' };

/**
 * The tech's day, on the phone — designs/SPEC Tech Day.dc.html.
 *
 *   Sign the SWMS → Start the job → Add photos → Materials used → Client sign-off → Finish
 *
 * and the timesheet builds itself from Start and Finish. The rules for that order live in
 * lib/tech-day and are tested there; the phone component is only the buttons.
 *
 * ── What is real and what is not, yet ─────────────────────────────────────────────────────────────
 *
 * Real: who you are, and whether you are clear to work — read from the Compliance pillar of your own
 * role's card this month, exactly as /site reads it for a crew.
 *
 * Not yet: there is no jobs, SWMS, photo or timesheet store behind this page. Jobs are being built as
 * their own part of SPEC (designs/SPEC Jobs.dc.html). Until those land, the tech names the job they
 * are on, the day is kept on this phone, and the page SAYS so on every screen where somebody might
 * otherwise believe the office already has their hours. When the store arrives, the job list comes
 * from the schedule and each tap is written through — the steps and their rules do not change.
 */
export default async function TechDay() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  /*
    Clear to work, for this person only. Guarded: the day on the phone must still open when the card
    cannot be read — no signal to the database is not a reason to stop somebody signing a SWMS. An
    unread card is "not recorded", never "not clear". Pending is never red.
  */
  let clear: ClearToWork = { state: 'unknown', blocked: [] };
  try {
    const scope = await getScope(user);
    const period = await currentPeriod(user.tenantId);
    const mine = scope.myRoleId ? scope.roles.find(r => r.id === scope.myRoleId) ?? null : null;
    if (mine && period) {
      const { rows } = await getScorecard(mine.id, period.id);
      if (isScored(mine.level, rows.length, mine.isTeam)) {
        const compliance = rows.filter(r => r.pillar === 'compliance');
        const blocked = compliance.filter(r => r.answer === 'N').map(r => r.text);
        const marked = compliance.some(r => r.answer === 'Y');
        clear = blocked.length ? { state: 'not_clear', blocked } : marked ? { state: 'clear', blocked: [] } : clear;
      }
    }
  } catch {
    // Left as 'unknown' — see above.
  }

  const firstName = (user.name ?? '').trim().split(/\s+/)[0] || '';
  return <TechDayPhone userId={user.id} name={user.name ?? ''} firstName={firstName} clear={clear} />;
}
