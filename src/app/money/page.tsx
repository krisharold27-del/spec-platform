import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { angusFor } from '@/lib/angus-data';
import {
  ANGUS_IS_NOT_A_CONNECTOR, WHAT_MOVES, RECONCILED_TO_THE_CENT, STAYING_IS_FINE,
  FOR_THE_ACCOUNTANT, OLD_SYSTEM_READ_ONLY_MONTHS, PAYROLL_RULE, payrollPostsTo,
  reviewLine, reviewsLine, broken,
  type Shield, type ShieldState,
} from '@/lib/angus';
import { LIGHT_COLOUR } from '@/lib/today';
import { whyNot, insteadGoTo } from '@/lib/sight';
import { seatFor } from '@/lib/seat-of';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { chooseSource, answerSwitch, signReview } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Money' };

/**
 * Angus Shield — the home of the key financial reviews.
 *
 * ── What this screen is, and what is optional about it ───────────────────────────────────────────
 *
 * The reviews, the shields and the findings are SPEC's work and they run from day one, on whatever
 * ledger is underneath. What is optional is the LEDGER — Xero, MYOB, QuickBooks read every morning,
 * or Angus Shield, which is SPEC's own and therefore live. That distinction is the reason the Money
 * tile on the GM home always opens here rather than offering to move something.
 *
 * ── Money is leadership ──────────────────────────────────────────────────────────────────────────
 *
 * Gated on `maySeeMoney` the same way the Jobs money tabs are, and refused with the same words: not
 * "access denied", but where their own work is instead. A page of margins and debtors is the single
 * most portable thing a business owns.
 */
