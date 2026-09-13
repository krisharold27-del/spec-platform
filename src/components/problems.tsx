import { PROBLEMS, type ProblemKey } from '@/lib/problems';

/**
 * What this screen is actually for — the problem it fixes, and what the fix is.
 *
 * ── Why a screen carries this at all ─────────────────────────────────────────────────────────────
 *
 * SPEC's whole argument is that a business's problems keep happening, and that solving them starts
 * with the people. The designs put that argument on the screen where each problem gets fixed, as a
 * Before and an After. The product carried the features and none of the reasoning, so a customer
 * saw the software and never saw the thinking — which is the half nobody can copy.
 *
 * It is placed at the FOOT of a page, not the head. Somebody who opens the inbox at seven in the
 * morning wants the inbox; the argument is for the person still deciding whether any of this is
 * worth doing, and for the leader explaining it to their board. Put it at the top and it is in the
 * way of the work every single day.
 *
 * The wording comes from lib/problems, which is the designs' wording, held there by a test. One
 * source, so the sentence on the screen and the sentence in a sales conversation cannot drift.
 */
export function Problems({ screen }: { screen: ProblemKey }) {
  const set = PROBLEMS[screen];
  if (!set) return null;

  return (
    <section className="mt-14 border-t border-ink/10 pt-10" aria-labelledby="what-this-fixes">
      <h2 id="what-this-fixes" className="font-heading text-xl text-ink">What this fixes</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
        Three things most businesses live with. What they look like without SPEC, and what SPEC
        actually does about each one — the mechanism, not a promise.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {set.problems.map(p => (
          <article key={p.problem} className="rounded-2xl bg-surface p-6">
            <h3 className="font-heading text-[17px] leading-6 text-ink">{p.problem}</h3>
            <div className="mt-4 grid gap-3">
              {/*
                Two rules the colour system holds, and both matter here.

                The left border carries the meaning, never the text colour: "before" in a muted grey
                and "after" in the sage is readable at any contrast, whereas colouring the sentences
                themselves would put three of the four signal colours below AA as body text.

                And "before" is not styled as an error. It is the honest description of an ordinary
                business, most likely the reader's own, and painting it red tells a customer their
                company is broken on a page that is trying to earn their trust.
              */}
              <p className="border-l-[3px] border-ink/25 pl-3.5 text-sm leading-[22px] text-ink/70">
                <span className="font-medium text-ink/60">Before · </span>{p.before}
              </p>
              <p className="border-l-[3px] border-sage pl-3.5 text-sm leading-[22px] text-ink">
                <span className="font-medium">After · </span>{p.after}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
