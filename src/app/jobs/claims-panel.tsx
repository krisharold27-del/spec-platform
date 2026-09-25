import Link from 'next/link';
import { WHY_YOURS, NOT_SET_YET, CLIENT_NOT_BUILDER, isSetUp } from '@/lib/claims';
import { LIGHT_COLOUR } from '@/lib/today';
import type { ClaimsView } from '@/lib/claims-data';

/**
 * Progress claims, retentions and defects — the money a project is owed and has not been paid.
 *
 * ── What this screen is actually for ─────────────────────────────────────────────────────────────
 *
 * Not a list of claims. A list of claims is something a business already has, in its accounting
 * system, and looking at it tells them nothing they did not know. What they do not have is somebody
 * counting the days — and under every Security of Payment Act, a client who misses the window to
 * respond generally loses the right to argue about the amount. That is the single most valuable
 * fact in this part of the product and it is the one small businesses most often miss, because
 * missing it requires nothing more than nobody looking for three weeks.
 *
 * So what comes first is what needs somebody today, worst first. Everything else is below it.
 *
 * ── SPEC does not know your Act ──────────────────────────────────────────────────────────────────
 *
 * Eight states, eight Acts, different wording and different windows, all of it changing. Until the
 * business sets theirs, this screen tracks the claims and refuses to say whether any of them is
 * late — see the note at the top of lib/claims. A deadline SPEC invented would be worse than none.
 */
export function ClaimsPanel({ view }: { view: ClaimsView }) {
  const needing = new Set(view.attention.map(w => w.claim.id));
  const rest = view.claims.filter(w => !needing.has(w.claim.id));

  return (
    <div className="grid gap-8" data-claims>
      {/* ── What needs somebody ─────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-serif text-2xl text-ink">Progress claims</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.claimsSays}</p>

        {!view.setUp && (
          <div className="mt-3 rounded-xl border border-sand-300 bg-sand-50 p-4" data-claims-not-set>
            <p className="text-sm text-ink">{NOT_SET_YET}</p>
            <p className="mt-2 text-sm text-ink-light">{WHY_YOURS}</p>
            <Link href="/settings#sopa" className="mt-2 inline-block text-sm text-rust-700 hover:underline">
              Set it once &rarr;
            </Link>
          </div>
        )}

        {view.attention.length > 0 && (
          <ul className="mt-4 grid gap-3" data-claims-attention>
            {view.attention.map(w => (
              <li
                key={w.claim.id}
                className="card-inset grid gap-1 border-l-4"
                style={{
                  borderLeftColor: w.state === 'schedule_missed' || w.state === 'overdue'
                    ? LIGHT_COLOUR.red
                    : w.state === 'scheduled_short' ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending,
                }}
                data-claim={w.claim.id}
                data-claim-state={w.state}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-lg text-ink">
                    {w.claim.jobRef} · claim {w.claim.number}
                  </span>
                  <span className="label-caps">{w.claim.client}</span>
                </div>
                <span className="text-sm text-ink">{w.says}</span>
                {w.nextStep && (
                  <span className="text-sm font-semibold text-ink" data-claim-next>{w.nextStep}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/*
          Every other claim, listed plainly.

          The first version showed only what needed somebody — which meant a business that had not
          set its Act saw no claims at all, because with no window SPEC will not say anything is
          late and nothing reached the attention list. Refusing to give a verdict is right; refusing
          to show the business its own claims is not, and it made the screen look broken on the one
          day it most needed to be trusted.
        */}
        {rest.length > 0 && (
          <ul className="mt-4 grid gap-2" data-claims-rest>
            {rest.map(w => (
              <li key={w.claim.id} className="card-inset grid gap-0.5" data-claim={w.claim.id} data-claim-state={w.state}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-base text-ink">
                    {w.claim.jobRef} · claim {w.claim.number}
                  </span>
                  <span className="label-caps">{w.claim.client}</span>
                </div>
                <span className="text-sm text-ink-light">{w.says}</span>
              </li>
            ))}
          </ul>
        )}

        {view.claims.length === 0 && (
          <p className="mt-3 text-sm text-ink-light">No progress claims out.</p>
        )}
      </section>

      {/* ── Retention ───────────────────────────────────────────────────────────────────────── */}
      <section data-retentions>
        <h2 className="font-serif text-2xl text-ink">Retention</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.retentionSays}</p>
        {view.dueBack.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {view.dueBack.map(r => (
              <li key={r.jobId} className="card-inset grid gap-1" data-retention={r.jobId}>
                <span className="font-serif text-base text-ink">
                  {r.jobRef} · ${Math.round(r.heldCents / 100).toLocaleString('en-AU')} from {r.client}
                </span>
                <span className="text-sm text-ink-light">{r.releaseTerms}</span>
              </li>
            ))}
          </ul>
        )}
        {view.closing.length > 0 && (
          <ul className="mt-3 grid gap-2" data-retention-closing>
            {view.closing.map(line => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Defects ─────────────────────────────────────────────────────────────────────────── */}
      <section data-defects>
        <h2 className="font-serif text-2xl text-ink">Defects</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{view.defectsSays}</p>
        {view.carried.length > 0 && (
          <p className="mt-2 max-w-3xl text-sm text-ink-light">
            Free to the client is not free to you — it is a van, two people and a day. Counted here
            so the margin on the job is the real one.
          </p>
        )}
        {view.openDefects.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {view.openDefects.map(d => (
              <li key={d.id} className="card-inset grid gap-0.5" data-defect={d.id}>
                <span className="font-serif text-base text-ink">{d.jobRef} · {d.what}</span>
                <span className="text-xs text-ink-light">
                  Raised {d.raisedAt.slice(0, 10)}{d.freeToUs ? ' · ours to carry' : ' · charged'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-3xl text-xs text-ink-light">{CLIENT_NOT_BUILDER}</p>
    </div>
  );
}

export { isSetUp };
