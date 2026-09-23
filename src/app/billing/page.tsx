import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { planStateFor, costLabel, seatBreakdown } from '@/lib/plan';
import { seatLabel } from '@/lib/pricing';
import { requestCurrency } from '@/lib/request-currency';
import { getScope } from '@/lib/scope';
import { seatKindFor } from '@/lib/chart-seats';
import { setSeatKind } from '@/app/org/actions';

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
  billing_error: { tone: 'warn', text: "We couldn't open the payment page just then. Nothing has been charged. Try again, and if it happens twice email manager@specbizhq.com and we'll sort it at our end." },
};

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const currency = await requestCurrency();
  const plan = await planStateFor(user.tenantId, currency);

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
      chartKind: seatKindFor({ title: r.title, hasDirectReports: leadsSet.has(r.id) }),
      override: (r.holder!.seatKindOverride as 'leadership' | 'team' | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /*
    The total, itemised — see `seatBreakdown`. Leadership is counted from the list below so the
    sentence and the list can never disagree; everyone else with a seat is a team seat.
  */
  const leadHeads = seatRows.filter(r => (r.override ?? r.chartKind) === 'leadership').length;
  const teamHeads = Math.max(0, plan.seats - leadHeads);
  const breakdown = seatBreakdown({ leadership: leadHeads, team: teamHeads, training: plan.trainingSeats }, currency);
  /*
    The free seat is the first leadership seat — the person who started the business (Kris, 23
    September). Shown against the leader at the top of the chart, or the first leader listed.
  */
  const leaders = seatRows.filter(r => (r.override ?? r.chartKind) === 'leadership');
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
  const flag = Object.keys(BILLING_NOTICE).find(k => sp[k]) ?? '';
  const notice: { tone: 'ok' | 'warn'; text: string } | undefined =
    flag === 'upgraded' && !plan.subscribed
      ? {
          tone: 'warn',
          text: `Stripe took a payment, but nothing is recorded against ${tenant.name} yet. If you paid a moment ago, refresh this page — it usually lands within a few seconds. If you were signed in as a different business when you paid, the payment belongs to that one, not this one.`,
        }
      : BILLING_NOTICE[flag];

  return (
    <Shell title="Pricing" subtitle={costLabel(plan)}>
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
                      ? `${(row.override ?? row.chartKind) === 'leadership' ? 'Leadership' : 'Team'} seat · free — started the business`
                      : (row.override ?? row.chartKind) === 'leadership'
                        ? `Leadership seat · ${seatLabel(currency, 'leadership')} a month`
                        : `Team seat · ${seatLabel(currency, 'team')} a month`}
                  </span>
                  {!scope.canInvite && (
                    <span className="text-[12.5px] text-ink-light">
                      {(row.override ?? row.chartKind) === 'leadership' ? 'Leadership seat' : 'Team seat'}
                    </span>
                  )}
                </div>
                {scope.canInvite && (
                  <form action={setSeatKind} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="roleId" value={row.roleId} />
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
