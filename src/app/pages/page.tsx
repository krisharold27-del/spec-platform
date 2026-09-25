import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser, myBusinesses } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { doors } from '@/lib/doors';

export const dynamic = 'force-dynamic';

/**
 * All pages — every screen in SPEC, grouped, on a page of its own.
 *
 * "All pages" in the bar used to open My Page scrolled to the directory at its foot, which on a
 * phone or a slow load read as "All pages goes to My Page" — Kris, 25 September, could not find
 * the org chart and the one door meant to show everything looked like it went nowhere. Same list
 * as the foot of My Page (`doors()` in lib/doors), so the two can never disagree.
 */
export default async function AllPages() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const groups = doors({
    businesses: (await myBusinesses().catch(() => [])).length,
    runsSpec: isAdminEmail(user.email),
  });
  const count = groups.reduce((n, g) => n + g.doors.length, 0);

  return (
    <Shell title="All pages" headline="Every page in SPEC, in one place.">
      <p className="max-w-2xl text-sm text-ink-light" data-all-pages-count={count}>
        {count} pages, grouped the way you would ask for them. The bar at the top holds the ones you use most.
      </p>
      <div className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(group => (
          <section key={group.title}>
            <h2 className="label-caps">{group.title}</h2>
            <ul className="mt-3 grid gap-3">
              {group.doors.map(d => (
                <li key={d.href}>
                  <Link href={d.href} className="font-serif text-base text-ink hover:text-rust">{d.label}</Link>
                  <span className="block text-xs text-ink-light">{d.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
