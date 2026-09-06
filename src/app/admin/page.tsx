import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { journeyFor } from '@/lib/journey';
import { getRoles } from '@/lib/queries';
import { stuckOnStepNudgeTemplate } from '@/lib/email';
import { signInAs } from './actions';

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

export default async function Admin({ searchParams }: { searchParams: Promise<{ signin_error?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  if (!isAdminEmail(user.email)) redirect('/journey');
  const sp = await searchParams;

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
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-semibold tracking-tight">SPEC — Admin</span>
          <span className="text-sm text-slate-500">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-slate-500">{tenants.length} businesses · {rows.filter(r => r.tenant.plan === 'basic' || r.tenant.plan === 'program').length} paying · {rows.filter(r => r.stuck).length} stuck 7+ days</p>
        {sp.signin_error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-900">Couldn't generate a sign-in link — check SUPABASE_SERVICE_ROLE_KEY is set.</p>}

        {programRequests.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Program requests — call within 48h</h2>
            <ul className="mt-2 divide-y rounded-lg border bg-white text-sm">
              {programRequests.map(r => (
                <li key={r.tenant.id} className="flex items-center justify-between p-3">
                  <span><b>{r.tenant.name}</b> {r.gm && <span className="text-slate-500">· {r.gm.holder?.name} · {r.gm.holder?.email}</span>}</span>
                  <span className="text-slate-500">requested {r.tenant.programRequestedAt?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rows.some(r => r.stuck) && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stuck 7+ days — one email each, template below</h2>
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
                      {mailto ? <a href={mailto} className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700">Open email</a> : <span className="text-xs text-slate-400">no GM email on file</span>}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-600">{tpl.subject}{'\n\n'}{tpl.body}</pre>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">All businesses</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Journey</th><th className="p-3">Last activity</th><th className="p-3">GM</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.tenant.id} className="border-t align-top">
                    <td className="p-3 font-medium">{r.tenant.name}</td>
                    <td className="p-3">{PLAN_LABEL[r.tenant.plan] ?? r.tenant.plan}</td>
                    <td className="p-3">{r.done} of {r.total}{r.next && <div className="text-xs text-slate-500">next: {r.next.title}</div>}</td>
                    <td className="p-3">{r.lastActivity.slice(0, 10)} <span className="text-xs text-slate-400">({r.stuckDays}d ago)</span></td>
                    <td className="p-3">{r.gm?.holder ? <>{r.gm.holder.name}<div className="text-xs text-slate-500">{r.gm.holder.email}</div></> : <span className="text-slate-400">vacant</span>}</td>
                    <td className="p-3">
                      {r.gm?.holder && (
                        <form action={signInAs}><input type="hidden" name="email" value={r.gm.holder.email} />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-slate-100">Sign in as</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="mt-6 text-xs text-slate-500"><Link href="/journey" className="underline">Back to the app</Link></p>
      </main>
    </div>
  );
}
