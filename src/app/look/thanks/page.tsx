import Link from 'next/link';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';
import { endLook } from '@/lib/look';

export const dynamic = 'force-dynamic';

/**
 * They said no. This page's only job is to make that a good experience.
 *
 * No "are you sure", no discount, no last-chance form. Somebody who leaves without being chased is
 * somebody who might come back, and might tell somebody else — and a product whose whole argument
 * is that it tells a business the truth cannot start the relationship by being sticky.
 *
 * The look-around key is dropped here, so their browser stops holding a business they have finished
 * with. The way back in is one press, and the door is genuinely open.
 */
export default async function Thanks() {
  await endLook();

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-xl px-6 py-24">
        <SpecMark size={40} />
        <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight text-ink">
          Thanks for coming to have a look.
        </h1>
        <p className="mt-4 text-lg text-ink-light">
          We appreciate the time. Nothing was created and there is nothing for you to cancel.
        </p>
        <p className="mt-6 text-base text-ink-light">
          If it turns out to be the thing you need later, it will be here, and you can walk through it
          again the same way.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/look" className="rounded-full bg-rust px-6 py-3 text-base font-medium text-cream hover:bg-rust-600">
            Have another look
          </Link>
          <Link href="/welcome" className="rounded-full border border-ink/15 px-6 py-3 text-base text-ink hover:border-ink/30">
            Back to the start
          </Link>
        </div>

        <p className="mt-10 text-sm text-ink-light">
          Something specific put you off? <a href="mailto:manager@specbizhq.com?subject=Had%20a%20look%20at%20SPEC" className="underline">Tell us</a> — we would rather know.
        </p>
        <Footer />
      </div>
    </main>
  );
}
