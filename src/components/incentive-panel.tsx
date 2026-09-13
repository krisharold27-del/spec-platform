import { PILLAR_META, scoreInk } from '@/lib/pillars';
import { DEDUCTION_PER_FAILED_PILLAR, DEDUCTION_CAP, FAILED_AT_OR_BELOW } from '@/lib/incentive';
import { money } from '@/lib/cockpit';
import type { IncentiveView } from '@/lib/incentive-data';

/**
 * What this month is worth, and exactly why.
 *
 * ── Why every number shows its working ───────────────────────────────────────────────────────────
 *
 * This is the screen a pay conversation happens in front of. A figure a manager cannot reconstruct
 * is a figure they will argue with, and they will be right to — "the system says $1,666" is not an
 * answer anybody should accept about their own money.
 *
 * So the ceiling, the percentage, the multiplication, each deduction and the cap are all on the
 * page. Nothing here is computed in this file: it renders what lib/incentive worked out, and the
 * rates come from that module's own constants so the explanation cannot drift from the arithmetic.
 *
 * Red on a card and a deduction are now the SAME line — at or under 50% for a quadrant. They were
 * apart for a while, red starting at 75% while money only moved at 50%, which meant somebody could
 * see three red quadrants and no deduction and reasonably conclude the software was broken. One
 * line is the simpler promise, and the `redButNotFailed` block below stays for the day they part
 * again: it renders nothing while there is nothing to explain.
 */
export function IncentivePanel({ view, period }: { view: IncentiveView; period: string }) {
  if (!view.inScheme) {
    return (
      <section className="card mt-8">
        <h2 className="font-serif text-xl text-ink">The monthly incentive</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-light">
          This role is not in the scheme, so nothing is calculated here. Directors are outside it by
          design — the people who set the standard are not paid against it.
        </p>
      </section>
    );
  }

  const perFailure = Math.round(DEDUCTION_PER_FAILED_PILLAR * 100);
  const capPct = Math.round(DEDUCTION_CAP * 100);
  const failLine = Math.round(FAILED_AT_OR_BELOW * 100);
  const atCap = view.deductionRate >= DEDUCTION_CAP;

  return (
    <section className="card mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">The monthly incentive</h2>
        <span className="label-caps">{period}</span>
      </div>

      {view.rolePct === null ? (
        <p className="mt-2 max-w-2xl text-sm text-ink-light">
          Nothing is scored yet this month, so there is nothing to pay against. This is not a
          zero-per-cent month — it is a month nobody has marked.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Figure label="Ceiling" value={money(view.ceiling)} note={`The ${view.level.replace(/_/g, ' ')} ceiling.`} />
            <Figure label="Your month" value={`${(view.rolePct * 100).toFixed(1)}%`} note="The percentage on this page, not hidden precision." />
            <Figure label="Earned" value={money(view.earned)} note={`${money(view.ceiling)} × ${(view.rolePct * 100).toFixed(1)}%`} />
            <Figure
              label="Payable"
              value={money(view.payable)}
              note={view.deductionRate > 0 ? `After ${Math.round(view.deductionRate * 100)}% deducted` : 'Nothing deducted.'}
              strong
            />
          </div>

          {/* The deductions, named. A count is an accusation; a list is a conversation. */}
          {view.failed.length > 0 ? (
            <div className="mt-6">
              <p className="text-sm text-ink">
                <b>{view.failed.length}</b> {view.failed.length === 1 ? 'quadrant' : 'quadrants'} beneath you
                failed — at or under {failLine}% — at {perFailure}% each
                {atCap ? `, capped at ${capPct}%.` : `, so ${Math.round(view.deductionRate * 100)}% comes off.`}
              </p>
              <ul className="mt-3 grid gap-2">
                {view.failed.map((f, i) => (
                  <li key={`${f.roleTitle}-${f.pillar}-${i}`} className="card-inset flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">
                      {f.roleTitle}{f.person ? ` · ${f.person}` : ''}
                    </span>
                    <span className="text-sm font-medium" style={{ color: scoreInk(f.score) }}>
                      {PILLAR_META[f.pillar].name} {(f.score * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
              {atCap && (
                <p className="mt-3 text-xs text-ink-light">
                  At the cap. Further failures do not reduce this further — the deduction stops at
                  {' '}{capPct}%, because a scheme that can reach zero stops being an incentive.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink">
              Nothing beneath you failed this month, so nothing is deducted.
            </p>
          )}

          {/*
            Empty while red and a deduction mean the same thing. Kept because the two lines were
            apart once and may be again — and the day they are, this is what stops "three red
            quadrants and no deduction" reading as a bug.
          */}
          {view.redButNotFailed.length > 0 && (
            <div className="mt-6 rounded-lg bg-cream p-4">
              <p className="text-sm text-ink">
                {view.redButNotFailed.length === 1 ? 'One quadrant is' : `${view.redButNotFailed.length} quadrants are`} red
                on the chart and {view.redButNotFailed.length === 1 ? 'does' : 'do'} not affect this figure.
              </p>
              <p className="mt-1 text-xs text-ink-light">
                Those quadrants are red because they need attention. They only count as a failure,
                and only cost money, at or under {failLine}%. The colour asks for a conversation; the
                deduction is a consequence.
              </p>
              <ul className="mt-3 grid gap-1">
                {view.redButNotFailed.slice(0, 6).map((f, i) => (
                  <li key={`${f.roleTitle}-${f.pillar}-${i}`} className="text-xs text-ink-light">
                    {f.roleTitle} · {PILLAR_META[f.pillar].name} {(f.score * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-6 text-xs text-ink-light">
            Failures flow upward only: you are reduced for a team doing badly and never credited for
            one doing well. A quadrant nobody has scored is not a failure.
          </p>
        </>
      )}
    </section>
  );
}

function Figure({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <div className="card-inset">
      <span className="label-caps">{label}</span>
      <div className={`mt-1 font-serif ${strong ? 'text-3xl text-ink' : 'text-2xl text-ink'}`}>{value}</div>
      <p className="mt-1 text-xs text-ink-light">{note}</p>
    </div>
  );
}
