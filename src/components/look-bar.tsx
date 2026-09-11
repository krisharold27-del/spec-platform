import Link from 'next/link';

/**
 * The bar a visitor sees while walking through a look-around.
 *
 * It has one job and it is not to sell: say plainly that this is an example and nothing is being
 * saved, so nobody wonders whether they have just created something or broken something. The ask
 * sits at the end of it, quietly, because somebody still deciding whether they like a product
 * should not be interrupted by a request while they are looking at it.
 *
 * Deliberately not a modal, not a countdown, and not dismissable-then-nagging. It is a line at the
 * top of the page that stays out of the way until they are ready.
 */
export function LookBar() {
  return (
    <div className="border-b border-rust/20 bg-rust/[0.07]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2.5">
        <p className="text-sm text-ink">
          <span className="font-medium">You&rsquo;re having a look around.</span>{' '}
          <span className="text-ink-light">
            This is a real business with real numbers in it — just not yours yet. Nothing you do here is saved.
          </span>
        </p>
        <Link
          href="/look/decide"
          className="shrink-0 rounded-full bg-rust px-4 py-1.5 text-sm font-medium text-cream hover:bg-rust-600"
        >
          Make it mine
        </Link>
      </div>
    </div>
  );
}
