import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { RecommendCard } from '@/components/recommends';
import { setMeetingSchedule } from '@/app/meeting/actions';
import { ensureReport, latestReport, scheduleFor } from '@/lib/make-it-simple-data';
import { recommendationFor } from '@/lib/recommends-data';
import { DAY_NAMES, simpleTopic } from '@/lib/make-it-simple';
import { GUARANTEE } from '@/lib/switch';

/**
 * Make it simple — the report the COGS meeting opens with, first on its agenda.
 *
 * One page, four parts, plain words: what got simpler, the top three still complicated (each a live
 * Claude recommends card the room can say yes to — yes makes it an action with an owner), what is
 * ready to switch, and any friction logged against the Simple Guarantee. Last week's accepted fixes
 * are tracked to done. See lib/make-it-simple.
 */
export async function MakeItSimple({ tenantId, owners, mayReadAutomation }: {
  tenantId: string;
  /** The people in the room — who can own an action. */
  owners: string[];
  /** The GM and the board only — the person-or-process review is theirs (lib/automation). */
  mayReadAutomation: boolean;
}) {
  await ensureReport(tenantId);
  const [report, schedule] = await Promise.all([latestReport(tenantId), scheduleFor(tenantId)]);
  const recs = report
    ? (await Promise.all(report.frictions.map(f => recommendationFor(tenantId, simpleTopic(f.key))))).filter(r => r !== null)
    : [];

  return (
    <section className="card grid gap-4" data-make-it-simple>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl text-ink">Make it simple</h2>
        <span className="label-caps">
          First item · {report?.schedule ? `for ${report.schedule}` : report ? `week of ${report.meetingDate}` : 'this week'}
        </span>
      </div>

      {/* Asked once, when it is relevant: the report is ready the day before the meeting it is for. */}
      {!schedule.day && (
        <form action={setMeetingSchedule} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3.5 py-2.5 text-sm" data-schedule-ask>
          <span className="text-ink">When does this meeting sit? The report runs every Monday until you say.</span>
          <select name="day" required aria-label="Meeting day" className="rounded-lg border border-ink/20 bg-surface px-2 py-1">
            {DAY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
          <input name="time" type="time" defaultValue="07:30" aria-label="Meeting time" className="rounded-lg border border-ink/20 bg-surface px-2 py-1" />
          <SubmitButton className="btn-secondary px-3 py-1.5 text-xs">Set it</SubmitButton>
        </form>
      )}

      {!report ? (
        <p className="text-sm text-ink-light">This week’s report is written the day before the meeting.</p>
      ) : (
        <>
          <div data-simple-part="simpler">
            <h3 className="font-serif text-lg text-ink">1 · What got simpler this week</h3>
            <ul className="mt-1 grid gap-0.5 text-sm text-ink">{report.simpler.map(l => <li key={l}>{l}</li>)}</ul>
          </div>

          <div data-simple-part="frictions">
            <h3 className="font-serif text-lg text-ink">2 · Still complicated</h3>
            {recs.length ? (
              <div className="mt-2 grid gap-3">
                {recs.map(r => <RecommendCard key={r.topic} rec={r} tenantId={tenantId} back="/meeting" owners={owners} />)}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink">Nothing SPEC can count is causing friction this week.</p>
            )}
          </div>

          <div data-simple-part="ready">
            <h3 className="font-serif text-lg text-ink">3 · Ready to switch or automate</h3>
            {report.ready.length ? (
              <ul className="mt-1 grid gap-0.5 text-sm">
                {report.ready.map(r => <li key={r.area + r.line}><Link href={r.href} className="text-ink hover:text-rust">{r.line} &rarr;</Link></li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink">Nothing is waiting to switch.</p>
            )}
            {mayReadAutomation && (
              <p className="mt-1 text-sm">
                <Link href="/org/automation" className="text-rust-700 hover:underline">What a process could take off the team, role by role &rarr;</Link>
                <span className="block text-xs text-ink-light">Kept to the GM and the board, so it is not on this report.</span>
              </p>
            )}
          </div>

          <div data-simple-part="guarantee">
            <h3 className="font-serif text-lg text-ink">4 · Simple Guarantee</h3>
            {report.guarantee.lines.length ? (
              <>
                <ul className="mt-1 grid gap-0.5 text-sm text-ink">{report.guarantee.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                <p className="mt-1 text-xs text-ink-light">Recorded as your claim for {report.guarantee.months.join(', ')}. {GUARANTEE}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink">No friction logged this week.</p>
            )}
          </div>

          {report.tracked.length > 0 && (
            <div data-simple-part="tracked">
              <h3 className="font-serif text-lg text-ink">Last week’s fixes</h3>
              <ul className="mt-1 grid gap-0.5 text-sm">
                {report.tracked.map((t, i) => (
                  <li key={i} className={t.done ? 'text-ink' : 'text-ink-light'}>{t.done ? '✓' : '○'} {t.text} — {t.owner}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
