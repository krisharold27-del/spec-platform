import { Footer } from '@/components/ui';

/**
 * The front door. One line, one button. Everything worth explaining is shown inside, where the
 * business can see itself — not written out here for someone who has not started yet.
 */
export default function Welcome() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="label-caps">SPEC</div>
        <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-ink">
          Safety. People. Earnings. Compliance.
        </h1>
        <p className="mt-4 text-lg text-ink-light">Your whole business on one page.</p>
        <a href="/signup" className="mt-10 inline-block rounded-full bg-rust px-8 py-3 text-base font-medium text-cream hover:bg-rust-600">
          Start free
        </a>
        <p className="mt-6 text-sm text-ink-light">Already on SPEC? <a href="/signin" className="underline">Sign in</a></p>
        {/*
          Two links, not a brochure. The front door stays one line and one button — the founder's
          instruction of 10 September, recorded in DECISIONS.md — so anybody who wants the argument
          before the product can go and read it, and anybody who does not is one press from starting.
        */}
        <p className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href="/how" className="text-rust-700 underline">How it works</a>
          <a href="/sectors" className="text-rust-700 underline">What it looks like in your industry</a>
          <a href="/pricing" className="text-rust-700 underline">What it costs, at your numbers</a>
        </p>
        <Footer />
      </div>
    </main>
  );
}
