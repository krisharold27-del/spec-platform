import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { Badge } from '@/components/ui';
import { readGoal, adoptKpi, dismissKpi } from '@/app/org/cascade-actions';
import type { CascadeView } from '@/lib/cascade-data';

/**
 * Predictive KPIs from the goal.
 *
 * Built to designs/SPEC Org Chart: "The goal only means something once it is broken into what each
 * role has to actually move. This is that cascade, once structure is approved."
 *
 * ── Read top down, because the order IS the argument ─────────────────────────────────────────────
 *
 * "Net profit 10%" sits with the General Manager and means nothing on its own. It becomes real one
 * level at a time, and reading it from the top is what shows a supervisor why their billable hours
 * are the goal rather than a number somebody made up. Grouping by pillar instead would produce a
 * list of KPIs, which the business already has and is not what anybody is short of.
 *
 * ── Why a target here is never an agreed target ──────────────────────────────────────────────────
 *
 * Adopting a row writes the number into `proposedTarget` and leaves the agreed target empty, so the
 * negotiation happens the way it does for every other KPI: "a target is agreed with whoever holds
 * the role, never imposed on them." The panel says so out loud, because a suggested number that
 * looks settled is one nobody argues with — and the argument is the point.
 */
export function Cascade({ view, goalsSet, canEdit, read }: {
  view: CascadeView; goalsSet: boolean; canEdit: boolean;
  /** How many rows the last reading added, or null when none has been asked for. */
  read: number | null;
}) {
  /*
    No goals, no cascade. The whole object is "the goal, broken down", and without one there is
    nothing to break down — so this sends somebody to set them rather than showing an empty frame
    or, worse, inventing a goal to cascade from.
  */
  if (!goalsSet) {
    if (!canEdit) return null;
    return (
      <section aria-label="Predictive KPIs from the goal" className="card mt-6">
        <h2 className="font-serif text-lg text-ink">Predictive KPIs from the goal</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-light">
          A goal only means something once it is broken into what each role has to actually move.
          Say what winning looks like first and SPEC can work it down the chart.
        </p>
        <Link href="/setup/goals" className="btn-primary mt-4 inline-block">Set the goals</Link>
      </section>
    );
  }

  if (view.rows.length === 0) {
    if (!canEdit) return null;
    return (
      <section aria-label="Predictive KPIs from the goal" className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">Predictive KPIs from the goal</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-light">
              {read === 0 ? (
                /*
                  A reading that found nothing must say so. It looked like a button that did
                  nothing, which is the worst thing a button can do — and the answer itself is a
                  good one: every scored role measures all four pillars and every KPI has a number
                  against it.
                */
                <>Nothing new. Every scored role measures all four pillars and every KPI on them has
                a number agreed against it — which is what a chart serving its goal looks like.</>
              ) : view.goal ? (
                <>The goal — <b className="text-ink">{view.goal}</b> — only means something once it is
                broken into what each role has to actually move. This is that cascade, once structure
                is approved.</>
              ) : (
                <>The goal only means something once it is broken into what each role has to actually
                move.</>
              )}
            </p>
          </div>
          <form action={readGoal}>
            <SubmitButton className="btn-primary">Work the goal down the chart</SubmitButton>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Predictive KPIs from the goal" className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Predictive KPIs from the goal</h2>
        <span className="label-caps">{view.rows.length} to decide</span>
      </div>
      {view.goal && (
        <p className="mt-2 max-w-3xl text-sm text-ink-light">
          The goal — <b className="text-ink">{view.goal}</b> — only means something once it is broken
          into what each role has to actually move. This is that cascade, read from the top of the
          chart down.
        </p>
      )}

      {/*
        Said plainly when the cascade is the smaller, honest reading rather than the real one.

        Turning free text like "margin above 32%" into a number for a Site Supervisor is a judgement
        about a trade, and arithmetic on an org chart cannot produce it. Without a key SPEC names
        where the goal is at RISK instead — which is true, checkable, and not the same thing. Saying
        so is the difference between a limitation and a lie.
      */}
      {!view.fromClaude && (
        <p className="callout mt-4 max-w-3xl text-sm text-ink">
          These are the places the goal has nobody moving it: a pillar with nothing measuring it, or
          a measure with no number agreed against it. <b>SPEC will not invent the number</b> — what
          it should be is a conversation with whoever holds the seat. Turn on the assistant and it
          proposes the measure and the figure as well.
        </p>
      )}

      <ul className="mt-5 grid gap-2.5">
        {view.rows.map(r => (
          <li key={r.id} className="card-inset flex flex-wrap items-start gap-4">
            {/* The product's own pillar mark. Inside SPEC a pillar is a LETTER, never a colour —
                see the note at the top of lib/pillars — so this uses the same badge every other
                screen does rather than inventing a coloured tile for this one list. */}
            <span className="mt-0.5 shrink-0"><Badge pillar={r.pillar} /></span>

            <span className="grid min-w-[180px] flex-1 gap-1">
              <span className="font-serif text-[15px] text-ink">{r.roleTitle}</span>
              <span className="text-sm text-ink">{r.metric}</span>
              <span className="text-xs leading-5 text-ink-light">{r.why}</span>
            </span>

            {r.target && (
              <span className="grid shrink-0 gap-0.5 text-right">
                <span className="label-caps">Proposed</span>
                <span className="font-serif text-lg text-ink">{r.target}</span>
              </span>
            )}

            {canEdit && (
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {/*
                  A row with a number can be taken. A row WITHOUT one cannot — there is nothing to
                  adopt, because SPEC does not know what the number should be. Sending somebody to
                  the role's own KPI page is the honest action: the row named the gap, and the
                  target is settled with whoever holds the seat. A button reading "add" here would
                  promise to do something the software cannot do.
                */}
                {r.target ? (
                  <form action={adoptKpi}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="btn-primary text-sm">Add to scorecard</SubmitButton>
                  </form>
                ) : (
                  <Link href={`/setup/kpis?role=${r.roleId}`} className="btn-primary text-sm">
                    Agree the number
                  </Link>
                )}
                <form action={dismissKpi}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton className="rounded-full border border-ink/20 px-4 py-2 text-sm text-ink hover:border-rust hover:text-rust">
                    Not this one
                  </SubmitButton>
                </form>
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 max-w-3xl text-xs leading-5 text-ink-light">
        A number here is <b>proposed</b>, never agreed. Adding one puts it on that role&rsquo;s
        scorecard with the figure on record as a proposal — the agreed target is settled with
        whoever holds the seat, on{' '}
        <Link href="/setup/kpis" className="underline hover:text-rust">their KPIs</Link>. A row you
        drop is never suggested again.
      </p>
    </section>
  );
}
