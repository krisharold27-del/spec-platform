import { Footer } from '@/components/ui';

/**
 * The welcome moment — the screen before the four questions.
 *
 * Most people talk about their problems for years without ever putting a system against them.
 * Someone who has got as far as this page has done the harder thing, and the first thing they read
 * should say so plainly — not as flattery, and not by calling them or their business a problem.
 * The promise is deliberately not "we'll fix you": it is that good is not the target, great is,
 * and that reaching great takes a system rather than more effort.
 */
export default function Welcome() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="label-caps">SPEC Business Solutions</div>

        <h1 className="mt-3 font-serif text-4xl font-bold leading-tight tracking-tight text-ink">
          Most people talk about the problem. You&apos;ve come looking for the answer.
        </h1>

        <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-light">
          <p>
            That is the difference that matters, and it is rarer than it should be. Businesses discuss
            the same four or five problems for years — in the ute, at the toolbox meeting, over a beer
            on a Friday — and then go back to Monday with none of them solved.
          </p>
          <p>
            Effort was never your problem. Your business works hard. What is missing is a system that
            holds the whole thing in view, so the things that keep coming back finally stop coming back.
          </p>
          <p className="font-medium text-ink">
            And the target is not good. Good is what you already are, or you would not still be here.
            The target is great — and nobody gets to great on willpower. It takes a system.
          </p>
          <p>
            SPEC is four things, and only four: <b className="text-ink">Safety</b>, <b className="text-ink">People</b>,{' '}
            <b className="text-ink">Earnings</b>, <b className="text-ink">Compliance</b>. Everything the
            business does sits under one of them. We start by asking you four honest questions about
            each — then we work out why.
          </p>
        </div>

        <a href="/start" className="mt-10 inline-block rounded-lg bg-rust px-6 py-3 text-base font-medium text-white hover:bg-rust-dark">
          Start with the four questions
        </a>
        <p className="mt-3 text-sm text-ink-light">
          Takes about a minute. No card, and nothing to install.
        </p>

        <p className="mt-8 text-sm text-ink-light">
          Already using SPEC? <a href="/signin" className="underline">Sign in</a>
        </p>

        <Footer />
      </div>
    </main>
  );
}
