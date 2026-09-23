import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { planStateFor, costLabel, seatBreakdown, seatCountsFor, checkSubscription, type SeatCounts } from '@/lib/plan';
import { seatLabel, describeSubscriptionLine } from '@/lib/pricing';
import { requestCurrency } from '@/lib/request-currency';
import { getScope } from '@/lib/scope';
import { seatKindFor } from '@/lib/chart-seats';
import { setSeatKind } from '@/app/org/actions';
import { resyncSubscription } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Everything that decides the bill, in one place.
 *
 * Moved out of Journey on 22 September — Kris, having found what was then the AI-powered question
 * buried inside Journey's setup steps: *"put under pricing."* What it costs used to share a page
 * with "do the four questions", "build the chart" — money mixed into a setup checklist is money
 * nobody goes looking for. See the note on `/billing` in `lib/doors.ts`.
 *
 * The AI-powered question itself lasted one more day on this page before Kris retired it: *"i also
 * feel like i don't want to have 2 different prices... make it simple."* One seat price again — see
 * lib/pricing.
 */
const BILLING_NOTICE: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  upgraded: { tone: 'ok', text: 'Payment received. Nothing you set up before it has changed.' },
  upgrade_cancelled: { tone: 'warn', text: 'Checkout was cancelled, so nothing has been charged. Your trial is untouched and you can subscribe whenever you are ready.' },
  nothing_to_bill: { tone: 'ok', text: 'Nothing to pay — you have not invited anyone in yet, and the structure you are building is free.' },
  no_subscription: { tone: 'warn', text: "There's no subscription to manage yet — nothing has ever been charged. Use Start paying to set one up, and the Billing page appears once it's running." },
  /*
    Somebody is on the training seat and Stripe has no training price configured. Stopping is the
    point: falling back to the plain seat price would charge less for material meant to cost more,
    every month, and nothing anywhere would ever say so.
  */
  training_price_missing: {
    tone: 'warn',
    text: "Somebody here is on SPEC's training material, and the training price hasn't been set up in Stripe yet. "
      + "Nothing has been charged. Email manager@specbizhq.com and we'll switch it on — it takes a minute at our end.",
  },
  /*
    What pressing Save (or "Bring the subscription into line") did to the live subscription —
    `syncSubscriptionSeats`' own outcome, carried back by the action. Before 23 September a save here
    said nothing, whichever of five things had happened.
  */
  'seat_sync=updated': { tone: 'ok', text: 'Saved. The subscription now charges exactly what this page shows, from today, pro rata.' },
  'seat_sync=in_step': { tone: 'ok', text: 'Saved. The subscription already charged exactly what this page shows, so nothing about the bill changed.' },
  'seat_sync=no_subscription': { tone: 'ok', text: 'Saved. There is no running subscription yet, so there was nothing to change — the first payment will read the chart as it is.' },
  'seat_sync=no_stripe': { tone: 'warn', text: 'Saved here, but this copy of SPEC cannot reach the payment system, so the subscription was NOT changed. Email manager@specbizhq.com and we will put it right at our end.' },
  'seat_sync=failed': { tone: 'warn', text: 'Saved here, but the subscription could not be changed just then, so it is still charging the old amount. Press "Bring the subscription into line" below to try again; if it fails twice, email manager@specbizhq.com.' },
  billing_error: { tone: 'warn', text: "We couldn't open the payment page just then. Nothing has been charged. Try again, and if it happens twice email manager@specbizhq.com and we'll sort it at our end." },
};

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const currency = await requestCurrency();
  const plan = await planStateFor(user.tenantId, currency);
  // The same walk of the chart the total above and the subscription sync are counted from — see
  // `classifySeats`. Each row's label reads from it, so the list cannot disagree with the bill.
  const counts = await seatCountsFor(user.tenantId);

  /*
    Every billed person, in one flat list, so changing what somebody is billed as does not require
    finding their exact box on the chart first.
    Kris, 23 September, having just been sent hunting across the org chart for Janine's card:
    *"this should be possible to change from any leadership seat - this is too hard - make it
    simple."* The control already existed on the chart card — `setSeatKind` in `app/org/actions.ts`
    — this is the same action, reachable from a screen built for scanning names rather than reading
    a diagram. Gated by `scope.canInvite` exactly as the chart is: the same leadership-seat rule,
    just a shorter path to it.
  */
  const scope = await getScope(user);
  const leadsSet = new Set(scope.roles.map(r => r.reportsToRoleId).filter((x): x is string => Boolean(x)));
  const seatRows = scope.roles
    .filter(r => !r.isTeam && r.holder)
    .map(r => ({
      top: !r.reportsToRoleId,
      roleId: r.id,
      title: r.title,
      name: r.holder!.name,
      userId: r.holder!.id,
      chartKind: seatKindFor({ title: r.title, hasDirectReports: leadsSet.has(r.id) }),
      override: (r.holder!.seatKindOverride as 'leadership' | 'team' | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /*
    The total, itemised — see `seatBreakdown`.

    ── From the bill's own count, not from the list (23 September) ─────────────────────────────
    This used to count leaders from the rows below, which are read from ACTIVE roles only, while
    the total, the checkout and the subscription sync counted from every role ever drawn. A removed
    role still reporting to somebody made them a leader for Stripe and a team seat here, so this
    page could itemise A$151 while the sync pushed the old count and found nothing to change. Both
    now read `classifySeats`, and each row's label below reads its person's kind from the same map.
  */
  const kindOf = (row: { userId: string; override: 'leadership' | 'team' | null; chartKind: 'leadership' | 'team' }) =>
    counts.kinds.get(row.userId) ?? row.override ?? row.chartKind;
  const breakdown = seatBreakdown({ leadership: plan.leadershipHeads, team: plan.teamHeads, training: plan.trainingSeats }, currency);
  /*
    The free seat is the first leadership seat — the person who started the business (Kris, 23
    September). Shown against the leader at the top of the chart, or the first leader listed.
  */
  const leaders = seatRows.filter(r => kindOf(r) === 'leadership');
  const freeRoleId = (leaders.find(r => r.top) ?? leaders[0])?.roleId
    ?? (leaders.length === 0 ? seatRows[0]?.roleId : undefined);
  const Breakdown = () => breakdown.length > 0 ? (
    <ul className="mt-2 grid gap-0.5 text-[13px] text-ink-light">
      {breakdown.map(line => <li key={line}>{line}</li>)}
      <li>Each extra person adds {seatLabel(currency, 'team')} a month, or {seatLabel(currency, 'leadership')} if they lead a team.</li>
    </ul>
  ) : null;

  /*
    The banner has to agree with the page under it.

    `?upgraded=1` is a word in an address bar. Anybody can type it, and Stripe puts it there on the
    way back from a checkout that might have been started by a different business in a different
    tab. On 16 September it said "Payment received" above a page that still read "Nothing has been
    charged yet" — for a business that had never paid a cent.

    Checkout now returns people to the address they started on (lib/origin), which is the cause. This
    is the belt: the cheerful version is shown only when the business really is subscribed. When it
    is not, the honest thing is to say a payment happened somewhere and it was not here — which is
    also exactly right for the ordinary case where the webhook is two seconds behind the browser.
  */
  const flag = Object.keys(BILLING_NOTICE).find(k => {
    const [key, value] = k.split('=');
    return value === undefined ? Boolean(sp[key]) : sp[key] === value;
  }) ?? '';
  const cannot = typeof sp.cannot === 'string' ? sp.cannot : null;
  const notice: { tone: 'ok' | 'warn'; text: string } | undefined =
    flag === 'upgraded' && !plan.subscribed
      ? {
          tone: 'warn',
          text: `Stripe took a payment, but nothing is recorded against ${tenant.name} yet. If you paid a moment ago, refresh this page — it usually lands within a few seconds. If you were signed in as a different business when you paid, the payment belongs to that one, not this one.`,
        }
      : BILLING_NOTICE[flag];

  return (
    <Shell title="Pricing" subtitle={costLabel(plan)}>
      {cannot && (
        <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm text-ink">
          Not saved. {cannot}
        </div>
      )}
      {notice && (
        <div className={`mb-4 rounded-lg border-l-4 p-4 text-sm ${notice.tone === 'ok' ? 'border-sage-600 bg-sage-100 text-sage-900' : 'border-rust-400 bg-surface text-ink'}`}>
          {notice.text}
        </div>
      )}
      {/*
        `plan.readOnly`, not `plan.lapsed` — and the button goes wherever the fix actually is.

        Both halves were wrong on 16 September. A lapsed business of one was locked although the
        first seat is free and it owed nothing, and the one button on the screen posted to checkout,
        which found nothing to bill and returned it to this page. A dead end, over A$0.

        And where the fix lives depends on whether Stripe still has them. A subscription that is
        merely unpaid needs a new card, which is the portal; one that has been cancelled no longer
        exists, and the portal has nothing to open, so that business has to start a new one.
      */}
      {plan.readOnly && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rust-300 bg-rust-100 p-4 text-sm text-rust-800">
          <span>A payment didn&apos;t go through, so the business is read-only until it&apos;s sorted. Nothing has been deleted.</span>
          <form action={plan.subscribed ? '/api/stripe/portal' : '/api/stripe/checkout'} method="post">
            <button className="ml-4 shrink-0 rounded-full bg-rust-800 px-4 py-2 text-sm font-medium text-cream hover:bg-rust-900">
              {plan.subscribed ? 'Update card' : 'Start paying again'}
            </button>
          </form>
        </div>
      )}
      {/*
        * No trial and no countdown. Building the business costs nothing and never expires; the meter
        * starts only when a real person is invited in. A clock on someone who has just admitted four
        * things are going wrong is the last thing they need.
        */}
      {plan.free && (
        <div className="mb-4 rounded-lg border-l-4 border-sage-600 bg-surface p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-medium">Free — nothing to pay yet</div>
            <span className="label-caps text-[10px]">No card needed</span>
          </div>
          <p className="mt-1 text-ink-light">
            Draw the whole business, set every KPI, take as long as you like. It only costs anything once
            you invite a real person in — {seatLabel(currency, 'team')} a month each. Roles with nobody in them are always free.
          </p>
        </div>
      )}
      {/*
        Two different states, and conflating them was how the product ended up with no way to pay.

        A business that HAS subscribed gets Billing — Stripe's portal, for the card and the invoices.
        A business that has seats and has never subscribed needs a way to START, and for a long time
        there wasn't one: it was shown the same Billing button, the portal found no Stripe customer,
        and it was silently redirected back to this page with nothing said and nowhere else to click.
      */}
      {plan.needsCheckout && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">
          <span>
            <b>{costLabel(plan)}</b>
            <span className="text-ink-light"> · Nothing has been charged yet.</span>
            <Breakdown />
          </span>
          <form action="/api/stripe/checkout" method="post">
            <button className="shrink-0 rounded-full bg-rust-800 px-4 py-2 text-sm font-medium text-cream hover:bg-rust-900">
              Start paying
            </button>
          </form>
        </div>
      )}
      {plan.billing && plan.subscribed && (
        <div className="mb-4 flex items-baseline justify-between gap-3 rounded-lg bg-surface p-4 text-sm">
          <span><b>{costLabel(plan)}</b><Breakdown /></span>
          <form action="/api/stripe/portal" method="post"><button className="text-sm text-ink-light underline hover:text-rust">Billing</button></form>
        </div>
      )}
      {/*
        Does the live subscription charge what this page says? Asked on every load, streamed in
        after the page (Suspense), cached for a minute, and silent unless the answer is "no" — see
        `checkSubscription`. Added 23 September after two saves here left the subscription on the
        old count with nothing anywhere to say so.
      */}
      {plan.subscribed && tenant.stripeSubscriptionId && (
        <Suspense fallback={null}>
          <SubscriptionAgreement subscriptionId={tenant.stripeSubscriptionId} counts={counts} canFix={scope.canInvite} />
        </Suspense>
      )}

      {/*
        Who is billed as what — every person with a login, in one list, sorted by name rather than
        by where they sit on the chart. See the note above on why this exists.
      */}
      {seatRows.length > 0 && (
        <div className="mt-6 rounded-2xl bg-surface p-6 sm:p-8">
          <p className="font-serif text-[19px] text-ink">Who is billed as what</p>
          <p className="mt-1 max-w-[58ch] text-[13.5px] leading-[21px] text-ink-light">
            Read off the chart by default — the title, or whether anybody reports to the role.{' '}
            {scope.canInvite
              ? 'Change it by hand here for anybody the chart alone gets wrong, from any leadership seat — no need to find their card first.'
              : 'Only somebody on a leadership seat can change one.'}
          </p>
          <ul className="mt-4 grid gap-2">
            {seatRows.map(row => (
              <li key={row.roleId} className="rounded-xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">
                    <b>{row.name}</b> <span className="text-ink-light">· {row.title}</span>
                  </span>
                  <span className="text-[12.5px] font-medium text-ink">
                    {row.roleId === freeRoleId
                      ? `${kindOf(row) === 'leadership' ? 'Leadership' : 'Team'} seat · free — started the business`
                      : kindOf(row) === 'leadership'
                        ? `Leadership seat · ${seatLabel(currency, 'leadership')} a month`
                        : `Team seat · ${seatLabel(currency, 'team')} a month`}
                  </span>
                  {!scope.canInvite && (
                    <span className="text-[12.5px] text-ink-light">
                      {kindOf(row) === 'leadership' ? 'Leadership seat' : 'Team seat'}
                    </span>
                  )}
                </div>
                {scope.canInvite && (
                  <form action={setSeatKind} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="roleId" value={row.roleId} />
                    <input type="hidden" name="from" value="billing" />
                    <label className="sr-only" htmlFor={`seat-kind-${row.roleId}`}>Billed as, {row.name}</label>
                    <select
                      id={`seat-kind-${row.roleId}`}
                      name="seatKind"
                      defaultValue={row.override ?? 'auto'}
                      className="min-h-[36px] rounded-md border border-ink/15 bg-surface-raised px-2 text-sm text-ink"
                    >
                      <option value="auto">Auto — from the chart ({row.chartKind === 'leadership' ? 'Leadership' : 'Team'} seat right now)</option>
                      <option value="leadership">Leadership seat</option>
                      <option value="team">Team seat</option>
                    </select>
                    <button className="btn-secondary px-2.5 py-[7px] text-xs">Save</button>
                    {row.override && (
                      <span className="text-[12px] text-ink-light">
                        Set by hand — the chart alone would say{' '}
                        {row.chartKind === 'leadership' ? 'Leadership' : 'Team'}.
                      </span>
                    )}
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}

/**
 * The one line that says when the live subscription and this page disagree — and the fix beside it.
 * Renders nothing when they agree or when the answer could not be had in time; the latter is logged
 * (`[seat-sync] check`) rather than shown, because "could not check" on every slow load would be a
 * warning nobody reads.
 */
async function SubscriptionAgreement({ subscriptionId, counts, canFix }: { subscriptionId: string; counts: SeatCounts; canFix: boolean }) {
  const check = await checkSubscription(subscriptionId, counts);
  if (check.status !== 'differs') return null;
  const say = (lines: { price: string; quantity: number }[]) =>
    lines.length ? lines.map(describeSubscriptionLine).join(' and ') : 'nothing';
  return (
    <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm text-ink">
      <p>
        <b>The subscription is not charging what this page shows.</b> It is billing {say(check.stripe)};
        this page's bill is {say(check.target)}.
      </p>
      {canFix ? (
        <form action={resyncSubscription} className="mt-2">
          <button className="rounded-full bg-rust-800 px-4 py-2 text-sm font-medium text-cream hover:bg-rust-900">
            Bring the subscription into line
          </button>
        </form>
      ) : (
        <p className="mt-1 text-ink-light">Somebody on a leadership seat can bring it into line from this page.</p>
      )}
    </div>
  );
}
