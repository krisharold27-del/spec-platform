import {
  TESTS, SPEC_DOES_NOT_DECIDE, ASKED_ONCE, WHY_PAYMENT_STOPS, LIMIT_IS_YOURS,
  readAbn, readTests, buildTpar,
  type AbnCheck, type TestKey, type Answer, type TparRow,
} from '@/lib/ato';
import { LIGHT_COLOUR } from '@/lib/today';

export interface AtoSubbie {
  id: string;
  name: string;
  abn: AbnCheck;
  answers: Partial<Record<TestKey, Answer>>;
}

/**
 * Subbies and the ATO.
 *
 * Two things happen here and they are different in kind. The ABN check BLOCKS a payment, because
 * paying a contractor without a valid one obliges the business to withhold and remit — a payment
 * made anyway is the business quietly taking on somebody else's tax liability. The
 * contractor-versus-employee tests decide NOTHING, because courts decide that on the whole
 * relationship, and a product that answered would be giving advice it is in no position to give.
 *
 * Keeping the two visually distinct matters. A screen where a hard block and a prompt to think look
 * the same is a screen where people learn to click past both.
 */
export function AtoPanel({ subbies, year, tparRows, now }: {
  subbies: AtoSubbie[];
  year: string;
  tparRows: TparRow[];
  now: Date;
}) {
  const tpar = buildTpar(year, tparRows);

  return (
    <div className="grid gap-8" data-ato>
      <section>
        <h2 className="font-serif text-2xl text-ink">Subbies and the ATO</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{WHY_PAYMENT_STOPS}</p>

        {subbies.length === 0 ? (
          <p className="mt-3 text-sm text-ink-light">No subcontractors on the books.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {subbies.map(s => {
              const abn = readAbn(s.abn, now);
              const tests = readTests(s.answers);
              return (
                <li
                  key={s.id}
                  className="card-inset grid gap-2 border-l-4"
                  style={{ borderLeftColor: abn.mayPay ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}
                  data-ato-subbie={s.id}
                  data-ato-maypay={abn.mayPay ? 'yes' : 'no'}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-lg text-ink">{s.name}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: abn.mayPay ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}
                    >
                      {abn.mayPay ? 'Can be paid' : 'Payment blocked'}
                    </span>
                  </div>
                  <span className="text-sm text-ink">{abn.says}</span>

                  {/* Visually separate: this one is a prompt to think, not a gate. */}
                  <div className="mt-1 rounded-lg bg-sand-100 p-3" data-ato-tests={tests.leaning}>
                    <span className="label-caps">Contractor, or employee?</span>
                    <p className="mt-1 text-sm text-ink">{tests.says}</p>
                    {tests.suggestARole && (
                      <p className="mt-1 text-sm font-semibold text-ink" data-ato-suggest-role>
                        SPEC has drafted the role in Recruitment, if you want to offer them a job.
                      </p>
                    )}
                    <ul className="mt-2 grid gap-0.5">
                      {TESTS.map(t => (
                        <li key={t.key} className="text-xs text-ink-light">
                          {t.question} — {s.answers[t.key] ?? 'not answered'}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 max-w-3xl text-xs text-ink-light">{SPEC_DOES_NOT_DECIDE}</p>
        <p className="mt-1 max-w-3xl text-xs text-ink-light">{ASKED_ONCE}</p>
      </section>

      <section data-tpar>
        <h3 className="font-serif text-lg text-ink">Taxable Payments Annual Report</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink">{tpar.says}</p>
        <p className="mt-1 max-w-3xl text-xs text-ink-light">
          SPEC builds it from what you actually paid out. {tpar.lodgedBy.charAt(0).toUpperCase() + tpar.lodgedBy.slice(1)} lodges it —
          the person who lodges carries the liability for what is in it, and a report nobody read is
          a business answerable for something it never saw.
        </p>
        {tpar.incomplete.length > 0 && (
          <ul className="mt-3 grid gap-1">
            {tpar.incomplete.map(r => (
              <li key={r.subbie} className="text-sm" style={{ color: LIGHT_COLOUR.amber }} data-tpar-incomplete>
                {r.subbie} — missing {r.missing.join(', ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-3xl text-xs text-ink-light">{LIMIT_IS_YOURS}</p>
    </div>
  );
}
