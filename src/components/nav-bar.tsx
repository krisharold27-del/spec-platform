'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Door } from '@/lib/doors';

/**
 * The bar across the top, with the screen you are on marked.
 *
 * Kris sent the header he wants on 18 September: the mark, then the tabs with the current one in
 * bold ink, then a bell, then the business name on the right. Marking the current one is the part
 * that needs the browser — a server component cannot know which address is open — so this is the
 * one client piece of the Shell, and it is only a list of links.
 *
 * `/my-page#everywhere` is All pages: it opens My Page at the full grouped directory. It is matched
 * on the WHOLE href rather than on the path, or it would light up alongside My page on every visit.
 */
export function NavBar({ doors }: { doors: Door[] }) {
  const here = usePathname();

  const current = (href: string) => {
    if (href.includes('#')) return false;
    if (href === '/my-page') return here === '/my-page';
    return here === href || here.startsWith(`${href}/`);
  };

  return (
    <nav aria-label="SPEC" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      {doors.map(d => {
        const on = current(d.href);
        return (
          <Link
            key={d.href}
            href={d.href}
            title={d.note}
            aria-current={on ? 'page' : undefined}
            /* A floor, not a size: these stay quiet text and stop being 16px tall on a phone. */
            className={`inline-flex min-h-[28px] items-center ${
              on ? 'font-semibold text-ink' : 'text-ink-light hover:text-rust'
            }`}
          >
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}
