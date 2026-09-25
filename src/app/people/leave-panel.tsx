import { KINDS, OWNER_IS_TOLD } from '@/lib/leave';
import { ASK, YES, CHECK, gentle } from '@/lib/gentle';
import { LIGHT_COLOUR } from '@/lib/today';
import type { SafeRequest } from '@/lib/leave-data';

/**
 * Leave requests waiting on a leader.
 *
 * ── What is deliberately not on this screen ──────────────────────────────────────────────────────
 *
 * The reason somebody is taking leave, unless the person reading is entitled to it. That is decided
 * in `lib/leave-data` and arrives here already decided — this component never receives the kind for
 * a viewer who may not see it, so it cannot leak one however it is later rewritten.
 *
 * ── Over balance asks, and then does it ──────────────────────────────────────────────────────────
 *
 * A request past somebody's balance is not refused. Leave in advance is a normal thing a good
 * employer does, and a system that refuses it just means the business does it in a text message and
 * payroll finds out in the run. What it must never be is accidental — so it takes a manager, it
 * uses the gentle prompt's exact wording, and the owner is told it happened.
 */
export function LeavePanel({ requests, approve, decline, manage }: {
  requests: SafeRequest[];
  approve: (fd: FormData) => Promise<void>;
  decline: (fd: FormData) => Promise<void>;
  manage: boolean;
}) {
  const waiting = requests.filter(r => r.state === 'asked');

  return (
    <section className="card p-6 sm:p-8" data-leave>
      <h2 className="font-serif text-2xl text-ink">Leave</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">
        {waiting.length === 0
          ? 'Nothing waiting on you.'
          : `${waiting.length} ${waiting.length === 1 ? 'request' : 'requests'} waiting. The person’s own leader decides — unless it is more than they have, which takes a manager.`}
      </p>

      {waiting.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {waiting.map(r => {
            const over = r.fits.verdict === 'over';
            const prompt = over
              ? gentle('leave_over', {
                who: r.who,
                balance: `${r.fits.balance} hours`,
                asked: `${r.hours} hours`,
              })
              : null;
            return (
              <li
                key={r.id}
                className="card-inset grid gap-2 border-l-4"
                style={{ borderLeftColor: over ? LIGHT_COLOUR.amber : LIGHT_COLOUR.green }}
                data-leave-request={r.id}
                data-leave-needs={r.needs}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-lg text-ink">{r.who}</span>
                  {/* The label, already decided for this viewer. Never the raw kind. */}
                  <span className="label-caps" data-leave-label>{r.label}</span>
                </div>
                <span className="text-sm text-ink">
                  {r.from === r.to ? r.from : `${r.from} to ${r.to}`} · {r.hours} hours
                </span>
                {r.reason && <span className="text-sm text-ink-light">{r.reason}</span>}
                <span className="text-sm text-ink-light">{r.fits.says}</span>

                {prompt && (
                  <div className="grid gap-1 rounded-lg bg-sand-100 p-3" data-leave-prompt>
                    {/* Never a red WRONG. The answer to this is often yes. */}
                    <span className="text-sm font-semibold text-ink">{ASK}</span>
                    <span className="text-sm text-ink-light">{prompt.because}</span>
                  </div>
                )}

                {manage && (
                  <div className="flex flex-wrap gap-2">
                    <form action={approve}>
                      <input type="hidden" name="id" value={r.id} />
                      {over && <input type="hidden" name="override" value="yes" />}
                      <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                        {over ? YES : 'Approve'}
                      </button>
                    </form>
                    <form action={decline}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ink">
                        {over ? CHECK : 'Decline'}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 max-w-3xl text-xs text-ink-light">{OWNER_IS_TOLD}</p>

      {/* The kinds, so a business can see what SPEC tracks and what it deliberately does not name. */}
      <div className="mt-5" data-leave-kinds>
        <h3 className="font-serif text-lg text-ink">What counts as leave here</h3>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {KINDS.map(k => (
            <li key={k.key} className="text-sm text-ink-light" data-leave-kind={k.key}>
              <span className="text-ink">{k.label}</span>
              {!k.accrues && ' · no balance'}
              {k.private && ' · shows only as “Leave” to anybody else'}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
