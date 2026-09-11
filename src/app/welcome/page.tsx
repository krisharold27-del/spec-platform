import Image from 'next/image';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';

/**
 * The front door. One line, one button — the founder's instruction of 10 September — plus the two
 * marks, which are the brand doing its own arguing.
 *
 * The mark is drawn at rest: closed, green, the hand on twelve. That is a finished month, and it is
 * the only claim the front door makes. The feathertail glider sits beside it because the supporting
 * line is "nimble and powerful", and a glider is the smallest animal that carries its own weight a
 * long way — which is the promise being made to a business with four managers and no back office.
 *
 * Everything worth explaining is on the pages behind this one, where the argument can be made
 * properly to somebody who has chosen to read it.
 */
export default function Welcome() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div className="min-w-[16rem] flex-1">
            <div className="flex items-center gap-3">
              <SpecMark size={40} />
              <div className="label-caps">SPEC</div>
            </div>
            <h1 className="mt-5 font-serif text-4xl leading-tight tracking-tight text-ink">
              Safety. People. Earnings. Compliance.
            </h1>
            <p className="mt-4 text-lg text-ink-light">Your whole business on one page.</p>
            {/*
              The door, not a form. You do not pay for a house before seeing inside it — so the
              first press puts somebody inside a real business with a real chart in it, and asks
              them for nothing at all. Signing up comes after they have decided they like it.
            */}
            <a
              href="/look"
              className="mt-9 inline-block rounded-full bg-rust px-8 py-3 text-base font-medium text-cream hover:bg-rust-600"
            >
              Have a look inside
            </a>
            <p className="mt-3 text-sm text-ink-light">No sign-up, no email, no card. Just look.</p>
            <p className="mt-6 text-sm text-ink-light">
              Ready to start? <a href="/signup" className="underline">Set up your business</a> ·
              Already on SPEC? <a href="/signin" className="underline">Sign in</a>
            </p>
          </div>

          {/*
            The glider, at the size it was drawn for rather than stretched to fill a column. It is
            the one decorative thing on the page and it earns its place by being the supporting
            line made visible — nimble, and carrying more than it looks like it could.
          */}
          <Image
            src="/mascot.png"
            alt=""
            width={260}
            height={260}
            priority
            className="mx-auto h-auto w-40 shrink-0 sm:w-56"
          />
        </div>

        {/*
          Three links, not a brochure. Anybody who wants the argument before the product can go and
          read it; anybody who does not is one press from starting.
        */}
        <p className="mt-12 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href="/how" className="text-rust-700 underline">How it works</a>
          <a href="/sectors" className="text-rust-700 underline">What it looks like in your industry</a>
          <a href="/pricing" className="text-rust-700 underline">What it costs, at your numbers</a>
        </p>
        <Footer />
      </div>
    </main>
  );
}
