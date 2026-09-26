import {
  complaintWatch, DISPUTE_PACK, DISPUTE_PACK_IS_ONE_TAP, match,
  LOCATION_ONLY_AT_THE_ENDS, ACCEPTED_NEVER_AUTOMATIC, waitingToAccept,
  type Complaint, type VehicleEvent, type WorkOrder,
} from '@/lib/round3';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * Complaints, disputes, work orders and what the utes cost.
 *
 * Four things that share a shape: each is a thing arriving from OUTSIDE the business that somebody
 * has to decide about, and each is normally handled by whoever happens to see it first.
 *
 * A complaint becomes a callback with an owner and a date rather than going into a register, which
 * is where complaints go to be counted rather than fixed. A work order waits to be accepted rather
 * than being booked, because an automatic booking is a commitment the business never made. And a
 * toll with no job against it stays on overhead rather than being charged to a guess — a job's
 * margin is only worth reading if nothing was guessed into it.
 */
export function Round3Panel({ complaints, events, orders, matched }: {
  complaints: Complaint[];
  events: VehicleEvent[];
  orders: WorkOrder[];
  matched: (e: VehicleEvent) => { jobRef: string; driver: string } | null;
}) {
  const waiting = waitingToAccept(orders);

  return (
    <div className="grid gap-10" data-round3>
      {/* ── Complaints ──────────────────────────────────────────────────────────────────────── */}
      <section data-complaints>
        <h2 className="font-serif text-2xl text-ink">Complaints</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Every complaint becomes a callback with an owner and a date. Not a register — a register is
          where complaints go to be counted rather than fixed.
        </p>
        {complaints.length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">Nothing open.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {complaints.map(c => {
              const w = complaintWatch(c);
              const bad = w.state === 'unowned' || w.state === 'client_not_told';
              return (
                <li
                  key={`${c.from}-${c.at}`}
                  className="card-inset grid gap-0.5 border-l-4"
                  style={{ borderLeftColor: bad ? LIGHT_COLOUR.red : LIGHT_COLOUR.amber }}
                  data-complaint-state={w.state}
                >
                  <span className="font-serif text-base text-ink">{c.from} — {c.what}</span>
                  <span className="text-sm text-ink">{w.says}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Disputes ────────────────────────────────────────────────────────────────────────── */}
      <section data-dispute>
        <h2 className="font-serif text-2xl text-ink">If it becomes a dispute</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{DISPUTE_PACK_IS_ONE_TAP}</p>
        <ol className="mt-3 grid gap-0.5">
          {DISPUTE_PACK.map(item => (
            <li key={item} className="text-sm text-ink-light" data-dispute-item>{item}</li>
          ))}
        </ol>
      </section>

      {/* ── Work orders ─────────────────────────────────────────────────────────────────────── */}
      <section data-work-orders>
        <h2 className="font-serif text-2xl text-ink">Work orders</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{ACCEPTED_NEVER_AUTOMATIC}</p>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">Nothing waiting to be accepted.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {waiting.map(o => (
              <li key={o.reference} className="card-inset grid gap-0.5" data-work-order={o.reference}>
                <span className="font-serif text-base text-ink">{o.from} · {o.reference}</span>
                <span className="text-sm text-ink">{o.what}</span>
                <span className="text-xs text-ink-light">Came in via {o.via}, {o.at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Tolls and fines ─────────────────────────────────────────────────────────────────── */}
      <section data-vehicle-events>
        <h2 className="font-serif text-2xl text-ink">Tolls and fines</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Matched to the job the ute was on and the person clocked on to it — from the schedule and
          the clock, not from a tracker. {LOCATION_ONLY_AT_THE_ENDS}
        </p>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-ink-light">Nothing come through.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {events.map(e => {
              const m = match(e, matched(e));
              return (
                <li key={`${e.rego}-${e.at}`} className="card-inset grid gap-0.5" data-vehicle-event={e.kind}>
                  <span className="font-serif text-base text-ink">{e.rego} · {e.where}</span>
                  <span className="text-sm text-ink">{m.says}</span>
                  {m.nomination && (
                    <span className="text-sm text-ink-light" data-nomination>{m.nomination}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
