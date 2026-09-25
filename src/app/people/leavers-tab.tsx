import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { LAST_DAY, stillOpen, lastDayLine, type Leaver } from '@/lib/last-day';
import { recordLastDay, tickLastDay } from './actions';

/**
 * Somebody leaves — the list, in one place, on the one day it can still be done.
 *
 * ── Why a list and not a form ────────────────────────────────────────────────────────────────────
 *
 * Every piece of this already exists somewhere in SPEC. Tools are on the tools register, the seat
 * is on billing, access is on the chart. Nothing joined them, so each was done by whoever
 * remembered — which on a last day is nobody, because a last day is a cake and a handover and
 * somebody's replacement starting on Monday.
 *
 * So every row here links to the register that already holds it. There is no second place to close
 * a login, and nothing on this screen does anything except say what has not been done yet.
 *
 * ── SPEC closes nothing by itself ────────────────────────────────────────────────────────────────
 *
 * Deliberately. Somebody on gardening leave still has a login ON PURPOSE, a tool written off is a
 * conversation rather than a tick, and final pay is a calculation somebody signs. The job is to
 * make sure nobody has to REMEMBER, not to decide.
 */
export function LeaversTab({ leavers, people, manage, today }: {
  leavers: Leaver[];
  people: { id: string; name: string }[];
  manage: boolean;
  today: string;
}) {
  const open = stillOpen(leavers, new Date(`${today}T00:00:00.000Z`));

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="font-serif text-xl text-ink">When somebody leaves</h2>
        <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
          Every part of this already lives somewhere — the tools register, billing, the chart. What
          was missing was anything joining them, so each was done by whoever remembered. Two of them
          cost money or create risk every day they stay open: a login that still works, and a seat
          still being paid for.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{lastDayLine(open)}</p>
      </section>

      {open.map(w => (
        <section key={w.leaver.staffId} className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg text-ink">{w.leaver.name}</h3>
            <span className="text-[13px] text-ink-light">Last day {w.leaver.lastDay}</span>
          </div>
          <p className="mt-1.5 text-sm"
            style={{ color: w.biting.length > 0 ? LIGHT_INK.amber : undefined }}>
            {w.says}
          </p>

          <ul className="mt-3 grid gap-2">
            {w.left.map(item => (
              <li key={item.key} className="rounded-2xl p-4"
                style={item.bites ? { background: LIGHT_COLOUR.amber } : { background: 'var(--cream, #f6f2ea)' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm" style={item.bites ? { color: LIGHT_INK.amber } : undefined}>
                    <strong>{item.what}</strong>
                  </span>
                  <span className="flex items-center gap-3">
                    <Link href={item.where} className="text-[13px] text-rust-700 hover:underline">
                      Do it on {item.where}
                    </Link>
                    {manage && (
                      <form action={tickLastDay}>
                        <input type="hidden" name="leaverId" value={w.leaver.staffId} />
                        <input type="hidden" name="key" value={item.key} />
                        <SubmitButton className="btn-secondary shrink-0 text-[13px]" pending="…">Done</SubmitButton>
                      </form>
                    )}
                  </span>
                </div>
                <p className="mt-1 max-w-[70ch] text-[13px] leading-[19px]"
                  style={item.bites ? { color: LIGHT_INK.amber } : { color: 'inherit', opacity: 0.75 }}>
                  {item.why}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {manage && (
        <section className="card">
          <h3 className="font-serif text-lg text-ink">Somebody is leaving</h3>
          <p className="mt-1 max-w-[74ch] text-sm text-ink-light">
            Recording the last day is what starts the list. SPEC closes nothing by itself — somebody
            on gardening leave still has a login on purpose — it only makes sure nobody has to
            remember.
          </p>
          <form action={recordLastDay} className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
            <select className="input" name="staffId" required aria-label="Who is leaving">
              <option value="">Who</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input" name="lastDay" type="date" required aria-label="Their last day" />
            <SubmitButton className="btn-secondary shrink-0" pending="…">Start the list</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-ink-light">
            {LAST_DAY.length} things, and {LAST_DAY.filter(i => i.bites).length} of them bite.
          </p>
        </section>
      )}
    </div>
  );
}
