import Link from 'next/link';
import { Shell } from '@/components/ui';
import { QUESTIONS, placeOf, statusOf, read, byGroup, EVERYWHERE_IS_NOT_CHECKED } from '@/lib/questions';
import { routesInProduct } from '@/lib/questions-data';
import { LIGHT_COLOUR } from '@/lib/today';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Owner questions' };

/**
 * Every question an owner could ask — and whether this product can answer it.
 *
 * ── Why the status is computed and not written down ──────────────────────────────────────────────
 *
 * The design marks all ninety-six Answered. Repeating that would make this the most confident page
 * in the product and the least informative. So the questions and answers come from the design, and
 * the status is worked out here: each question names where it is handled, and that is resolved
 * against the routes this application actually has. A question pointing at a screen nobody built
 * reads as a gap, whatever the design says.
 *
 * It is the only page that gets WORSE when somebody writes a good sentence and does not build the
 * thing, which is exactly what makes it worth having.
 *
 * ── Signed out on purpose ────────────────────────────────────────────────────────────────────────
 *
 * The person most likely to read this is deciding whether to buy, and asking them to make an
 * account first would be asking them to trust the thing they came here to check.
 */
export default async function Questions() {
  /*
    The generated list, not a walk of src/app — this page is force-dynamic, so it runs in a
    serverless function where src/ does not exist. The walk found nothing there and every question
    read as a gap: 0 of 96 in production against 93 of 96 in the repo. See routesInProduct.
  */
  const routes = routesInProduct();
  const reading = read(QUESTIONS, routes);
  const groups = byGroup(QUESTIONS, routes);

  return (
    <Shell title="Owner questions" headline="Every question an owner could ask, and where siteVIP answers it.">
      <p className="mt-2 max-w-3xl text-sm text-ink-light">
        Simple isn’t missing things. Every question here needs a short, plain answer and a place in
        siteVIP where it is already handled. Anything without one is a gap, and this page works that
        out by looking — it does not take anybody’s word for it, including its own designer’s.
      </p>

      <p className="mt-4 max-w-3xl font-serif text-2xl text-ink" data-questions-says>{reading.says}</p>

      {/* ── How each area is doing ─────────────────────────────────────────────────────────── */}
      <section className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-questions-groups>
        {groups.map(g => (
          <div key={g.group} className="card-inset flex items-baseline justify-between gap-2" data-questions-group={g.group}>
            <span className="text-sm text-ink">{g.group}</span>
            <span
              className="text-sm font-semibold"
              style={{ color: g.answered === g.total ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}
            >
              {g.answered} of {g.total}
            </span>
          </div>
        ))}
      </section>

      {/* ── The gaps first ─────────────────────────────────────────────────────────────────── */}
      {reading.gaps.length > 0 && (
        <section className="mt-10" data-questions-gaps>
          <h2 className="font-serif text-2xl text-ink">Still to build</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">
            These have an answer written and nowhere in the product that carries it yet. They are
            first because a list that buries its gaps under ninety answered questions is a list
            nobody reads to the end of.
          </p>
          <ul className="mt-4 grid gap-3">
            {reading.gaps.map(q => (
              <li
                key={q.n}
                className="card-inset grid gap-0.5 border-l-4"
                style={{ borderLeftColor: LIGHT_COLOUR.amber }}
                data-question={q.n}
                data-question-status="gap"
              >
                <span className="font-serif text-base text-ink">{q.q}</span>
                <span className="text-sm text-ink-light">{q.a}</span>
                <span className="text-xs text-ink-light">Would live in: {q.where}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The ones with no address ──────────────────────────────────────────────────────── */}
      {reading.everywhere.length > 0 && (
        <section className="mt-10" data-questions-everywhere>
          <h2 className="font-serif text-2xl text-ink">Answered everywhere</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-light">{EVERYWHERE_IS_NOT_CHECKED}</p>
          <ul className="mt-4 grid gap-3">
            {reading.everywhere.map(q => (
              <li key={q.n} className="grid gap-0.5" data-question={q.n} data-question-status="everywhere">
                <span className="font-serif text-base text-ink">{q.q}</span>
                <span className="text-sm text-ink-light">{q.a}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── And the rest ───────────────────────────────────────────────────────────────────── */}
      <section className="mt-10" data-questions-all>
        <h2 className="font-serif text-2xl text-ink">Answered</h2>
        <div className="mt-4 grid gap-6">
          {groups.map(g => {
            const mine = QUESTIONS.filter(q => q.group === g.group && statusOf(q, routes) === 'answered');
            if (mine.length === 0) return null;
            return (
              <div key={g.group}>
                <h3 className="label-caps">{g.group}</h3>
                <ul className="mt-2 grid gap-3">
                  {mine.map(q => {
                    const place = placeOf(q.where);
                    return (
                      <li key={q.n} className="grid gap-0.5" data-question={q.n} data-question-status="answered">
                        <span className="font-serif text-base text-ink">{q.n}. {q.q}</span>
                        <span className="text-sm text-ink-light">{q.a}</span>
                        {place.href && (
                          <Link href={place.href} className="text-xs text-rust-700 hover:underline">
                            {q.where} &rarr;
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}
