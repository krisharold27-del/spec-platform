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
const LINKS = [
  { href: '/welcome', label: 'What it is' },
  { href: '/how', label: 'How it works' },
  { href: '/sectors', label: 'By sector' },
  { href: '/pricing', label: 'Pricing' },
] as const;

export function PublicNav({ current }: { current?: string }) {
  return (
    <header className="border-b border-ink/10 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/welcome" aria-label="SPEC home">
          <SpecLockup line="Nimble and powerful." />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 label-caps">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={l.href === current ? 'text-rust' : 'hover:text-rust'}
              aria-current={l.href === current ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/signin" className="hover:text-rust">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
