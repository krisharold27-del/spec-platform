import {
  ACCOUNTANT_CLAIMS_IT, WHY_NO_FIGURE, NOTHING_OVER_45, stateOf, foundLine,
} from '@/lib/owed';
import {
  CARD_NOT_ISSUED, CARD_ROLES, NOT_APPRENTICES, BLOCKED, CARD_IS_NOT_PAUSED,
  EVERY_SPEND_PICKS_A_JOB, remindLeader, limitFor,
} from '@/lib/angus-card';
import { LIGHT_COLOUR } from '@/lib/today';
import type { OwedView } from '@/lib/owed-data';

/**
 * Money you're owed, the debtors that need a call, and the Angus Card policy.
 *
 * ── The shape of the first section is the argument ───────────────────────────────────────────────
 *
 * Every row leads with the BASIS — what SPEC actually saw — and the amount is an extra. That is the
 * opposite of how a tax-claim screen normally looks, and it is deliberate: the thing an owner takes
 * to their accountant is "diesel in nine utes and two generators, July to September", which is
 * checkable. A dollar figure nobody can trace back to a rate is worth less than nothing, because it
 * looks like it was worked out.
 *
 * ── The card section says what is not true yet ───────────────────────────────────────────────────
 *
 * SPEC cannot issue a card. There is no card-issuing partner. A screen that implied otherwise would
 * be the product claiming something happened that did not, which is the failure
 * `tests/no-false-feed.test.ts` exists to catch — so the section opens by saying so.
 */
export function OwedPanel({ view, send }: {
  view: OwedView;
  send: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-10" data-owed>
      {/* ── Money you're owed ───────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-serif text-3xl text-ink">Money you’re owed</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.owed.says}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink-light">{ACCOUNTANT_CLAIMS_IT}</p>

        {view.owed.found.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {view.owed.found.map(f => (
              <li key={f.kind.key} className="card-inset grid gap-1" data-owed-claim={f.kind.key} data-owed-state={stateOf(f)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-lg text-ink">{f.kind.label}</span>
                  {f.sentAt && <span className="label-caps">With the accountant</span>}
                </div>
                <span className="text-sm text-ink">{foundLine(f)}</span>
                <span className="text-xs text-ink-light">{f.kind.theirs}</span>
                {!f.sentAt && (
                  <form action={send} className="mt-1">
                    <input type="hidden" name="claimKey" value={f.kind.key} />
                    <button className="rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ink">
                      Send to the accountant
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 max-w-3xl text-xs text-ink-light">{WHY_NO_FIGURE}</p>
      </section>

      {/* ── Who owes us ─────────────────────────────────────────────────────────────────────── */}
      <section data-debtors>
        <h2 className="font-serif text-3xl text-ink">Who owes you</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.debtorsSays}</p>
        {view.debts.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {view.debts.map(w => (
              <li
                key={w.debt.id}
                className="card-inset grid gap-0.5 border-l-4"
                style={{
                  borderLeftColor: w.action === 'bad_debt' || w.action === 'owner_rings'
                    ? LIGHT_COLOUR.red : LIGHT_COLOUR.amber,
                }}
                data-debt={w.debt.id}
                data-debt-action={w.action}
              >
                <span className="font-serif text-base text-ink">{w.debt.client} · {w.debt.ref}</span>
                <span className="text-sm text-ink">{w.says}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 max-w-3xl text-xs text-ink-light">{NOTHING_OVER_45}</p>
      </section>

      {/* ── The Angus Card ──────────────────────────────────────────────────────────────────── */}
      <section data-card>
        <h2 className="font-serif text-3xl text-ink">Angus Card</h2>
        {/* First, because the alternative is a screen implying something exists that does not. */}
        <p className="mt-1 max-w-3xl text-sm text-ink" data-card-not-issued>{CARD_NOT_ISSUED}</p>

        <h3 className="mt-5 font-serif text-lg text-ink">Who gets one, and for how much</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.limitsReady.says}</p>
        <ul className="mt-3 grid gap-2">
          {CARD_ROLES.map(r => {
            const limit = limitFor(view.limits, r.key);
            return (
              <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-2 text-sm" data-card-role={r.key}>
                <span className="text-ink">{r.label}</span>
                <span className="text-ink-light">
                  {limit === null ? 'No limit set' : `$${Math.round(limit / 100).toLocaleString('en-AU')} a month`}
                  {' · '}{r.because}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 max-w-3xl text-xs text-ink-light" data-card-apprentices>{NOT_APPRENTICES}</p>

        <h3 className="mt-5 font-serif text-lg text-ink">What the card refuses</h3>
        <ul className="mt-2 grid gap-1">
          {BLOCKED.map(b => (
            <li key={b.key} className="text-sm text-ink-light" data-card-blocked={b.key}>
              <span className="text-ink">{b.label}</span> · {b.because}
            </li>
          ))}
        </ul>

        <h3 className="mt-5 font-serif text-lg text-ink">Spend</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.card.says}</p>
        {view.card.spends.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {view.card.spends.slice(0, 12).map(w => (
              <li key={w.spend.id} className="card-inset grid gap-0.5" data-card-spend={w.spend.id} data-card-state={w.state}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-base text-ink">{w.spend.who}</span>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: w.state === 'blocked' ? LIGHT_COLOUR.red
                        : w.state === 'uncoded' || w.state === 'no_receipt' ? LIGHT_COLOUR.amber
                          : LIGHT_COLOUR.green,
                    }}
                  >
                    {w.state === 'blocked' ? 'Blocked'
                      : w.state === 'uncoded' ? 'No job'
                        : w.state === 'no_receipt' ? 'No receipt'
                          : w.state === 'late_receipt' ? 'Receipt late' : 'In order'}
                  </span>
                </div>
                <span className="text-sm text-ink">{w.says}</span>
                {remindLeader(w) && (
                  <span className="text-xs text-ink-light" data-card-remind>{remindLeader(w)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 max-w-3xl text-xs text-ink-light">{EVERY_SPEND_PICKS_A_JOB}</p>
        <p className="mt-1 max-w-3xl text-xs text-ink-light">{CARD_IS_NOT_PAUSED}</p>
      </section>
    </div>
  );
}
