import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getRoles } from '@/lib/queries';
import { Shell } from '@/components/ui';
import { assign } from './actions';

export const dynamic = 'force-dynamic';

export default async function People() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const roles = getRoles(user.tenantId);
  return (
    <Shell title="Assign people to roles" subtitle="Access follows the role: supervisor and above are full access; staff are read-only. An invite goes to the email you enter.">
      <ul className="max-w-3xl divide-y rounded-lg border bg-white">
        {roles.map(r => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="w-56"><b>{r.title}</b><div className="text-xs text-slate-500">{r.level} · {r.level === 'staff' ? 'read-only' : 'full access'}</div></div>
            {r.holder
              ? <div className="flex-1 text-slate-700">{r.holder.name} <span className="text-slate-400">· {r.holder.email}</span></div>
              : <form action={assign} className="flex flex-1 gap-2"><input type="hidden" name="roleId" value={r.id} />
                  <input name="name" placeholder="Name" required className="w-40 rounded border px-2 py-1" />
                  <input name="email" type="email" placeholder="Work email" required className="flex-1 rounded border px-2 py-1" />
                  <button className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-700">Assign and invite</button></form>}
            {r.holder && <form action={assign} className="flex gap-2"><input type="hidden" name="roleId" value={r.id} />
              <input name="name" placeholder="Replace: name" className="w-32 rounded border px-2 py-1 text-xs" /><input name="email" placeholder="email" className="w-40 rounded border px-2 py-1 text-xs" />
              <button className="text-xs text-slate-500 hover:text-slate-900">Reassign</button></form>}
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl text-xs text-slate-500">Local demo: invites are recorded, not emailed. The invited person signs in with their email and lands on their own scorecard. Reassigning moves the person; it never edits the role.</p>
      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
