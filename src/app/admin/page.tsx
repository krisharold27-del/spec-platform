import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { journeyFor } from '@/lib/journey';
import { getRoles } from '@/lib/queries';
import { stuckOnStepNudgeTemplate } from '@/lib/email';

/*
 * There is deliberately no "sign in as". SPEC as a company has no access to a customer's business:
 * no support tool renders it and there is no break-glass (BUILD_SPEC §9.1). What support would do
 * inside a business is owed to the customer's own administrator screen instead.
 */

export const dynamic = 'force-dynamic';

const PLAN_LABEL: Record<string, string> = { trial: 'Trial', basic: 'Basic', program: 'Program', lapsed: 'Lapsed' };
const STUCK_DAYS = 7;

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function lastActivityFor(tenantId: string, fallback: string) {
  const [users, diag] = await Promise.all([
    db.select({ acceptedAt: schema.users.acceptedAt }).from(schema.users).where(eq(schema.users.tenantId, tenantId)),
    db.select({ answeredAt: schema.diagnostics.answeredAt }).from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, tenantId)),
  ]);
  const dates = [fallback, ...users.map(u => u.acceptedAt), ...diag.map(d => d.answeredAt)].filter((d): d is string => !!d);
  return dates.sort().at(-1) ?? fallback;
}

export default async function Admin() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  if (!isAdminEmail(user.email)) redirect('/journey');

  const tenants = await db.select().from(schema.tenants);

  const rows = await Promise.all(tenants.map(async t => {
    const steps = await journeyFor(t.id);
    const done = steps.filter(s => s.status === 'done').length;
    const next = steps.find(s => s.status !== 'done');
    const roles = await getRoles(t.id);
    const gm = roles.find(r => r.level === 'gm');
    const lastActivity = await lastActivityFor(t.id, t.startDate);
    const stuckDays = daysAgo(lastActivity);
    const stuck = !!next && stuckDays >= STUCK_DAYS;
    return { tenant: t, done, total: steps.length, next, gm, lastActivity, stuckDays, stuck };
  }));
  rows.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  const programRequests = rows.filter(r => r.tenant.programRequestedAt).sort((a, b) => (b.tenant.programRequestedAt ?? '').localeCompare(a.tenant.programRequestedAt ?? ''));

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-serif text-lg font-bold tracking-tight text-ink">SPEC<span className="text-rust">.</span> <span className="label-caps align-middle">Admin</span></span>
          <span className="text-sm text-ink-light">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-serif text-2xl font-bold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink-light">{tenants.length} businesses · {rows.filter(r => r.tenant.plan === 'basic' || r.tenant.plan === 'program').length} paying · {rows.filter(r => r.stuck).length} stuck 7+ days</p>

        {programRequests.length > 0 && (
          <section className="mt-6">
            <h2 className="label-caps">Program requests — call within 48h</h2>
            <ul className="mt-2 divide-y rounded-lg border bg-white text-sm">
              {programRequests.map(r => (
                <li key={r.tenant.id} className="flex items-center justify-between p-3">
                  <span><b>{r.tenant.name}</b> {r.gm && <span className="text-ink-light">· {r.gm.holder?.name} · {r.gm.holder?.email}</span>}</span>
                  <span className="text-ink-light">requested {r.tenant.programRequestedAt?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rows.some(r => r.stuck) && (
          <section className="mt-6">
            <h2 className="label-caps">Stuck 7+ days — one email each, template below</h2>
            <ul className="mt-2 space-y-3">
              {rows.filter(r => r.stuck).map(r => {
                const name = r.gm?.holder?.name ?? 'there';
                const email = r.gm?.holder?.email;
                const tpl = stuckOnStepNudgeTemplate({ name, businessName: r.tenant.name, stepTitle: r.next!.title, stepHref: r.next!.href });
                const mailto = email ? `mailto:${email}?subject=${encodeURIComponent(tpl.subject)}&body=${encodeURIComponent(tpl.body)}` : undefined;
                return (
                  <li key={r.tenant.id} className="rounded-lg border bg-white p-4 text-sm">
                    <div className="flex items-baseline justify-between">
                      <div><b>{r.tenant.name}</b> — stuck on "{r.next!.title}" · {r.stuckDays} days since last activity</div>
                      {mailto ? <a href={mailto} className="rounded bg-rust px-3 py-1 text-xs text-white hover:bg-rust-dark">Open email</a> : <span className="text-xs text-ink-light/60">no GM email on file</span>}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-cream/40 p-3 text-xs text-ink-light">{tpl.subject}{'\n\n'}{tpl.body}</pre>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="label-caps">All businesses</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase text-ink-light">
                <tr><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Journey</th><th className="p-3">Last activity</th><th className="p-3">GM</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.tenant.id} className="border-t align-top">
                    <td className="p-3 font-medium">{r.tenant.name}</td>
                    <td className="p-3">{PLAN_LABEL[r.tenant.plan] ?? r.tenant.plan}</td>
                    <td className="p-3">{r.done} of {r.total}{r.next && <div className="text-xs text-ink-light">next: {r.next.title}</div>}</td>
                    <td className="p-3">{r.lastActivity.slice(0, 10)} <span className="text-xs text-ink-light/60">({r.stuckDays}d ago)</span></td>
                    <td className="p-3">{r.gm?.holder ? <>{r.gm.holder.name}<div className="text-xs text-ink-light">{r.gm.holder.email}</div></> : <span className="text-ink-light/60">vacant</span>}</td>
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
