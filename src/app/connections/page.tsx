import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { tierOf, TIER } from '@/lib/plan';
import { CATEGORIES, categoryName, isSensitive, STATUS_LABEL, SENSITIVE_NOTE } from '@/lib/systems';
import { LIGHT_COLOUR } from '@/lib/today';
import { connectSystem, disconnectSystem, markLive } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The connection centre — what SPEC reads, and who said it could.
 *
 * Connectors are by category rather than by vendor. Every business runs a different stack, and the
 * part SPEC reasons about is the kind of number a system produces, not which product produced it.
 * That is also what makes board approval meaningful: a business cannot route around it by using
 * something SPEC has never heard of.
 *
 * Nothing here is required. Manual is a complete, permanent way to run SPEC.
 */
export default async function Connections() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const scope = await getScope(user);
  const tier = tierOf(tenant.tier);

  const connections = await db.select().from(schema.systemConnections)
    .where(eq(schema.systemConnections.tenantId, user.tenantId));
  const approvals = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId));

  const live = connections.filter(c => c.status === 'live');
  const authorised = scope.canAdminister;

  if (tier === 'basic') {
    return (
      <Shell title="Connections" subtitle="SPEC Basic — every number entered by hand">
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">{TIER.basic.label}</div>
          <p className="mt-1 text-sm text-ink-light">{TIER.basic.consequence}</p>
          <p className="mt-3 text-sm text-ink-light">
            That is a complete way to run the whole system — no feature anywhere is reachable only by
            connecting something. Advanced changes where the numbers come from, not what SPEC can do.
          </p>
          {authorised && (
            <Link href="/settings" className="btn-primary mt-4 inline-block">Change it in settings</Link>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Connections"
      subtitle={`${live.length} of ${connections.length} feeding numbers · ${tenant.name}`}
    >
      {!authorised && (
        <div className="callout mb-6">
          <p className="text-sm text-ink-light">
            You can see what SPEC reads — that is not a secret from the business. Connecting,
            disconnecting and approving belong to an administrator, and every one of them is logged.
          </p>
        </div>
      )}

      <section className="card">
        <h2 className="font-serif text-xl text-ink">What SPEC reads</h2>
        {connections.length ? (
          <ul className="mt-4 grid gap-3">
            {connections.map(c => {
              const sensitive = isSensitive(c.category);
              const approval = approvals.find(a => a.refId === c.id);
              const approved = approval?.state === 'approved';
              const tone = c.status === 'live' ? LIGHT_COLOUR.green
                : c.status === 'broken' ? LIGHT_COLOUR.red
                : LIGHT_COLOUR.pending;
              return (
                <li key={c.id} className="card-inset" style={{ borderLeft: `4px solid ${tone}` }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-base text-ink">{categoryName(c.category)}</span>
                    <span className="pill" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-light">
                    {c.name}
                    {c.ownerName && ` · looked after by ${c.ownerName}`}
                    {c.lastSyncAt && ` · last read ${c.lastSyncAt.slice(0, 10)}`}
                  </div>

                  {sensitive && (
                    <div className="mt-2 text-xs" style={{ color: approved ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}>
                      {approved
                        ? `Board approved · ${approval?.decidedBy} · ${approval?.decidedAt?.slice(0, 10)}`
                        : approval?.state === 'declined'
                          ? `Declined by the board · ${approval.decidedBy}. Its KPIs stay manual.`
                          : 'Waiting on the board. It is not connected until they say so.'}
                    </div>
                  )}

                  {authorised && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.status !== 'live' && (!sensitive || approved) && (
                        <form action={markLive}>
                          <input type="hidden" name="connectionId" value={c.id} />
                          <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pending="…">Mark it live</SubmitButton>
                        </form>
                      )}
                      {c.status === 'live' && (
                        <form action={disconnectSystem}>
                          <input type="hidden" name="connectionId" value={c.id} />
                          <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pending="…">Disconnect</SubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-light">
            Nothing is connected, so every number is entered by hand and carries a name. That is a complete
            way to run SPEC, and for a number no system produces it is the only honest one.
          </p>
        )}
      </section>

      {authorised && (
        <section className="card mt-6">
          <h2 className="font-serif text-xl text-ink">Add a system</h2>
          <p className="mt-1 text-sm text-ink-light">
            Type whatever you actually run. SPEC only needs to know what kind of number it produces —
            that is the part it reasons about, and it is why there is no vendor list to be absent from.
          </p>
          <form action={connectSystem} className="mt-4 grid gap-2 sm:grid-cols-[1.4fr_1.2fr_auto]">
            <input className="input" name="name" required placeholder="What you call it" aria-label="System name" />
            <select className="input" name="category" aria-label="What it holds" defaultValue="">
              <option value="">What does it hold?</option>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <SubmitButton className="btn-primary shrink-0" pending="Adding…">Add it</SubmitButton>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map(c => (
              <div key={c.id} className="card-inset">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{c.name}</span>
                  {isSensitive(c.id) && <span className="label-caps text-rust-700">Board approval</span>}
                </div>
                <p className="mt-1 text-xs text-ink-light">{c.asks}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-light">{SENSITIVE_NOTE}</p>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">What is still manual</h2>
        <p className="mt-1 text-sm text-ink-light">
          A KPI with no system behind it is confirmed by a named person, and one nobody can measure at all
          is reported as a gap rather than scored. Neither is a failure — the second is a fact about the
          business, and hiding it would be the dishonest option.
        </p>
        <Link href="/scoring" className="mt-3 inline-block text-sm text-rust-700 hover:underline">
          See which numbers those are →
        </Link>
      </section>

      <p className="mt-6 text-xs text-ink-light">
        A broken connection is never announced to the wider business: the KPI falls back to a manual
        confirmation and only the person who looks after it is told, quietly.
      </p>
    </Shell>
  );
}
