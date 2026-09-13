import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isNull, or, isNotNull, gte, desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { LIGHT_INK } from '@/lib/today';
import { summarise } from '@/lib/uptime';
import { running, runningLine } from '@/lib/running';
import { healthFacts } from '@/lib/health-facts';
import { lines, verdict, VERDICT_LINE, VERDICT_NOTE } from '@/lib/site-health';
import { HealthRows, HEALTH_TONE } from '@/components/health-rows';
import {
  health, pctLabel, seatProgress, money,
  SCALE_CHECKS, PHASES, CHANNELS, CHANNEL_TOTAL, MILESTONES,
  CONSULTING_TARGET, SOFTWARE_TARGET,
} from '@/lib/cockpit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPEC — cockpit' };

/**
 * Running SPEC Business Solutions.
 *
 * Not the client product. This is where the objectives live, where the build is up to, and the two
 * engines against real target numbers — the founder's own My Page, for the business that sells
 * My Page.
 *
 * **Private.** Gated on the same allowlist as /admin: an address in ADMIN_EMAILS, checked on the
 * server, on every request. Not a hidden link — a hidden link is not access control, and this page
 * carries commercial targets that are nobody else's business.
 *
 * Every figure is measured, a target, or absent with a reason. See lib/cockpit for why that rule is
 * written down rather than assumed.
 */

const PHASE_INK = {
  early: LIGHT_INK.red,
  building: LIGHT_INK.amber,
  compounding: LIGHT_INK.green,
} as const;

