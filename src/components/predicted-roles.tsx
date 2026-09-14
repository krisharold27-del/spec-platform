import { SubmitButton } from '@/components/submit-button';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { readChart, approveRole, denyRole } from '@/app/org/predict-actions';
import type { PredictedRole } from '@/lib/predict-data';

/**
 * Predicted roles — approve or deny.
 *
 * Built to designs/SPEC Org Chart: "Claude's read of what this structure is still missing. Nothing
 * here counts as real until you say so — approve to add it to the chart, deny to drop it."
 *
 * ── Why nothing here looks like a role ───────────────────────────────────────────────────────────
 *
 * Dashed border, its own section above the chart, no pillar dots and no Ace run. A proposal that
 * looks like a card on the chart is a proposal somebody will read as a decision that has already
 * been made — and the entire value of this section is that it has NOT been. It is a colleague
 * saying "have you thought about a yard lead", not software adding one.
 *
 * Each one says where it came from, because the two deserve different amounts of trust. A structural
 * finding is arithmetic on this leader's own chart: a stream with no head, a pillar nobody measures.
 * They can check it by looking. Claude's is a judgement about their industry, and has to be taken on
 * trust. Labelling them the same would borrow the credibility of one for the other.
 */
export function PredictedRoles({
  predicted, read, canEdit,
}: { predicted: PredictedRole[]; read: number | null; canEdit: boolean }) {
  /*
    Nothing pending and nobody has asked: show only the invitation to look.

    A permanent empty "predicted roles" box on the screen a leader works in every day is clutter
    that ages badly — the same reason the account menu lost its "coming soon".
  */
  if (predicted.length === 0) {
    if (!canEdit) return null;
    return (
      <section aria-label="Predicted roles" className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">What is this chart missing?</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-light">
              {read === 0
                ? 'Nothing new. Every stream has an owner, every pillar has somebody measuring it, and no seat is carrying more reports than one person can hold. That is the answer a well-drawn chart should get.'
                : 'SPEC reads the structure against your goals and says which roles are missing, with a reason against each. Nothing is added until you approve it.'}
            </p>
          </div>
          <form action={readChart}>
            <SubmitButton className="btn-primary">Read the chart</SubmitButton>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Predicted roles" className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Predicted roles — approve or deny</h2>
        <span className="label-caps">{predicted.length} waiting</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink-light">
        SPEC&rsquo;s read of what this structure is still missing.{' '}
        <b>Nothing here counts as real until you say so</b> — approve to add it to the chart, deny to
        drop it. A denied role is never proposed again.
      </p>

      <ul className="mt-5 grid gap-3">
        {predicted.map(p => (
          <li
            key={p.id}
            className="rounded-2xl border-2 border-dashed border-ink/20 bg-cream p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-serif text-base text-ink">
                {p.title}
                {p.parentTitle && (
                  <span className="text-[13px] font-normal text-ink-light"> — under {p.parentTitle}</span>
                )}
              </span>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs"
                style={{
                  background: `color-mix(in srgb, ${LIGHT_COLOUR.pending} 16%, transparent)`,
                  color: LIGHT_INK.pending,
                }}
              >
                {p.source === 'claude' ? 'Predicted · a judgement' : 'Predicted · from your chart'}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-light">{p.why}</p>

            {canEdit && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                <form action={approveRole}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="btn-primary">Approve — add to chart</SubmitButton>
                </form>
                <form action={denyRole}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="rounded-full border border-ink/20 px-5 py-2 text-sm text-ink hover:border-rust hover:text-rust">
                    Deny
                  </SubmitButton>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-5 text-ink-light">
        An approved role arrives with no KPIs. What it measures is the next conversation — a
        scorecard that turned up already written is not the role holder&rsquo;s. A predicted role
        never carries a seat, however the structure moves.
      </p>
    </section>
  );
}
