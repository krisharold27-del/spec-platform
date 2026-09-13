import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';
import { currentLook } from '@/lib/look';

export const dynamic = 'force-dynamic';

/**
 * One question, asked once, after they have already seen it.
 *
 * The whole argument for letting somebody in first is that the product should do the selling. So
 * this page adds nothing new — no feature list, no pricing table, no urgency. It asks whether they
 * liked what they saw and makes both answers easy, because an ask that only has one comfortable
 * exit is a trap and people can feel it.
 *
 * "No" is a real button that goes somewhere gracious. A business that believes in its own product
 * can afford to let somebody leave politely, and the ones who do will remember that they could.
 */
export default async function Decide() {
  const look = await currentLook();
  // Nothing to decide about — they are not in a look-around.
  if (!look) redirect('/');

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-xl px-6 py-20">
        <SpecMark size={40} />
        <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight text-ink">
          Do you like what you see?
        </h1>
        <p className="mt-4 text-lg text-ink-light">
          That was your whole business on one page. Every role, every number, and the four questions
          underneath all of it.
        </p>

        <div className="mt-10 grid gap-3">
          <Link
            href="/signup?keep=1"
            className="rounded-lg bg-rust px-6 py-4 text-cream hover:bg-rust-600"
          >
            <span className="block text-base font-medium">Yes — let&rsquo;s take this further</span>
            <span className="mt-1 block text-sm text-cream/80">
              An email and a password, and what you were just looking at becomes yours. Nothing to set
              up again, no card.
            </span>
          </Link>

          <Link
            href="/look/thanks"
            className="rounded-lg border border-ink/15 px-6 py-4 text-ink hover:border-ink/30"
          >
            <span className="block text-base font-medium">Not for me</span>
            <span className="mt-1 block text-sm text-ink-light">No hard feelings, and nothing to cancel.</span>
          </Link>
        </div>

        <p className="mt-8 text-sm text-ink-light">
          <Link href="/org?look=1" className="underline">Keep looking around first</Link>
        </p>
        <Footer />
      </div>
    </main>
  );
}
