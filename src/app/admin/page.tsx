import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

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
const PLAN_LABEL: Record<string, string> = { trial: 'Free', basic: 'Paying', program: 'Program', lapsed: 'Lapsed' };

export default async function Admin() {
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

        <section className="mt-8">
          <h2 className="label-caps">All businesses</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase text-ink-light">
                <tr><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Started</th><th className="p-3">Administrator</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.tenant.id} className="border-t align-top">
                    <td className="p-3 font-medium">{r.tenant.name}</td>
                    <td className="p-3">{PLAN_LABEL[r.tenant.plan] ?? r.tenant.plan}</td>
                    <td className="p-3">{r.tenant.startDate.slice(0, 10)}</td>
                    <td className="p-3">{r.contact ? <>{r.contact.name}<div className="text-xs text-ink-light">{r.contact.email}</div></> : <span className="text-ink-light/60">none</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="mt-6 text-xs text-ink-light"><Link href="/journey" className="underline">Back to the app</Link></p>
        <Footer />
      </main>
    </div>
  );
}
