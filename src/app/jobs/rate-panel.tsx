import { ASK, ACTIONS, ESTIMATOR_CHECKS_AND_SENDS, draftLine } from '@/lib/our-rate';
import { LIGHT_COLOUR } from '@/lib/today';
import type { RateView } from '@/lib/our-rate-data';

/**
 * Is our rate right? — and every lead priced before anybody asked.
 *
 * The question is the feature. SPEC does not know whether the market is wrong or the business is,
 * and a product that answered would be guessing about the one number an owner is most attached to.
 * What it can do is put both halves of the evidence on one screen — what others charge, and what
 * this business actually wins at — and make the question unavoidable.
 *
 * Two actions, because a rate change is reversible and a guess about one is not. "Hold" is a real
 * answer that gets recorded, so the question is not asked again next month as though nobody had
 * thought about it.
 */
export function RatePanel({ view }: { view: RateView }) {
  const { reading } = view;
  const loud = reading.verdict === 'cheap' || reading.verdict === 'dear';

  return (
    <div className="grid gap-8" data-rate>
      <section>
        <h2 className="font-serif text-2xl text-ink">Is our rate right?</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{reading.says}</p>

        {!view.hasMarket && (
          <p className="mt-2 max-w-3xl text-sm text-ink-light" data-rate-no-market>
            SPEC has no feed of what other electricians charge and will not invent one. Add what you
            have seen — a competitor’s published rate, a quote you lost — with where it came from,
            and the other half of this answer appears.
          </p>
        )}

        {loud && (
          <div
            className="mt-4 rounded-xl border-l-4 border border-sand-300 bg-sand-50 p-4"
            style={{ borderLeftColor: LIGHT_COLOUR.amber }}
            data-rate-ask
          >
            <p className="font-serif text-xl text-ink">{ASK}</p>
            <ul className="mt-3 grid gap-2">
              {ACTIONS.map(a => (
                <li key={a.key} className="text-sm" data-rate-action={a.key}>
                  <span className="font-semibold text-ink">{a.label}</span>
                  <span className="text-ink-light"> — {a.is}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {view.byType.length > 0 && (
        <section data-rate-types>
          <h3 className="font-serif text-lg text-ink">By kind of work</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">
            An overall win rate hides the thing that matters — winning every switchboard and losing
            every solar job reads the same as winning half of each.
          </p>
          <ul className="mt-3 grid gap-2">
            {view.byType.map(t => (
              <li key={t.row.jobType} className="card-inset grid gap-0.5" data-rate-type={t.row.jobType} data-rate-flag={t.flag}>
                <span className="font-serif text-base text-ink">{t.row.jobType}</span>
                <span className="text-sm text-ink">{t.says}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-rate-drafts>
        <h3 className="font-serif text-lg text-ink">Priced already</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{ESTIMATOR_CHECKS_AND_SENDS}</p>
        {view.drafts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">No enquiries waiting to be priced.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {view.drafts.map(d => (
              <li key={d.leadId} className="card-inset grid gap-0.5" data-rate-draft={d.leadId}>
                <span className="font-serif text-base text-ink">{d.title}</span>
                {/* The working is shown, so an estimator can disagree with it usefully. */}
                <span className="text-sm text-ink">{draftLine(d.draft)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