export default async function Money({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const arrival = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const seat = await seatFor(user);
  const view = await angusFor(user);
  const tenant = (await getTenantById(user.tenantId))!;

  if (!view.canAct) {
    return (
      <Shell title="Money" headline="This one sits with the leadership seats.">
        <p className="mt-4 max-w-2xl text-sm text-ink-light">{whyNot(seat)}</p>
        <Link href={insteadGoTo(seat)} className="mt-6 inline-block text-rust-700 hover:underline">
          Go to your own page &rarr;
        </Link>
      </Shell>
    );
  }

  const { offer } = view;
  const needing = broken(view.shields);

  return (
    <Shell title="Money" headline={`${tenant.name}: the reviews that say whether the business is safe.`}>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/virtual-gm" className="text-rust-700 hover:underline">&larr; Virtual GM</Link>
        <Link href="/board" className="text-rust-700 hover:underline">Board pack &rarr;</Link>
      </div>
      <Refused reason={refusedReason(arrival)} />

      {/* ── Where the figures come from ─────────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-sand-300 bg-sand-50 p-5" data-money-source>
        <span className="label-caps">Your financial system</span>
        <h2 className="mt-1 font-serif text-2xl text-ink">{view.title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-light">{view.note}</p>

        <form action={chooseSource} className="mt-4 flex flex-wrap gap-2">
          <button
            name="source" value="connector"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${view.source === 'connector' ? 'bg-ink text-white' : 'border border-sand-300 text-ink'}`}
          >
            {view.connectorName ?? 'Your own system'}
          </button>
          <button
            name="source" value="angus"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${view.source === 'angus' ? 'bg-ink text-white' : 'border border-sand-300 text-ink'}`}
          >
            Angus Shield, direct
          </button>
        </form>
        <p className="mt-3 max-w-3xl text-xs text-ink-light">{ANGUS_IS_NOT_A_CONNECTOR}</p>
      </section>

      {/* ── The four shields ────────────────────────────────────────────────────────────────── */}
      <section className="mt-10" data-money-shields>
        <h2 className="font-serif text-3xl text-ink">Is the business safe?</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Four floors, not four scores. A business can be growing quickly and fail all of them.
          {needing.length === 0
            ? ' Nothing is under its floor right now.'
            : ` ${needing.length} of the four ${needing.length === 1 ? 'is' : 'are'} under.`}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {view.shields.map(s => <ShieldCard key={s.key} shield={s} />)}
        </div>
      </section>

      {/* ── The reviews ─────────────────────────────────────────────────────────────────────── */}
      <section className="mt-10" data-money-reviews>
        <h2 className="font-serif text-3xl text-ink">The reviews</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{reviewsLine(view.reviews)}</p>
        <div className="mt-4 grid gap-3">
          {view.reviews.map(r => (
            <article key={r.kind.key} className="rounded-xl border border-sand-300 bg-white p-4" data-review={r.kind.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-serif text-lg text-ink">{r.kind.title}</h3>
                <span className="label-caps">{r.kind.cadence === 'weekly' ? 'Weekly' : 'Monthly'}</span>
              </div>
              <p className="mt-1 text-xs text-ink-light">{r.kind.answers}</p>
              <p className="mt-2 text-sm text-ink">{reviewLine(r)}</p>
              {r.signedAt ? (
                <p className="mt-2 text-xs text-ink-light">
                  Signed off by {r.signedBy} on {r.signedAt.slice(0, 10)} — it is in the board pack.
                </p>
              ) : r.finding !== null ? (
                <form action={signReview} className="mt-3">
                  <input type="hidden" name="reviewKey" value={r.kind.key} />
                  <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                    Sign this off
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* ── The six months, and the offer at the end of it ──────────────────────────────────── */}
      {view.source === 'connector' && (
        <section className="mt-10 rounded-xl border border-sand-300 bg-white p-5" data-money-switch>
          <h2 className="font-serif text-3xl text-ink">Angus Shield</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">{offer.readiness.says}</p>

          <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-sand-200" aria-hidden>
            <div className="h-full rounded-full bg-fern-600" style={{ width: `${Math.round(offer.readiness.through * 100)}%` }} />
          </div>

          {offer.offered ? (
            <>
              <h3 className="mt-6 font-serif text-xl text-ink">What moves across</h3>
              <ul className="mt-2 grid gap-2">
                {WHAT_MOVES.map(w => (
                  <li key={w.what} className="text-sm text-ink">
                    <span className="font-semibold">{w.what}</span>
                    <span className="text-ink-light"> — {w.how}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-3xl text-sm text-ink-light">{RECONCILED_TO_THE_CENT}</p>
              <p className="mt-2 max-w-3xl text-sm text-ink-light">{FOR_THE_ACCOUNTANT}</p>
              <p className="mt-2 max-w-3xl text-xs text-ink-light">
                Your old system stays readable for {OLD_SYSTEM_READ_ONLY_MONTHS} months, which covers a full audit.
              </p>

              <form action={answerSwitch} className="mt-5 flex flex-wrap gap-3">
                <button name="answer" value="switch" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
                  Switch to Angus Shield
                </button>
                <button name="answer" value="stay" className="rounded-full border border-sand-300 px-5 py-2.5 text-sm font-semibold text-ink">
                  Stay on {view.connectorName ?? 'what we use'} for now
                </button>
              </form>
              <p className="mt-3 max-w-3xl text-xs text-ink-light">{STAYING_IS_FINE}</p>
            </>
          ) : (
            <p className="mt-3 max-w-3xl text-sm text-ink-light">{offer.says}</p>
          )}
        </section>
      )}

      {/* ── Payroll ─────────────────────────────────────────────────────────────────────────── */}
      <section className="mt-10" data-money-payroll>
        <h2 className="font-serif text-3xl text-ink">How pay flows</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-light">{PAYROLL_RULE}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink">{payrollPostsTo(view.source, view.connectorName)}</p>
        <Link href="/people?mode=pay" className="mt-3 inline-block text-sm text-rust-700 hover:underline">
          People &rarr; Pay
        </Link>
      </section>
    </Shell>
  );
}

/**
 * One shield.
 *
 * Colour says how it is GOING and never what it IS — `unknown` is deliberately the pending colour
 * rather than a fourth invented one, because a shield SPEC cannot read is not a shield that is
 * failing, and colouring it red would be SPEC having an opinion it has not earned.
 */
function ShieldCard({ shield }: { shield: Shield }) {
  const colour: Record<ShieldState, string> = {
    held: LIGHT_COLOUR.green,
    thin: LIGHT_COLOUR.amber,
    broken: LIGHT_COLOUR.red,
    unknown: LIGHT_COLOUR.pending,
  };
  return (
    <article className="rounded-xl border border-sand-300 bg-white p-4" data-shield={shield.key}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour[shield.state] }} aria-hidden />
        <span className="label-caps">{shield.label}</span>
      </div>
      <p className="mt-2 font-serif text-3xl leading-none text-ink">
        {shield.value ?? <span className="text-xl text-ink-light">Not known yet</span>}
      </p>
      <p className="mt-2 text-sm text-ink-light">{shield.says}</p>
    </article>
  );
}
