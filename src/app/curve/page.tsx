import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell, pct } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getCurve } from '@/lib/boards-data';
import { phases, depth, comparison, points, HAND_BUILT_DISCOVERY_DAYS } from '@/lib/jcurve';
import { LIGHT_COLOUR } from '@/lib/today';

export const dynamic = 'force-dynamic';

const STATE_COLOUR = {
  done: LIGHT_COLOUR.green,
  current: LIGHT_COLOUR.amber,
  waiting: LIGHT_COLOUR.pending,
} as const;

/**
 * Your J curve.
 *
 * Every transformation dips before it climbs, and the dip is normally deep because the early weeks
 * go on discovery — finding out what is wrong, chasing numbers, building the picture by hand.
 * Nothing improves during that, because nothing is visible yet.
 *
 * SPEC's claim is a shallower curve, and the mechanism is specific: when the business's own systems
 * feed the KPIs, the picture exists the day they connect. This page measures whether that actually
 * happened here rather than asserting that it did — including saying so when it did not.
 */
export default async function Curve() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const input = await getCurve(user);

  const all = phases(input);
  const d = depth(input.closedMonths);
  const c = comparison(input);
  const plot = points(input);
  const scored = plot.filter(p => p.value !== null);

  return (
    <Shell
      title="Your J curve"
      subtitle={`${tenant.name} · every transformation dips before it climbs. This is how deep yours went.`}
    >
      <section className="card">
        <div className="label-caps">The dip is discovery</div>
        <p className="mt-2 max-w-3xl font-serif text-xl leading-snug text-ink">{c.line}</p>
        <p className="mt-3 max-w-3xl text-sm text-ink-light">
          A transformation that builds its picture by hand spends most of a quarter on it: interviews,
          spreadsheet archaeology, and waiting on month end. Nothing improves while that is happening,
          because nothing is visible yet — that is the dip, and it is the only part SPEC claims to
          shorten.
        </p>
        <p className="mt-3 max-w-3xl text-xs text-ink-light">
          The {HAND_BUILT_DISCOVERY_DAYS} days is an assumption, not your data and not anybody
          else&rsquo;s — it is written down here so you can argue with it. Every other number on this page
          is your own record.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {all.map(p => (
          <div key={p.key} className="card" style={{ borderTopColor: STATE_COLOUR[p.state], borderTopWidth: 4 }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="label-caps">{p.label}</span>
              <span className="text-xs" style={{ color: p.state === 'waiting' ? undefined : STATE_COLOUR[p.state] }}>
                {p.state === 'done' ? 'Done' : p.state === 'current' ? 'Now' : 'Waiting'}
              </span>
            </div>
            <div className="mt-2 font-serif text-3xl text-ink">
              {p.days === null ? '—' : p.days}
              {p.days !== null && <span className="ml-1 text-sm text-ink-light">{p.days === 1 ? 'day' : 'days'}</span>}
            </div>
            <p className="mt-2 text-xs text-ink-light">{p.what}</p>
            <p className="mt-2 text-xs" style={{ color: p.state === 'current' ? LIGHT_COLOUR.amber : undefined }}>
              {p.note}
            </p>
          </div>
        ))}
      </section>

      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">The curve</h2>
          <span className="text-sm text-ink-light">
            {scored.length} closed {scored.length === 1 ? 'month' : 'months'}
          </span>
        </div>

        {/*
          The stretch before the first close is drawn with NO value rather than a low one. During
          discovery the business was not performing badly, it was invisible — and drawing an
          invented dip would be making the product's case with a number nobody measured.
        */}
        <div className="mt-5 flex items-end gap-3 overflow-x-auto pb-2">
          {plot.map(p => (
            <div key={p.label} className="flex min-w-[72px] flex-1 flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end justify-center">
                {p.value === null ? (
                  <div className="flex h-full w-full items-end justify-center rounded-lg border border-dashed border-ink/20">
                    <span className="pb-2 text-center text-[10px] leading-tight text-ink-light">
                      nothing<br />measured
                    </span>
                  </div>
                ) : (
                  <div
                    className="w-full rounded-t-lg"
                    style={{
                      height: `${Math.max(p.value * 100, 4)}%`,
                      background: p.value >= 0.9 ? LIGHT_COLOUR.green : p.value >= 0.75 ? LIGHT_COLOUR.amber : LIGHT_COLOUR.red,
                    }}
                  />
                )}
              </div>
              <span className="text-xs text-ink-light">{p.label}</span>
              <span className="font-mono text-xs text-ink">{p.value === null ? '—' : pct(p.value)}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-light">
          The dashed column is the time before anything could be measured. It is drawn empty rather than
          low on purpose: the business was not doing badly then, it was invisible, and a made-up dip
          would be the product arguing its own case with a number nobody took.
        </p>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-serif text-xl text-ink">How deep it actually went</h2>
          {d.lowest === null ? (
            <p className="mt-2 text-sm text-ink-light">
              No month has closed, so there is no depth to read yet. That is not a bad sign — it is the
              shape of a business that has not finished its first cycle.
            </p>
          ) : (
            <>
              <dl className="mt-4 grid gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-ink-light">Months closed below the standard</dt>
                  <dd className="font-serif text-xl text-ink">{d.monthsBelow}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-ink-light">Lowest month closed</dt>
                  <dd className="font-serif text-xl text-ink">{pct(d.lowest)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-ink-light">Reached the standard</dt>
                  <dd className="font-serif text-xl text-ink">{d.recoveredAt ?? 'Not yet'}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-ink-light">
                A J curve is really about morale and productivity, and SPEC measures neither. What it can
                say honestly is how many months you closed before you closed one at the standard — which is
                the part you were actually waiting through.
              </p>
            </>
          )}
        </section>

        <section className="rounded-lg bg-sage-100 p-4">
          <h2 className="font-serif text-xl text-ink">Why the dip is shallower here</h2>
          <p className="mt-2 text-sm text-ink">
            Discovery is the expensive part, and it is expensive because it is manual. When the systems
            you already run feed the KPIs, the picture exists the day they connect — so the engagement
            skips the mystery-solving and starts at the only thing that was ever going to move the
            numbers, which is people doing their jobs properly.
          </p>
          <p className="mt-3 text-sm text-ink-light">
            {input.tier === 'basic'
              ? 'You are on Basic, so this has not happened here. Every number is assembled by hand, which is a complete way to run SPEC and is not a shallow J curve. Advanced is what collapses discovery.'
              : c.collapsed
                ? 'It happened here. The linking phase above is the day it did.'
                : 'It has not happened here yet, because nothing is feeding. Connecting one system is what collapses the rest.'}
          </p>
          <Link
            href={input.tier === 'basic' ? '/pricing' : '/connections'}
            className="mt-4 inline-block text-sm text-rust-700 hover:underline"
          >
            {input.tier === 'basic' ? 'What Advanced changes →' : 'What SPEC reads →'}
          </Link>
        </section>
      </div>

      <p className="mt-8 max-w-2xl text-xs text-ink-light">
        Nothing on this page is a score and none of it counts towards anything. It exists so a business
        can see the shape of its own first months, including the parts that were slower than they should
        have been.
      </p>
    </Shell>
  );
}