export default async function Cockpit() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  // Re-checked here rather than trusted from a link. See /admin — same rule, same reason.
  if (!isAdminEmail(user.email)) redirect('/my-page');

  /*
    Counted, not estimated.

    A look-around that nobody claimed is a tyre-kick, not a business, so it is excluded — counting
    them would be the first invented number on a page whose whole argument is that it has none.
  */
  const businesses = await db.select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(isNull(schema.tenants.lookId));

  const seatRows = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(or(isNotNull(schema.users.invitedAt), isNotNull(schema.users.acceptedAt)));

  const tenants = businesses.length;
  const seats = seatRows.length;

  // Consulting is not invoiced through SPEC, so there is nothing to count. Stated as known rather
  // than derived — and marked as such on the card.
  const consultingClients = 1;

  /*
    Thirty days of real checks. Ordered newest first and capped: a month is 8,640 rows at one every
    five minutes, and reading them all to take a median is work the page does not need to do.
  */
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const pings = await db.select({
    at: schema.healthPings.at,
    ok: schema.healthPings.ok,
    ms: schema.healthPings.ms,
  })
    .from(schema.healthPings)
    .where(gte(schema.healthPings.at, since))
    .orderBy(desc(schema.healthPings.at))
    .limit(10_000);

  const uptime = summarise(pings);
  const figures = health({ tenants, seats, consultingClients }, uptime);
  const version = running(process.env);

  // The same answer /status gives, from the same code. Two screens that disagree about whether the
  // product is working would be worse than either alone — see lib/health-facts.
  const facts = await healthFacts();
  const working = lines(facts);
  const overall = verdict(working);
  const seatPct = seatProgress(seats);
  const ready = SCALE_CHECKS.filter(c => c.done).length;

  return (
    <Shell
      title="Running SPEC Business Solutions"
      subtitle={`${user.email} · private`}
    >
      <p className="-mt-2 mb-6 max-w-2xl text-base text-ink-light">
        Not the client product. This is where you set objectives, see where the build is up to, and
        track the two engines against real target numbers.
      </p>

      {/*
        What is actually running, before any other number on the page.

        The question underneath every other one here, and until now unanswerable without opening a
        build log: is the thing I am looking at the thing that was built? This project shipped work
        for months that never reached production — builds green, deploys succeeded, live site
        unchanged — and there was no way to see that from inside the product. Now the running
        version says what it is, on the page that gets opened anyway.
      */}
      <section className="mb-8 rounded-lg border border-ink/10 bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label-caps">What is running</span>
          <span
            className="text-xs font-medium"
            style={{ color: version.live ? LIGHT_INK.green : LIGHT_INK.pending }}
          >
            {version.live ? 'Live site' : version.ref ? `${version.where} build` : 'Not built from a commit'}
          </span>
        </div>
        {version.what && (
          <p className="mt-2 font-serif text-lg text-ink">
            {version.href
              ? <a href={version.href} className="hover:text-rust">{version.what}</a>
              : version.what}
          </p>
        )}
        {(version.ref || version.by) && (
          <p className="mt-1 text-xs text-ink-light">
            {[version.ref, version.by].filter(Boolean).join(' \u00b7 ')}
          </p>
        )}
        <p className="mt-2 max-w-2xl text-sm text-ink-light">{runningLine(version)}</p>
      </section>

      {/* ── The two engines ─────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">Consulting</h2>
            <span className="label-caps">Target: {CONSULTING_TARGET.clients} clients</span>
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">{consultingClients}</p>
          <p className="mt-1 text-sm text-ink-light">
            of {CONSULTING_TARGET.clients} clients signed
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="card-inset">
              <dt className="label-caps">Revenue run-rate</dt>
              <dd className="mt-1 font-serif text-lg text-ink">
                {money(consultingClients * CONSULTING_TARGET.perClientMonthly)}/mo
              </dd>
            </div>
            <div className="card-inset">
              <dt className="label-caps">Target</dt>
              <dd className="mt-1 font-serif text-lg text-ink">{CONSULTING_TARGET.revenue}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-light">
            At {money(CONSULTING_TARGET.perClientMonthly)} a month per client. Consulting is not
            invoiced through SPEC, so this figure is kept in <code className="text-ink">lib/cockpit</code> rather
            than counted — the one number on this page that is neither measured nor a target.
          </p>
        </section>

        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">Software</h2>
            <span className="label-caps">Target: {SOFTWARE_TARGET.seats.toLocaleString('en-AU')} seats</span>
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">{seats}</p>
          <p className="mt-1 text-sm text-ink-light">
            of {SOFTWARE_TARGET.seats.toLocaleString('en-AU')} seats · {pctLabel(seats, SOFTWARE_TARGET.seats)}
          </p>
          {/*
            The bar is clamped; the label above it is not. A cockpit that flatters the pilot is
            worse than no cockpit — see pctLabel.
          */}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-rust" style={{ width: `${Math.max(0.5, seatPct)}%` }} />
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="card-inset">
              <dt className="label-caps">Businesses</dt>
              <dd className="mt-1 font-serif text-lg text-ink">{tenants}</dd>
            </div>
            <div className="card-inset">
              <dt className="label-caps">ARR target</dt>
              <dd className="mt-1 font-serif text-lg text-ink">{SOFTWARE_TARGET.arr}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-light">
            Seats and businesses are counted from the database on every load. Retention needs a
            second month of billing before it means anything, so it is not shown yet rather than
            shown as 100%.
          </p>
        </section>
      </div>

      {/*
        Is it working — the same five rows /status shows, on the page the owner already has open.

        They were two pages answering one question, which is one page too many: "should I be
        worried?" is not a question anybody should have to ask in two places. /status still exists
        and still needs no sign-in, because its job is answering that at the moment somebody CANNOT
        sign in — but for the person who can, this is where it lives.
      */}
      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl" style={{ color: HEALTH_TONE[overall] }}>
            {VERDICT_LINE[overall]}
          </h2>
          <a href="/status" className="text-xs text-ink-light underline">
            The same page, without signing in
          </a>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">{VERDICT_NOTE[overall]}</p>
        <div className="mt-5">
          <HealthRows rows={working} />
        </div>
      </section>

      {/* ── What it is carrying, and what it is ready for ───────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Size and readiness</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Multi-tenant from the first day — every business&rsquo;s data cleanly separated — on
          infrastructure that does not need rebuilding between forty users and twenty thousand.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {figures.map(f => (
            <div key={f.label} className="card-inset">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="label-caps">{f.label}</span>
                {f.kind === 'unmeasured' && (
                  <span className="text-xs" style={{ color: LIGHT_INK.pending }}>Not measured here</span>
                )}
              </div>
              {f.value !== null && <p className="mt-1 font-serif text-2xl text-ink">{f.value}</p>}
              <p className="mt-1 text-xs text-ink-light">{f.note}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 font-serif text-base text-ink">
          Ready to carry twenty thousand seats — {ready} of {SCALE_CHECKS.length}
        </h3>
        <ul className="mt-3 grid gap-3">
          {SCALE_CHECKS.map(c => (
            <li key={c.label} className="border-b border-ink/10 pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{c.label}</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: c.done ? LIGHT_INK.green : LIGHT_INK.amber }}
                >
                  {c.done ? 'In place' : 'Not yet'}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-light">{c.evidence}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The road ────────────────────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">The path to twenty thousand seats</h2>
        <p className="mt-1 text-sm text-ink-light">Pay to get in, then earn the right to stop paying.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {PHASES.map(p => (
            <div key={p.tag} className="card-inset">
              <span className="label-caps" style={{ color: PHASE_INK[p.tone] }}>{p.tag}</span>
              <p className="mt-1 font-serif text-lg text-ink">{p.title}</p>
              <p className="mt-2 text-sm text-ink-light">{p.body}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 font-serif text-base text-ink">Illustrative channel mix</h3>
        <p className="mt-1 text-xs text-ink-light">
          ~{CHANNEL_TOTAL.toLocaleString('en-AU')} seats — a shape for thinking with, not a forecast
          and not a commitment.
        </p>
        <div className="mt-4 grid max-w-2xl gap-3">
          {CHANNELS.map(c => (
            <div key={c.label} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{c.label}</span>
                <span className="font-serif text-sm text-ink">{c.seats.toLocaleString('en-AU')} seats</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-sage"
                  style={{ width: `${(c.seats / CHANNELS[0].seats) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-xs text-ink-light">
          Three of the five are referral-based and carry the volume; paid fills the top of the
          funnel. That is the argument of the chart — the money spent early buys the customers who
          bring the rest.
        </p>
      </section>

      {/* ── Decisions waiting on the business being ready ───────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">When the business can afford it</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Decisions with a trigger rather than a date. Written down here so they are made when the
          condition is met, not when somebody happens to remember them.
        </p>
        <ul className="mt-5 grid gap-4">
          {MILESTONES.map(m => (
            <li key={m.what} className="card-inset">
              <p className="font-serif text-lg text-ink">{m.what}</p>
              <p className="mt-1 text-sm" style={{ color: LIGHT_INK.amber }}>{m.when}</p>
              <p className="mt-2 text-sm text-ink-light">{m.why}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Talk to build ───────────────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Talk to build</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          SPEC Business Solutions runs on SPEC itself. An objective or a problem the business is
          facing goes in the improvement register, the same one a customer uses — read, ranked,
          given an owner and a date.
        </p>
        <Link href="/my-page" className="btn-primary mt-4 inline-block">Log it on My Page</Link>
        <p className="mt-3 text-xs text-ink-light">
          Deliberately not a second, private place to type things. A business that keeps its own
          problems somewhere other than the system it sells is not using the system it sells.
        </p>
      </section>
    </Shell>
  );
}
