import Link from 'next/link';
import {
  FIRMNESS_SAYS, holesLine, HOW_IT_DECIDES, IT_PROPOSES, WHY_A_MONTH, PLAN_DAYS,
  type Firmness,
} from '@/lib/schedule-ahead';
import { WHAT_IT_STILL_NEEDS, PUBLIC_HOLIDAYS_NOT_KNOWN } from '@/lib/schedule-ahead-data';
import type { AheadView } from '@/lib/schedule-ahead-data';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * The month ahead.
 *
 * ── What is on this screen, in order, and why that order ─────────────────────────────────────────
 *
 * The HOLES come first. A full week one is pleasant; "nobody is on anything for four days in week
 * three" is the output worth having, because it arrives while there is still time to sell something
 * into it. Every business that schedules a week at a time finds that hole in week three, when it is
 * a fortnight of wages instead of a fortnight of selling.
 *
 * Then what could NOT be placed, with a reason each. A scheduler that quietly drops what it could
 * not fit lets a business believe the month is covered, which is worse than no scheduler at all.
 *
 * Then the proposals, marked by how far out they are — and a day twenty-eight days away is
 * presented as a shape rather than a plan, because presenting it as confidently as tomorrow is how
 * a schedule stops being believed about tomorrow.
 *
 * ── It proposes ──────────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here books anything. Kris's own rule for work orders applies with more force to the
 * schedule: an automatic booking is a promise to a customer that nobody made.
 */
export function AheadPanel({ view }: { view: AheadView }) {
  const { plan } = view;
  const colour: Record<Firmness, string> = {
    firm: LIGHT_COLOUR.green,
    likely: LIGHT_COLOUR.amber,
    shape: LIGHT_COLOUR.pending,
  };

  return (
    <div className="grid gap-8" data-ahead>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl text-ink">The next {PLAN_DAYS} days</h2>
          <span className="label-caps">{plan.days.length} working days</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink" data-ahead-says>{plan.says}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink-light">{WHY_A_MONTH}</p>
      </section>

      {/* ── The holes, first ────────────────────────────────────────────────────────────────── */}
      <section data-ahead-holes>
        <h3 className="font-serif text-lg text-ink">Quiet stretches</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink">{holesLine(view.holes)}</p>
        {view.holes.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {view.holes.map(h => (
              <li
                key={h.from}
                className="card-inset grid gap-0.5 border-l-4"
                style={{ borderLeftColor: LIGHT_COLOUR.amber }}
                data-ahead-hole={h.from}
              >
                <span className="font-serif text-base text-ink">{h.from} to {h.to}</span>
                <span className="text-sm text-ink">{h.says}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── What could not be placed ────────────────────────────────────────────────────────── */}
      {plan.unfilled.length > 0 && (
        <section data-ahead-unfilled>
          <h3 className="font-serif text-lg text-ink">Could not be placed</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">
            Each of these has a reason, and the reasons need different things done about them.
          </p>
          <ul className="mt-3 grid gap-2">
            {plan.unfilled.map(u => (
              <li
                key={u.need.id}
                className="card-inset grid gap-0.5 border-l-4"
                style={{ borderLeftColor: LIGHT_COLOUR.red }}
                data-ahead-unfilled-why={u.why}
              >
                <span className="font-serif text-base text-ink">{u.need.ref} · {u.need.client}</span>
                <span className="text-sm text-ink">{u.says}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The proposals ───────────────────────────────────────────────────────────────────── */}
      {plan.proposals.length > 0 && (
        <section data-ahead-proposals>
          <h3 className="font-serif text-lg text-ink">Proposed</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">{IT_PROPOSES}</p>
          <ul className="mt-3 grid gap-2">
            {plan.proposals.map(p => (
              <li
                key={p.need.id}
                className="card-inset grid gap-0.5 border-l-4"
                style={{ borderLeftColor: colour[p.firmness] }}
                data-ahead-proposal={p.need.id}
                data-ahead-firmness={p.firmness}
              >
                <span className="font-serif text-base text-ink">{p.says}</span>
                <span className="text-xs text-ink-light">{FIRMNESS_SAYS[p.firmness]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── What SPEC still has to be told ──────────────────────────────────────────────────── */}
      {view.noDuration.length > 0 && (
        <section data-ahead-no-duration>
          <h3 className="font-serif text-lg text-ink">Not planned, because SPEC does not know how long</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink">
            {view.noDuration.length} {view.noDuration.length === 1 ? 'job is' : 'jobs are'} won and
            unscheduled, and nothing says how many days {view.noDuration.length === 1 ? 'it' : 'they'} take.
            SPEC will not assume a day — that would make every plan wrong in the same direction, quietly.
          </p>
          <ul className="mt-3 grid gap-1">
            {view.noDuration.slice(0, 10).map(n => (
              <li key={n.ref} className="text-sm text-ink-light" data-ahead-no-duration-row>
                {n.ref} · {n.what}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── How it decides ──────────────────────────────────────────────────────────────────── */}
      <section data-ahead-how>
        <h3 className="font-serif text-lg text-ink">How this is worked out</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink">{HOW_IT_DECIDES}</p>
        <p className="mt-2 max-w-3xl text-xs text-ink-light">{PUBLIC_HOLIDAYS_NOT_KNOWN}</p>
        <h4 className="mt-4 label-caps">What it still needs from you</h4>
        <ul className="mt-2 grid gap-2">
          {WHAT_IT_STILL_NEEDS.map(w => (
            <li key={w.what} className="text-sm" data-ahead-needs>
              <Link href={w.where} className="text-ink hover:text-rust">{w.what} &rarr;</Link>
              <span className="text-ink-light"> — {w.why}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
