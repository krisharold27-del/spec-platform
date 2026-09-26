import { CHECKS, APPROVER_ROLE, ANY_CYCLE, ODDITIES_GO_TO_THE_SUPERVISOR, NEEDS_A_CHECK_DATE, changeLine } from '@/lib/pay-run';
import { ASK, YES, CHECK, gentle } from '@/lib/gentle';
import { LIGHT_COLOUR } from '@/lib/today';
import type { PayRunView } from '@/lib/pay-run-data';

/**
 * The pay run, and the seven checks that have to pass before it can be approved.
 *
 * ── Why the button is absent rather than disabled ────────────────────────────────────────────────
 *
 * A disabled button is a promise that the thing is nearly allowed. It invites somebody to find out
 * what would enable it, and — more to the point — a disabled attribute is one devtools window away
 * from gone, so a guard that lives in the markup is not a guard.
 *
 * The button is not rendered, and the server refuses independently. Both, because either one alone
 * is the kind of protection that works right up until it matters.
 *
 * ── The checks are shown even when they pass ─────────────────────────────────────────────────────
 *
 * Tempting to collapse seven green ticks into "all checks passed" and save the space. It is the
 * wrong call: the person approving a pay run is signing that these seven things were done, and a
 * summary sentence is something to skim. Seven rows, each naming what it verified, is the thing
 * they are actually agreeing to.
 */
export function PayRunPanel({ view, approve, manage }: {
  view: PayRunView;
  approve: (fd: FormData) => Promise<void>;
  manage: boolean;
}) {
  const { reading } = view;

  return (
    <section className="card p-6 sm:p-8" data-pay-run>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl text-ink">The pay run</h2>
        {view.fromDate && (
          <span className="label-caps">{view.fromDate} to {view.toDate}</span>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">{reading.says}</p>

      {view.approvedAt ? (
        <p className="mt-3 text-sm text-ink">
          Approved by {view.approvedBy} on {view.approvedAt.slice(0, 10)}.
        </p>
      ) : null}

      {/* ── The seven ──────────────────────────────────────────────────────────────────────── */}
      <ul className="mt-5 grid gap-2" data-pay-checks>
        {reading.results.map(r => {
          const check = CHECKS.find(c => c.key === r.key)!;
          const colour = r.state === 'passed' ? LIGHT_COLOUR.green
            : r.state === 'failed' ? LIGHT_COLOUR.red
              : LIGHT_COLOUR.pending;
          return (
            <li key={r.key} className="card-inset grid gap-1" data-pay-check={r.key} data-state={r.state}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
                <span className="font-serif text-base text-ink">{check.label}</span>
                {r.who && <span className="text-xs text-ink-light">· {r.who}</span>}
              </div>
              <span className="text-sm text-ink-light">{check.verifies}</span>
              {r.state !== 'passed' && (
                <>
                  <span className="text-sm" style={{ color: LIGHT_COLOUR.red }}>{r.says}</span>
                  <span className="text-xs text-ink-light">{check.ifSkipped}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Approve, or why not ─────────────────────────────────────────────────────────────── */}
      <div className="mt-5" data-pay-approve>
        {reading.mayApprove && manage && !view.approvedAt && view.runId ? (
          <form action={approve}>
            <input type="hidden" name="runId" value={view.runId} />
            <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              Approve this pay run
            </button>
          </form>
        ) : view.approvedAt ? null : (
          /*
            No button at all. See the note at the top — a disabled one is a promise that this is
            nearly allowed, and it is not nearly allowed until all seven pass.
          */
          <p className="text-sm" style={{ color: LIGHT_COLOUR.red }} data-pay-blocked>
            {view.whyNot ?? 'Nothing can be approved until every check passes.'}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-light">
          {APPROVER_ROLE} approves. {ANY_CYCLE}
        </p>
      </div>

      {/* ── Things worth asking about ───────────────────────────────────────────────────────── */}
      {view.oddities.length > 0 && (
        <div className="mt-6" data-pay-oddities>
          <h3 className="font-serif text-lg text-ink">Worth a quick check</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">{ODDITIES_GO_TO_THE_SUPERVISOR}</p>
          <ul className="mt-3 grid gap-3">
            {view.oddities.map((o, i) => {
              const prompt = gentle(o.prompt, o.facts);
              return (
                <li key={`${o.who}-${i}`} className="card-inset grid gap-1" data-pay-oddity>
                  <span className="font-serif text-base text-ink">{o.who} — {o.what}</span>
                  {/*
                    The gentle prompt's exact wording. Never a red WRONG: these fire on things that
                    are genuinely sometimes correct, and a shutdown really is fourteen hours.
                  */}
                  <span className="text-sm font-semibold text-ink">{ASK}</span>
                  <span className="text-sm text-ink-light">{prompt.because}</span>
                  <span className="text-xs text-ink-light">{YES} · {CHECK}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── The rates payroll depends on ────────────────────────────────────────────────────── */}
      <div className="mt-6" data-pay-rates>
        <h3 className="font-serif text-lg text-ink">The rates this runs on</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.ratesReady.says}</p>
        <ul className="mt-3 grid gap-2">
          {view.rates.map(r => (
            <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-2 text-sm" data-pay-rate={r.key}>
              <span className="text-ink">{r.label}</span>
              <span className="text-ink-light">
                {r.value === null
                  ? 'Not set'
                  : `${r.value}${r.unit === 'percent' ? '%' : ''}${r.source ? ` · ${r.source}` : ' · no source recorded'}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-light">{NEEDS_A_CHECK_DATE}</p>
      </div>

      {/* ── A Fair Work change waiting to be accepted ───────────────────────────────────────── */}
      {view.pendingChanges.length > 0 && (
        <div className="mt-6" data-pay-changes>
          <h3 className="font-serif text-lg text-ink">A rate has changed</h3>
          <ul className="mt-2 grid gap-2">
            {view.pendingChanges.map(c => (
              <li key={c.key} className="text-sm text-ink" data-pay-change={c.key}>{changeLine(c)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-light">
            SPEC has seen this and has not applied it. You are the employer, not SPEC — and the day a
            rate changes mid-quarter, somebody has to know it happened.
          </p>
        </div>
      )}
    </section>
  );
}
