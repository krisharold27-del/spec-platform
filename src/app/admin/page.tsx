import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { REFUSAL_SAID } from '@/lib/delete-business';
import { DETACH_SAID } from '@/lib/detach-stripe';
import { SETTABLE_PLANS, PLAN_MEANING, type SettablePlan } from '@/lib/plan';
import { PACKAGES, PACKAGE_KEYS, packageOf, packagePrice } from '@/lib/pricing';
import { SubmitButton } from '@/components/submit-button';
import { setPlan, setPackage, removeBusiness, detachStripe, retryGuarantee } from './actions';
import { creditLabel, monthName } from '@/lib/guarantee';
import { summariseClaims, FRICTION_KINDS, areaOf } from '@/lib/switch';

export const dynamic = 'force-dynamic';

/*
 * The SPEC operator's view: the account, never the business inside it (BUILD_SPEC §9.1).
 *
 * Business name, plan, when it started, who administers it, and whether they asked for the
 * Program — what billing and a sales call need. Nothing derived from what a customer has put into
 * SPEC appears here: not their chart, scores, diagnostic or progress. And there is deliberately no
 * "sign in as": SPEC as a company has no way into a customer's business. What support would do
 * inside a business is owed to the customer's own administrator screen instead.
 */
const PLAN_LABEL: Record<string, string> = {
  trial: 'Free', beta: 'Beta — free', basic: 'Paying', program: 'Program', lapsed: 'Lapsed',
};

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  if (!isAdminEmail(user.email)) redirect('/journey');

  const tenants = await db.select().from(schema.tenants);
  const seats = await db.select({ tenantId: schema.users.tenantId, name: schema.users.name, email: schema.users.email, access: schema.users.access })
    .from(schema.users);
  // The account contact is whoever administers it — a seat, which is account data, not the chart.
  const contactFor = (tenantId: string) => {
    const mine = seats.filter(s => s.tenantId === tenantId);
    return mine.find(s => s.access === 'administrator') ?? mine[0] ?? null;
  };

  const rows = tenants
    .map(t => ({ tenant: t, contact: contactFor(t.id) }))
    .sort((a, b) => b.tenant.startDate.localeCompare(a.tenant.startDate));
  /*
    The Simple Guarantee — "if switching isn't easy, that month is free". A claim is billing data: the
    business, the month, the area. The business's own note is never selected here; the kind is a
    fixed-list choice, counted across every business so SPEC can fix what goes wrong.
  */
  const friction = await db.select({
    tenantId: schema.switchFriction.tenantId, month: schema.switchFriction.month,
    area: schema.switchFriction.area, kind: schema.switchFriction.kind, at: schema.switchFriction.createdAt,
  }).from(schema.switchFriction);
  const guarantee = summariseClaims(friction);
  /* What each claim actually took off the bill — applied by SPEC the moment it was made (lib/guarantee). */
  const credits = await db.select().from(schema.guaranteeCredits);
  const creditFor = (tenantId: string, month: string) => credits.find(c => c.tenantId === tenantId && c.month === month);
  const nameOf = (tenantId: string) => tenants.find(t => t.id === tenantId)?.name ?? 'A business no longer here';

  const programRequests = rows.filter(r => r.tenant.programRequestedAt)
    .sort((a, b) => (b.tenant.programRequestedAt ?? '').localeCompare(a.tenant.programRequestedAt ?? ''));

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-serif text-lg tracking-tight text-ink">SPEC<span className="text-rust">.</span> <span className="label-caps align-middle">Admin</span></span>
          <span className="text-sm text-ink-light">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-serif text-2xl text-ink">Accounts</h1>
        <p className="mt-1 text-sm text-ink-light">{tenants.length} businesses · {rows.filter(r => r.tenant.plan === 'basic' || r.tenant.plan === 'program').length} paying. Accounts only — what is inside a business is not visible to SPEC.</p>

        {programRequests.length > 0 && (
          <section className="mt-6">
            <h2 className="label-caps">Program requests — call within 48h</h2>
            <ul className="mt-2 divide-y rounded-lg border bg-surface text-sm">
              {programRequests.map(r => (
                <li key={r.tenant.id} className="flex items-center justify-between p-3">
                  <span><b>{r.tenant.name}</b> {r.contact && <span className="text-ink-light">· {r.contact.name} · {r.contact.email}</span>}</span>
                  <span className="text-ink-light">requested {r.tenant.programRequestedAt?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guarantee.claims.length > 0 && (
          <section className="mt-6" data-guarantee-claims>
            <h2 className="label-caps">Simple Guarantee — months SPEC has taken off the bill</h2>
            <ul className="mt-2 divide-y rounded-lg border bg-surface text-sm">
              {guarantee.claims.map(c => {
                const credit = creditFor(c.tenantId, c.month);
                return (
                  <li key={`${c.tenantId}:${c.month}`} className="flex flex-wrap items-center justify-between gap-2 p-3" data-guarantee-credit={credit?.status ?? 'none'}>
                    <span><b>{nameOf(c.tenantId)}</b> <span className="text-ink-light">· {monthName(c.month)} · {areaOf(c.area)?.noun ?? c.area} · claimed {c.at.slice(0, 10)}</span></span>
                    {credit?.status === 'applied' && (
                      <span className="text-ink">Credited {creditLabel(credit.amount, credit.currency)} <span className="text-ink-light">· {credit.stripeTransactionId}</span></span>
                    )}
                    {credit?.status === 'free' && <span className="text-ink-light">Nothing to credit — not paying yet</span>}
                    {(!credit || credit.status === 'failed' || credit.status === 'pending') && (
                      <form action={retryGuarantee} className="flex items-center gap-2">
                        <span className="text-rust-700">Not credited{credit?.error ? ` — ${credit.error}` : ''}</span>
                        <input type="hidden" name="tenantId" value={c.tenantId} />
                        <input type="hidden" name="month" value={c.month} />
                        <SubmitButton className="btn-secondary px-3 py-1 text-xs">Try again</SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-light">
              What was not easy, across every business: {FRICTION_KINDS.map(k => `${k.label} ${guarantee.kinds[k.key] ?? 0}`).join(' · ')}.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="label-caps">All businesses</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase text-ink-light">
                <tr><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Started</th><th className="p-3">Administrator</th><th className="p-3">Billing</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.tenant.id} className="border-t align-top">
                    <td className="p-3 font-medium">{r.tenant.name}</td>
                    <td className="p-3">{PLAN_LABEL[r.tenant.plan] ?? r.tenant.plan}</td>
                    <td className="p-3">{r.tenant.startDate.slice(0, 10)}</td>
                    <td className="p-3">{r.contact ? <>{r.contact.name}<div className="text-xs text-ink-light">{r.contact.email}</div></> : <span className="text-ink-light/60">none</span>}</td>
                    {/*
                      Whether this business is charged, decided here rather than in the database.
                      `lapsed` is deliberately not offered — that is Stripe's consequence, not a
                      button, and it makes a business read-only.
                    */}
                    <td className="p-3">
                      <form action={setPlan} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="tenantId" value={r.tenant.id} />
                        <select
                          name="plan"
                          defaultValue={SETTABLE_PLANS.includes(r.tenant.plan as SettablePlan) ? r.tenant.plan : 'trial'}
                          aria-label={`Plan for ${r.tenant.name}`}
                          className="rounded-lg border border-ink/20 bg-surface px-2 py-1 text-sm"
                        >
                          {SETTABLE_PLANS.map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                        </select>
                        <SubmitButton className="rounded-full border border-ink/20 px-3 py-1 text-xs text-ink hover:border-rust hover:text-rust">
                          Set
                        </SubmitButton>
                      </form>
                      <div className="mt-1 max-w-[28ch] text-xs text-ink-light">
                        {PLAN_MEANING[r.tenant.plan] ?? ''}
                      </div>

                      {/*
                        Which of the four they are buying — set here and never by the customer.

                        Two of these are a seat price and could safely be self-serve. The other two
                        are a share of one person's week, and a business that clicks its way into
                        one has bought time that may not exist. There are only so many Tuesdays.
                      */}
                      <form action={setPackage} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="tenantId" value={r.tenant.id} />
                        <select
                          name="package"
                          defaultValue={packageOf(r.tenant.package)}
                          aria-label={`Package for ${r.tenant.name}`}
                          className="rounded-lg border border-ink/20 bg-surface px-2 py-1 text-sm"
                        >
                          {PACKAGE_KEYS.map(k => (
                            <option key={k} value={k}>{PACKAGES[k].label}</option>
                          ))}
                        </select>
                        <SubmitButton className="rounded-full border border-ink/20 px-3 py-1 text-xs text-ink hover:border-rust hover:text-rust">
                          Set
                        </SubmitButton>
                      </form>
                      <div className="mt-1 max-w-[34ch] text-xs text-ink-light">
                        {PACKAGES[packageOf(r.tenant.package)].what}{' '}
                        <b>{packagePrice(packageOf(r.tenant.package))}</b>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/*
          Clearing a test business, permanently.

          Kris, 16 September: "yes build a safe way to clear the test businesses". The safety IS the
          feature — see lib/delete-business. It sits at the bottom, behind typing the name, because
          nothing above it is irreversible and this is.

          A business Stripe has ever heard of cannot be deleted here at any amount of typing. That
          guard is not about slips; it is about being wrong that a business is a test.
        */}
        <section className="mt-12 rounded-lg border border-rust-300 bg-rust-100 p-5">
          <h2 className="font-serif text-xl text-rust-800">Clear a test business</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink">
            Permanent, and there is no undo. Everything the business has — its chart, its people, its
            months, its problems — goes. A business that has ever been through Stripe is refused here
            however carefully you type, because money means it is somebody&apos;s real business
            whatever it is called.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-ink-light">
            If one of those was only ever a test, <b>Take it off Stripe</b> asks Stripe directly —
            not you — whether it is a paying customer. Stripe deciding is the point: a running
            subscription, a settled invoice, or any doubt at all, and it refuses. Only once the marks
            are off does Delete appear, and the name has to be typed again for it.
          </p>

          {sp.deleted && (
            <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-ink">
              Deleted, and the database was checked afterwards: nothing was left pointing at it.
            </p>
          )}
          {typeof sp.refused === 'string' && (
            <p className="mt-3 rounded-lg border-l-4 border-rust-400 bg-surface p-3 text-sm text-ink">
              {REFUSAL_SAID[sp.refused as keyof typeof REFUSAL_SAID] ?? 'Nothing was deleted.'}
            </p>
          )}
          {sp.detached && (
            <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-ink">
              Stripe was asked, and said this is not a paying customer. The marks are off — it can be
              deleted now, and that is still a separate press with the name typed again.
            </p>
          )}
          {typeof sp.nodetach === 'string' && (
            <p className="mt-3 rounded-lg border-l-4 border-rust-400 bg-surface p-3 text-sm text-ink">
              {DETACH_SAID[sp.nodetach as keyof typeof DETACH_SAID] ?? 'Nothing was changed.'}
            </p>
          )}

          <ul className="mt-4 space-y-2">
            {rows.filter(r => r.tenant.id !== user.tenantId).map(({ tenant }) => {
              const paid = Boolean(tenant.stripeCustomerId) || Boolean(tenant.stripeSubscriptionId);
              return (
                <li key={tenant.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm">
                  <span className="font-medium text-ink">{tenant.name}</span>
                  <span className="text-xs text-ink-light">{tenant.plan} · started {tenant.startDate}</span>
                  {paid ? (
                    /*
                      Not a dead end any more.

                      This said only "cannot be deleted here", which was true and left Hall
                      Contracting — a test-mode business from months ago — on the list with no way
                      off it. Taking the Stripe marks off is a SEPARATE act, with its own typed
                      confirmation, and SPEC asks Stripe whether this is real money rather than
                      trusting whoever pressed the button. If Stripe says customer, this refuses
                      too, and the delete below stays refused until the marks are genuinely gone.
                    */
                    <form action={detachStripe} className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="rounded bg-sage-200 px-2 py-0.5 text-xs font-medium text-sage-900">
                        Has been through Stripe
                      </span>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input
                        name="confirmName"
                        placeholder="type the name to confirm"
                        autoComplete="off"
                        className="rounded-lg border border-ink/20 px-3 py-1.5 text-xs"
                      />
                      <SubmitButton className="btn-secondary text-xs" pending="Asking Stripe…">
                        Take it off Stripe
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={removeBusiness} className="ml-auto flex flex-wrap items-center gap-2">
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input
                        name="confirmName"
                        placeholder="type the name to confirm"
                        autoComplete="off"
                        className="rounded-lg border border-ink/20 px-3 py-1.5 text-xs"
                      />
                      <SubmitButton className="btn-secondary text-xs" pending="Deleting…">Delete</SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <p className="mt-6 text-xs text-ink-light"><Link href="/journey" className="underline">Back to the app</Link></p>
        <Footer />
      </main>
    </div>
  );
}
