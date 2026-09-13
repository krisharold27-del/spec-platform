import Link from 'next/link';

/**
 * A page that is not there.
 *
 * Not a failure, and it must not be dressed as one. Somebody following an old link, a mistyped
 * address, or a bookmark to a screen that was renamed should be told plainly and pointed home —
 * not shown an alarming error that makes them wonder whether the product is broken.
 *
 * Renames are the likely cause here: My Page moved from /today and the landing page from /welcome.
 * Both of those old addresses still answer, deliberately, because links outlive the reasons for
 * them. This is for everything else.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl text-ink">There is no page at that address</h1>

      <p className="mt-4 text-sm leading-6 text-ink-light">
        Nothing is broken — that address just does not lead anywhere. It is usually an old link or a
        small typo.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/my-page" className="btn-primary text-sm">Go to my page</Link>
        <Link href="/" className="btn-secondary text-sm">Back to the front</Link>
      </div>

      <p className="mt-8 text-sm leading-6 text-ink-light">
        Everything inside SPEC opens from My Page. There is no menu to hunt through, which is on
        purpose.
      </p>
    </main>
  );
}
