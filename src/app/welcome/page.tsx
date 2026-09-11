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
        <Footer />
      </div>
    </main>
  );
}
