import Link from 'next/link';
import { SpecLockup } from './spec-mark';

/**
 * The header on every page somebody can reach without signing in.
 *
 * One component rather than a copy per page: the nav had already drifted — pricing had lost "By
 * sector" — and a public site whose navigation changes depending on which page you landed on reads
 * as unfinished before anybody has seen the product.
 *
 * Deliberately not the signed-in `Shell` header. Inside, the nav is for somebody doing a job; here
 * it is for somebody deciding whether to start, and the two lists have almost nothing in common.
 */
/*
  SPEC's own front door is /spec since 23 September 2026 — the bare address is siteVIP, the trades
  edition. So "What it is" and the mark go to /spec, and siteVIP gets a link of its own, which keeps
  every public page one press from every other.
*/
const LINKS = [
  { href: '/spec', label: 'What it is' },
  { href: '/how', label: 'How it works' },
  { href: '/sectors', label: 'By sector' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/', label: 'siteVIP for trades' },
] as const;

export function PublicNav({ current }: { current?: string }) {
  return (
    <header className="border-b border-ink/10 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        {/* Same floor as the app header's mark: it is the way home from every marketing page,
            and it measured 35px on a phone. */}
        <Link href="/spec" aria-label="SPEC home" className="inline-flex min-h-[44px] items-center">
          <SpecLockup line="Nimble and powerful." />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 label-caps">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`inline-flex min-h-[28px] items-center ${l.href === current ? 'text-rust' : 'hover:text-rust'}`}
              aria-current={l.href === current ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/signin" className="inline-flex min-h-[28px] items-center hover:text-rust">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
