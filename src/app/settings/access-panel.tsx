import {
  MONEY_SEATS, TWO_STEP_FOR_EVERYONE, mayTurnOffTwoStep,
  DATA_IS_YOURS, STORED_IN_AUSTRALIA, EXPORT_INCLUDES, WHY_OWNER_ONLY, mayExportEverything,
  type MoneySeat,
} from '@/lib/money-sight';
import { NO_UPTIME_PROMISE, WORKS_OFFLINE, PRICE_PROMISE } from '@/lib/round3';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * Who sees what money, two-step sign-in, and the promise that the data is theirs.
 *
 * All three on one screen because they are the same question asked three ways: what can be got at,
 * by whom, and what happens to it. An owner deciding whether to trust a system asks all three in
 * the same five minutes, and splitting them across three settings pages is how a product looks
 * evasive without meaning to.
 */
export function AccessPanel({ seat, benchmarksOn, toggleBenchmarks }: {
  seat: MoneySeat;
  benchmarksOn: boolean;
  toggleBenchmarks: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-10" data-access>
      {/* ── Who sees which money ────────────────────────────────────────────────────────────── */}
      <section data-money-sight>
        <h2 className="font-serif text-2xl text-ink">Who sees which money</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Set by the seat somebody holds, not by a switch anybody can flip. Money has an owner, and
          showing it to twelve people who cannot act on it does not make it twelve times more likely
          to be fixed — it makes it furniture.
        </p>
        <ul className="mt-4 grid gap-2">
          {MONEY_SEATS.map(s => (
            <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-2 text-sm" data-money-seat={s.key}>
              <span className="font-semibold text-ink">{s.label}</span>
              <span className="text-ink-light">{s.sees}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-3xl text-xs text-ink-light">
          The general manager is the one exception worth explaining: they see everything except what
          the owner is paid. It is the one number in a business with no oversight above it, and
          nothing is gained by it being readable.
        </p>
      </section>

      {/* ── Two-step ────────────────────────────────────────────────────────────────────────── */}
      <section data-two-step>
        <h2 className="font-serif text-2xl text-ink">Signing in</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{TWO_STEP_FOR_EVERYONE}</p>
        <p
          className="mt-2 text-sm font-semibold"
          style={{ color: mayTurnOffTwoStep(seat) ? LIGHT_COLOUR.pending : LIGHT_COLOUR.green }}
          data-two-step-locked={mayTurnOffTwoStep(seat) ? 'no' : 'yes'}
        >
          {mayTurnOffTwoStep(seat)
            ? 'Your seat can go without it, though there is no good reason to.'
            : 'Your seat cannot turn it off.'}
        </p>
      </section>

      {/* ── Your data is yours ──────────────────────────────────────────────────────────────── */}
      <section data-your-data>
        <h2 className="font-serif text-2xl text-ink">Your data is yours</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{DATA_IS_YOURS}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink-light">{STORED_IN_AUSTRALIA}</p>

        <form action={toggleBenchmarks} className="mt-4">
          <input type="hidden" name="on" value={benchmarksOn ? 'no' : 'yes'} />
          <button className="rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ink" data-benchmarks={benchmarksOn ? 'on' : 'off'}>
            {benchmarksOn
              ? 'Stop sharing anonymised data for benchmarks'
              : 'Share anonymised data for industry benchmarks'}
          </button>
        </form>

        <h3 className="mt-6 font-serif text-lg text-ink">Export everything</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{WHY_OWNER_ONLY}</p>
        <ul className="mt-2 grid gap-0.5">
          {EXPORT_INCLUDES.map(what => (
            <li key={what} className="text-sm text-ink-light" data-export-includes>{what}</li>
          ))}
        </ul>
        {mayExportEverything(seat) ? (
          /*
            A real link, not a sentence about one.

            This said "Yours to take, any time, in one click" for a fortnight with nothing behind it
            — the promise a business tests on the worst day it ever has with SPEC. An ordinary
            anchor rather than a form: the browser downloads it, and it keeps working with no
            JavaScript, which matters because the moment somebody needs this is not the moment to
            find out their browser is having a bad day.
          */
          <p className="mt-3 text-sm text-ink">
            <a
              href="/api/export"
              download
              data-export-everything
              className="btn-primary inline-flex min-h-[36px] items-center text-sm"
            >
              Download everything
            </a>
            <span className="ml-3 text-ink-light">A zip of spreadsheets. Opens in Excel; it does not need SPEC.</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-light" data-export-not-yours>
            The owner does this one.
          </p>
        )}
      </section>

      {/* ── What SPEC promises, and what it deliberately does not ───────────────────────────── */}
      <section data-promises>
        <h2 className="font-serif text-2xl text-ink">When something goes wrong</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{NO_UPTIME_PROMISE}</p>
        <ul className="mt-3 grid gap-1">
          {WORKS_OFFLINE.map(w => (
            <li key={w.what} className="text-sm text-ink-light" data-works-offline>
              <span className="text-ink">{w.what}</span> — {w.how}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-sm text-ink" data-price-promise>{PRICE_PROMISE}</p>
      </section>
    </div>
  );
}
