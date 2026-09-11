import Link from 'next/link';
import { Shell } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getRoles, type RoleView } from '@/lib/queries';
import { getScope } from '@/lib/scope';

export const dynamic = 'force-dynamic';

/**
 * The org chart is read by business owners, not org designers, so it is laid out the way they
 * already describe the business: leadership across the top, then one column per COGS stream, each
 * headed by the role that owns it. A role can exist with nobody in it — a vacancy is information,
 * so it is drawn plainly rather than hidden.
 */
const STREAMS: { key: string; name: string; owns: string; colour: string }[] = [
  { key: 'commercial', name: 'Commercial', owns: 'The numbers are right and on time', colour: '#169BD5' },
  { key: 'operations', name: 'Operations', owns: 'The work gets done safely and profitably', colour: '#5B9E3F' },
  { key: 'growth', name: 'Growth', owns: 'Keep the clients we have, win more', colour: '#C1440E' },
];

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';

function Avatar({ role, size = 'md' }: { role: RoleView; size?: 'md' | 'sm' }) {
  const dim = size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]';
  const name = role.holder?.name ?? role.pencilled;
  if (!name) {
    return <span className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-dashed border-ink/25 font-semibold text-ink-light/40`}>—</span>;
  }
  // A pencilled-in name is shown, but softly — the business as drawn, not yet as running.
  return <span className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold ${role.holder ? 'bg-ink/5 text-ink-light' : 'border border-dashed border-ink/25 text-ink-light/60'}`}>{initials(name)}</span>;
}

function Holder({ role }: { role: RoleView }) {
  if (!role.holder) {
    return role.pencilled
      ? <span className="text-xs text-ink-light/70">{role.pencilled} <span className="italic text-ink-light/50">· pencilled in</span></span>
      : <span className="text-xs italic text-ink-light/60">Open — role defined, nobody in it yet</span>;
  }
  return (
    <span className="text-xs text-ink-light">
      {role.holder.name}
      {role.holder.access === 'readonly' && <span className="ml-1.5 text-ink-light/50">read-only</span>}
    </span>
  );
}

/**
 * Structure is visible to everyone in the business — the chart is the map. Scores are not: a card
 * only links through to its scorecard when the viewer is allowed to read it.
 */
function HeadCard({ role, open }: { role: RoleView; open: boolean }) {
  const inner = (
    <>
      <Avatar role={role} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{role.title}</span>
        <Holder role={role} />
      </span>
    </>
  );
  const base = `flex items-center gap-3 rounded-lg border bg-surface p-3 ${role.holder || role.pencilled ? 'border-ink/10' : 'border-dashed border-ink/25'}`;
  if (!open) return <div className={`${base} opacity-70`} title="Scores outside your part of the org chart aren't visible to you">{inner}</div>;
  return <Link href={`/scorecard/${role.id}`} className={`${base} transition-colors hover:border-rust/40`}>{inner}</Link>;
}

/** Supervisors and their staff, nested under a stream head with a connector rail. */
function Reports({ role, all, visible }: { role: RoleView; all: RoleView[]; visible: Set<string> }) {
  const reports = all.filter(r => r.reportsToRoleId === role.id);
  if (reports.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2 border-l border-ink/10 pl-4">
      {reports.map(r => {
        const open = visible.has(r.id);
        const body = (
          <>
            <Avatar role={r} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{r.title}</span>
              <Holder role={r} />
            </span>
          </>
        );
        const base = `flex items-center gap-2.5 rounded-md border bg-surface/80 px-3 py-2 ${r.holder || r.pencilled ? 'border-ink/10' : 'border-dashed border-ink/20'}`;
        return (
          <li key={r.id} className="relative">
            <span className="absolute -left-4 top-4 h-px w-3 bg-ink/10" aria-hidden />
            {open
              ? <Link href={`/scorecard/${r.id}`} className={`${base} transition-colors hover:border-rust/40`}>{body}</Link>
              : <div className={`${base} opacity-70`}>{body}</div>}
            <Reports role={r} all={all} visible={visible} />
          </li>
        );
      })}
    </ul>
  );
}

