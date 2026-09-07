import Link from 'next/link';
import { Shell } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getRoles, type RoleView } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The org chart is read by business owners, not by org designers, so it is laid out the way they
 * already think about the business: the streams of work. Leadership sits across the top; beneath it
 * one column per COGS stream, each headed by the role that owns it, with that stream's people under
 * it. A role can exist with nobody in it — a vacancy is information, so it is drawn, not hidden.
 */
const STREAMS: { key: string; name: string; owns: string; accent: string }[] = [
  { key: 'commercial', name: 'Commercial', owns: 'The numbers are right and on time — weekly gross profit, monthly net profit, STAR rating.', accent: 'bg-[#169BD5]' },
  { key: 'operations', name: 'Operations', owns: 'The work gets done safely and profitably — billable hours, safety, supervisors signed off as capable.', accent: 'bg-[#5B9E3F]' },
  { key: 'growth', name: 'Growth', owns: 'Keep the clients we have, win more — retention and acquisition.', accent: 'bg-[#E67E22]' },
];

function PersonLine({ role }: { role: RoleView }) {
  if (role.holder) {
    return <span className="text-ink-light">{role.holder.name}<span className="text-xs text-ink-light/60"> · {role.holder.access}</span></span>;
  }
  return <span className="italic text-ink-light/60">vacant — role exists, nobody assigned</span>;
}

function RoleCard({ role, lead = false }: { role: RoleView; lead?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${lead ? 'border-ink/20 shadow-sm' : ''}`}>
      <Link href={`/scorecard/${role.id}`} className={`hover:underline ${lead ? 'font-semibold text-ink' : 'font-medium text-rust'}`}>{role.title}</Link>
      <div className="mt-0.5 text-sm"><PersonLine role={role} /></div>
    </div>
  );
}

/** Everything below a stream head, drawn as a simple indented list — supervisors, then their staff. */
function Reports({ role, all }: { role: RoleView; all: RoleView[] }) {
  const reports = all.filter(r => r.reportsToRoleId === role.id);
  if (reports.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2 border-l border-ink/10 pl-3">
      {reports.map(r => (
        <li key={r.id}>
          <div className="rounded-md border bg-white/70 px-3 py-2">
            <Link href={`/scorecard/${r.id}`} className="text-sm font-medium text-rust hover:underline">{r.title}</Link>
            <div className="text-xs"><PersonLine role={r} /></div>
          </div>
          <Reports role={r} all={all} />
        </li>
      ))}
    </ul>
  );
}

export default async function OrgChart() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const roles = await getRoles(tenant.id);

  const board = roles.filter(r => r.stream === 'board');
  const leadership = roles.filter(r => r.stream === 'gm');
  const claimed = new Set<string>([...board, ...leadership].map(r => r.id));

  // A stream's head is the role in that stream that doesn't report to another role in the same stream.
  const streamGroups = STREAMS.map(s => {
    const inStream = roles.filter(r => r.stream === s.key);
    const heads = inStream.filter(r => !inStream.some(o => o.id === r.reportsToRoleId));
    inStream.forEach(r => claimed.add(r.id));
    return { ...s, heads };
  });

  const unplaced = roles.filter(r => !claimed.has(r.id));

  return (
    <Shell title="Org chart" subtitle="The business by stream of work. A role can exist with nobody in it; a person cannot exist without a role.">
      {board.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {board.map(r => <RoleCard key={r.id} role={r} lead />)}
        </div>
      )}

      {leadership.length > 0 && (
        <div className="mb-6 space-y-3">
          {leadership.map(r => <RoleCard key={r.id} role={r} lead />)}
          <div className="text-center text-xs uppercase tracking-wide text-ink-light/60">runs the three streams below</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {streamGroups.map(s => (
          <section key={s.key} className="rounded-lg border bg-cream/40 p-4">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.accent}`} aria-hidden />
              <h2 className="font-serif text-lg font-bold text-ink">{s.name}</h2>
            </div>
            <p className="mt-1 text-xs text-ink-light">{s.owns}</p>
            <div className="mt-3 space-y-3">
              {s.heads.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-white/50 px-4 py-3 text-sm italic text-ink-light/70">
                  No role owns this stream yet.
                </div>
              ) : s.heads.map(h => (
                <div key={h.id}>
                  <RoleCard role={h} />
                  <Reports role={h} all={roles} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {unplaced.length > 0 && (
        <div className="mt-6 rounded-lg border bg-white p-4">
          <div className="text-sm font-medium text-ink">Not yet assigned to a stream</div>
          <ul className="mt-2 space-y-2">
            {unplaced.map(r => (
              <li key={r.id} className="text-sm">
                <Link href={`/scorecard/${r.id}`} className="font-medium text-rust hover:underline">{r.title}</Link>
                {' — '}<PersonLine role={r} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
