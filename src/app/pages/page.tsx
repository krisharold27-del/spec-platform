import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser, myBusinesses } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { doors, navDoors } from '@/lib/doors';
import { EVERY_PAGE } from '@/lib/every-page';

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

  /*
    Every screen, and how each is reached. Four buckets, and the last is the one that matters: a
    page in none of the first three is one that exists and nobody can find.
  */
  const inMenu = new Set([
    ...groups.flatMap(g => g.doors.map(d => d.href)),
    ...navDoors({ businesses: 1, runsSpec: isAdminEmail(user.email) }).map(d => d.href),
  ]);
  const audit = {
    total: EVERY_PAGE.length,
    onMenu: EVERY_PAGE.filter(p => inMenu.has(p.route)).length,
    inside: EVERY_PAGE.filter(p => !inMenu.has(p.route) && p.linked).length,
    byReason: EVERY_PAGE.filter(p => !inMenu.has(p.route) && !p.linked && p.reachedBy).length,
    unaccounted: EVERY_PAGE
      .filter(p => p.route !== '/' && !inMenu.has(p.route) && !p.linked && !p.reachedBy)
      .map(p => p.route),
  };

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

      {/*
        ── The audit, on the page rather than in my word for it ──────────────────────────────────

        Kris, 26 September: *"we really must keep an eye on the list of functions of this system -
        how can i check you have everything"* — and, the same afternoon, *"feels like i have to go
        through the full system with you and make sure everything is working."*

        The list above is the DIRECTORY, which is written by hand. That is exactly the blind spot
        that lost Mirrors for two days: a screen can exist, work, and simply never have been added
        to it, and nothing about the list looks wrong. Three checks were found that same day passing
        happily while guarding lists that were missing part of the point.

        So this block is generated from the code — `src/lib/every-page.ts`, written by
        `scripts/reachable.mjs` walking the app, with `tests/reachable.test.ts` failing the build if
        it goes stale. It counts every screen and says how each one is reached. The number that
        matters is the last one, and it is the whole point of the block: if anything is unaccounted
        for, it is NAMED here, on a page Kris opens, rather than waiting for him to notice.
      */}
      <section className="mt-12 border-t border-ink/10 pt-6" data-page-audit>
        <h2 className="font-serif text-lg text-ink">Is everything here?</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Counted from the code every time this page is built — not from a list anybody keeps by hand.
        </p>
        {/*
          Said plainly, because a check that overstates what it proves is how people stop reading
          checks. This one asks whether a route is POINTED AT anywhere in the product. It does not
          prove you can click through to it in your role, on your plan, in your business's state —
          that is a harder question, and the browser journeys ask it of the screens that matter most.
          A floor that is actually enforced beats a ceiling nobody reaches.
        */}
        <p className="mt-1 max-w-2xl text-xs text-ink-light">
          This says every screen has a way in. It does not promise every screen is open to you —
          what you can reach still follows your role and your seat.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: audit.total, label: 'screens in SPEC', note: 'Every page that exists.' },
            { n: audit.onMenu, label: 'in a menu', note: 'On the bar, or in the directory above.' },
            { n: audit.inside, label: 'opened from another screen', note: 'Sub-pages, like a tab inside People.' },
            { n: audit.byReason, label: 'opened another way', note: 'From an email or a link that was sent. Each has a written reason.' },
          ].map(x => (
            <div key={x.label} className="rounded-lg bg-surface p-4">
              <dt className="font-serif text-2xl text-ink">{x.n}</dt>
              <dd className="text-sm text-ink">{x.label}</dd>
              <dd className="mt-1 text-xs text-ink-light">{x.note}</dd>
            </div>
          ))}
        </dl>
        {audit.unaccounted.length === 0 ? (
          <p className="mt-4 rounded-lg bg-sage-200 p-4 text-sm text-sage-900" data-audit-clean>
            <strong>Nothing is unaccounted for.</strong> Every screen in SPEC is in a menu, opens from
            another screen, or has a written reason. Add a page with no way in and this line changes
            and the build fails.
          </p>
        ) : (
          <div className="mt-4 rounded-lg bg-cream p-4 text-sm text-ink" data-audit-problem>
            <p>
              <strong>{audit.unaccounted.length} screen{audit.unaccounted.length === 1 ? '' : 's'} nobody can reach.</strong>{' '}
              {audit.unaccounted.length === 1 ? 'It exists' : 'They exist'} and nothing leads there.
            </p>
            <ul className="mt-2 list-disc pl-5">
              {audit.unaccounted.map(r => <li key={r}><code>{r}</code></li>)}
            </ul>
          </div>
        )}
      </section>
    </Shell>
  );
}
