import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScorecard } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { LIGHT_COLOUR } from '@/lib/today';
import { logToolbox, reportHazard } from './actions';

export const dynamic = 'force-dynamic';

/**
 * On site — four taps, gloves on, one bar of signal.
 *
 * Deliberately not Today shrunk down. Somebody standing on a site has four things to do and no
 * patience for a dashboard, so this page has four targets and nothing else: what the crew has to
 * hear, what nearly went wrong, who is clear to work, and where the day's work is.
 *
 * Everything is a plain form post, which is what makes it work on bad signal: no client bundle to
 * download before the first tap does anything, and a submit that either goes through or does not
 * rather than failing silently in a queue nobody can see.
 */
export default async function OnSite() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const manage = canManage(user.access);

  const myRole = scope.myRoleId ? scope.roles.find(r => r.id === scope.myRoleId) ?? null : null;
  const crew = myRole ? scope.roles.filter(r => r.reportsToRoleId === myRole.id && scope.canSee(r.id)) : [];

  // Clear to Work for the crew, read from the Compliance pillar of each role's card.
  const clear: { title: string; person: string | null; blocked: string[] }[] = [];
  for (const r of crew) {
    let blocked: string[] = [];
    if (period) {
      const { rows } = await getScorecard(r.id, period.id);
      if (isScored(r.level, rows.length)) {
        blocked = rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text);
      }
    }
    clear.push({ title: r.title, person: r.holder?.name ?? r.pencilled ?? null, blocked });
  }

  const meetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog');
  const today = new Date().toISOString().slice(0, 10);
  const talkDone = meetings.some(m => m.date === today && (m.minutes ?? '').startsWith('Toolbox'));

  const notClear = clear.filter(c => c.blocked.length);

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link href="/my-page" className="font-serif text-lg text-ink">
            SPEC<span className="text-rust">.</span>
          </Link>
          <span className="label-caps">On site</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-xl gap-4 px-4 py-5">
        <div>
          <h1 className="font-serif text-2xl text-ink">{myRole?.title ?? 'On site'}</h1>
          <p className="mt-1 text-sm text-ink-light">
            Four things. Everything else waits until you are off the tools.
          </p>
        </div>

        {/* 1 — the talk. First because it happens before the crew leaves the yard. */}
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg text-ink">Toolbox talk</h2>
            <span className="text-sm" style={{ color: talkDone ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}>
              {talkDone ? 'Held today' : 'Not yet today'}
            </span>
          </div>
          {manage ? (
            <form action={logToolbox} className="mt-3 grid gap-2">
              <textarea
                className="input min-h-[64px] rounded-lg"
                name="topic"
                required
                placeholder="What the crew needs to hear before they start"
                aria-label="Toolbox talk topic"
              />
              <SubmitButton className="btn-primary py-3 text-base" pending="Logging…">Log the talk</SubmitButton>
            </form>
          ) : (
            <p className="mt-2 text-sm text-ink-light">Whoever runs the crew logs it.</p>
          )}
        </section>

        {/* 2 — the near miss. Reportable by anybody, including a readonly seat. */}
        <section className="card">
          <h2 className="font-serif text-lg text-ink">Something nearly went wrong</h2>
          <p className="mt-1 text-sm text-ink-light">
            Anybody can report this, and nothing about it counts against you. A near miss that is written
            down is the cheapest incident a business will ever have.
          </p>
          <form action={reportHazard} className="mt-3 grid gap-2">
            <textarea
              className="input min-h-[64px] rounded-lg"
              name="what"
              required
              placeholder="What happened, and where"
              aria-label="What happened"
            />
            <SubmitButton className="btn-primary py-3 text-base" pending="Sending…">Report it</SubmitButton>
          </form>
        </section>

        {/* 3 — clear to work. Pass or fail, and never a percentage. */}
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg text-ink">Clear to work</h2>
            <span className="text-sm" style={{ color: notClear.length ? LIGHT_COLOUR.red : LIGHT_COLOUR.green }}>
              {clear.length === 0 ? '—' : notClear.length ? `${notClear.length} not clear` : 'All clear'}
            </span>
          </div>
          {clear.length ? (
            <ul className="mt-3 grid gap-2">
              {clear.map(c => (
                <li key={c.title} className="card-inset flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-base text-ink">{c.person ?? 'Nobody in this role'}</span>
                    <span className="block text-xs text-ink-light">{c.title}</span>
                  </span>
                  <span
                    className="pill"
                    style={{
                      background: `color-mix(in srgb, ${c.blocked.length ? LIGHT_COLOUR.red : LIGHT_COLOUR.green} 14%, transparent)`,
                      color: c.blocked.length ? LIGHT_COLOUR.red : LIGHT_COLOUR.green,
                    }}
                  >
                    {c.blocked.length ? 'Not clear' : 'Clear'}
                  </span>
                  {c.blocked.length > 0 && (
                    <span className="w-full text-xs text-ink-light">{c.blocked.join('; ')}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-light">Nobody reports to you, so there is no crew to check.</p>
          )}
          <p className="mt-3 text-xs text-ink-light">
            Pass or fail, never a percentage. Somebody is either allowed on site or they are not.
          </p>
        </section>

        {/* 4 — where the day's work is. A link out, because the chart is not a phone screen. */}
        <section className="card">
          <h2 className="font-serif text-lg text-ink">The rest of the day</h2>
          <div className="mt-3 grid gap-2">
            <Link href="/my-page" className="btn-secondary py-3 text-center text-base">My four lights</Link>
            <Link href="/meeting" className="btn-secondary py-3 text-center text-base">This week&rsquo;s meeting</Link>
          </div>
        </section>

        <p className="pb-8 text-xs text-ink-light">
          Four things on purpose. A phone in a glove on one bar of signal is not the place to read a
          dashboard, and a page that tries to be one gets used by nobody.
        </p>
      </main>
    </div>
  );
}