export default async function OrgChart({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const { welcome } = await searchParams;
  const tenant = (await getTenantById(user.tenantId))!;
  const roles = await getRoles(tenant.id);
  const { visible } = await getScope(user);

  const board = roles.filter(r => r.stream === 'board');
  const leadership = roles.filter(r => r.stream === 'gm');
  const claimed = new Set<string>([...board, ...leadership].map(r => r.id));

  const groups = STREAMS.map(s => {
    const inStream = roles.filter(r => r.stream === s.key);
    const heads = inStream.filter(r => !inStream.some(o => o.id === r.reportsToRoleId));
    inStream.forEach(r => claimed.add(r.id));
    return { ...s, heads, count: inStream.length, vacant: inStream.filter(r => !r.holder && !r.pencilled).length };
  });

  const unplaced = roles.filter(r => !claimed.has(r.id));
  const totalVacant = roles.filter(r => !r.holder && !r.pencilled).length;

  return (
    <Shell title={`${tenant.name} — org chart`} subtitle="The business by stream of work. A role can exist with nobody in it; a person cannot exist without a role.">
      {/* The table, set. One greeting, one gentle next step — nothing to fill in to be here. */}
      {welcome && (
        <div className="mb-6 rounded-lg bg-surface p-5">
          <div className="font-serif text-xl text-ink">Welcome, {user.name.split(' ')[0]}. This is {tenant.name}.</div>
          <p className="mt-1 text-sm text-ink-light">We&apos;ve sketched it to start. Put names in when you&apos;re ready.</p>
          <Link href="/setup/business" className="mt-3 inline-block rounded-full bg-rust px-4 py-2 text-sm text-cream hover:bg-rust-600">Put names in</Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ink-light">
        <span><b className="font-semibold text-ink">{roles.length}</b> roles defined</span>
        <span><b className="font-semibold text-ink">{roles.length - totalVacant}</b> filled</span>
        {totalVacant > 0 && <span className="text-rust-dark"><b className="font-semibold">{totalVacant}</b> vacant</span>}
      </div>

      {board.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {board.map(r => (
            <div key={r.id} className="w-full max-w-sm">
              <div className="label-caps mb-1 text-center text-[10px]">Board</div>
              <HeadCard role={r} open={visible.has(r.id)} />
            </div>
          ))}
        </div>
      )}

      {leadership.length > 0 && (
        <div className="mt-6">
          <div className="mx-auto flex max-w-sm flex-col gap-2">
            {leadership.map(r => (
              <div key={r.id}>
                <div className="label-caps mb-1 text-center text-[10px]">Leadership</div>
                <HeadCard role={r} open={visible.has(r.id)} />
              </div>
            ))}
          </div>
          <div className="mx-auto h-6 w-px bg-ink/15" aria-hidden />
          <div className="h-px w-full bg-ink/15" aria-hidden />
        </div>
      )}

      <div className="mt-px grid gap-4 lg:grid-cols-3">
        {groups.map(s => (
          <section key={s.key} className="overflow-hidden rounded-lg border border-ink/10 bg-surface">
            <div className="h-1 w-full" style={{ backgroundColor: s.colour }} aria-hidden />
            <div className="border-b border-ink/10 bg-cream/40 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-base text-ink">{s.name}</h2>
                <span className="shrink-0 text-[11px] text-ink-light">
                  {s.count} {s.count === 1 ? 'role' : 'roles'}{s.vacant > 0 && <span className="text-rust-dark"> · {s.vacant} vacant</span>}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-light">{s.owns}</p>
            </div>
            <div className="space-y-3 p-4">
              {s.heads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink/20 px-4 py-6 text-center text-xs italic text-ink-light/60">
                  No role owns this stream yet
                </div>
              ) : s.heads.map(h => (
                <div key={h.id}>
                  <HeadCard role={h} open={visible.has(h.id)} />
                  <Reports role={h} all={roles} visible={visible} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {unplaced.length > 0 && (
        <div className="card mt-6">
          <div className="label-caps">Not yet assigned to a stream</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unplaced.map(r => (
              <li key={r.id}><HeadCard role={r} open={visible.has(r.id)} /></li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-light/70">
        Everyone sees the whole structure; scorecards open only for your own role and the roles beneath it.
        Roles are defined by what the business needs, then people are assigned to them — the role is never reshaped to
        fit the person. <Link href="/setup/business" className="underline hover:text-rust">Edit the business</Link>
      </p>
    </Shell>
  );
}
