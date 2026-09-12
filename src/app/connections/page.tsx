import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { tierOf, TIER } from '@/lib/plan';
import { CATEGORIES, categoryName, isSensitive, STATUS_LABEL, SENSITIVE_NOTE } from '@/lib/systems';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { propose } from '@/lib/mapping';
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
export default async function Connections({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const { ask } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const scope = await getScope(user);
  const tier = tierOf(tenant.tier);

  // The business's connections only. A person's own mailbox is theirs — it belongs on their page,
  // not in a list the whole business reads. See PERSONAL_CATEGORIES in lib/systems.
  const connections = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));
  const approvals = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId));

  const live = connections.filter(c => c.status === 'live');
  const authorised = scope.canAdminister;

  /*
    Described in their own words, mapped by SPEC, approved by a person.

    Done on a GET rather than through a client component and an API route, on purpose. It means the
    proposal is computed where every other decision on this page is computed — on the server, with
    the same scope check above it — and there is no new authenticated surface to get wrong. The
    proposal is never written anywhere: until somebody presses Approve it exists only in this
    render, and Discard is a link back to the page.
  */
  const proposal = authorised && ask?.trim() ? await propose(ask) : null;

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
      {/* Kris's own description of running JBI, and the sharpest promise the product makes. */}
      <p className="-mt-4 mb-6 max-w-2xl font-serif text-xl text-ink">
        You talk to Claude. The systems talk to each other.
      </p>
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
              const tone = c.status === 'live' ? 'green' : c.status === 'broken' ? 'red' : 'pending';
              return (
                <li key={c.id} className="card-inset" style={{ borderLeft: `4px solid ${LIGHT_COLOUR[tone]}` }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-base text-ink">{categoryName(c.category)}</span>
                    <span className="pill" style={pillTone(tone)}>
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
          {/*
            The two questions the form above asks — what is it called, and which of seven kinds is
            it — are the two a person running a business cannot reliably answer. They know what they
            do each morning. So this takes the sentence instead, and proposes the rest.
          */}
          <div className="mt-6 rounded-lg bg-cream p-4">
            <h3 className="font-serif text-base text-ink">Not sure which one it is?</h3>
            <p className="mt-1 text-sm text-ink-light">
              Describe it the way you would say it out loud. Nothing is created until you approve it.
            </p>
            <form method="get" className="mt-3 grid gap-2">
              <textarea
                className="input min-h-24"
                name="ask"
                defaultValue={ask ?? ''}
                maxLength={2000}
                aria-label="Describe a system"
                placeholder="We log plant checks in a shared spreadsheet the yard fills in each morning."
              />
              <SubmitButton className="btn-primary justify-self-start" pending="Working it out…">
                Ask Claude to work it out
              </SubmitButton>
            </form>

            {proposal && (
              <div className="mt-4 rounded-lg bg-surface p-4">
                <span className="label-caps text-rust-700">Proposed mapping</span>
                <p className="mt-2 text-sm text-ink">
                  <b>{proposal.name}</b> — {categoryName(proposal.category)}. {proposal.because}
                </p>
                <p className="mt-3 text-xs text-ink-light">What it would feed:</p>
                <ul className="mt-1 grid gap-0.5 text-xs text-ink-light">
                  {proposal.feeds.map(f => <li key={f}>· {f}</li>)}
                </ul>
                {proposal.needsBoard && (
                  <p className="mt-3 text-xs text-rust-700">
                    This kind goes to the board rather than being switched on. Approving it sends the
                    request, with its data scope written on it.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={connectSystem}>
                    <input type="hidden" name="name" value={proposal.name} />
                    <input type="hidden" name="category" value={proposal.category} />
                    <SubmitButton className="btn" pending="Approving…">Approve mapping</SubmitButton>
                  </form>
                  <Link href="/connections" className="btn">Discard</Link>
                </div>
              </div>
            )}
          </div>

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
