import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell, pct } from '@/components/ui';
import { getCurrentUser, myBusinesses } from '@/lib/auth';
import { getTeamRollup, getGates, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { PILLAR_META } from '@/lib/pillars';
import { light, LIGHT_COLOUR } from '@/lib/today';
import type { Score } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

/**
 * Group — every business this person holds a seat in, side by side.
 *
 * The rule that shapes the whole page: **there is no cross-tenant read path.** This is not one
 * query across businesses; it is the same scoped read run once per business the viewer already has
 * a seat in, and a business they do not hold a seat in does not appear at all.
 *
 * Nothing here is a ranking. The entities are listed in the order the person joined them, never
 * sorted by score — a group that ranks its businesses against each other gets businesses that
 * manage the ranking.
 */
export default async function Group() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const businesses = await myBusinesses();

  if (businesses.length < 2) {
    return (
      <Shell title="Group" subtitle="Every business you hold a seat in">
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">You hold a seat in one business</div>
          <p className="mt-1 text-sm text-ink-light">
            This page appears when there is more than one. It is not a report across a group — SPEC has no
            cross-business read path, for any reason. It is the same scoped view run once per business you
            are already in.
          </p>
          <Link href="/" className="btn-primary mt-4 inline-block">Executive summary</Link>
        </div>
      </Shell>
    );
  }

  const entities = [];
  for (const b of businesses) {
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, b.tenantId));
    if (!tenant) continue;
    const period = await currentPeriod(tenant.id);

    // Seats and roles are counted for context, never compared.
    const roles = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.tenantId, tenant.id), eq(schema.roles.active, true)));
    const seats = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenant.id));

    if (!period) {
      entities.push({
        id: tenant.id, name: tenant.name, sector: tenant.sector, current: b.current,
        period: null, pillars: null as Record<string, Score> | null, overall: null as Score,
        scoredCount: 0, roleCount: roles.length,
        seatCount: seats.filter(s => s.invitedAt || s.acceptedAt || s.authUserId).length,
        gates: null as { zeroHarm: boolean | null; clearToWork: boolean | null } | null,
        locked: false,
      });
      continue;
    }

    const rollup = await getTeamRollup(tenant.id, period.id);
    const g = await getGates(period.id);
    entities.push({
      id: tenant.id, name: tenant.name, sector: tenant.sector, current: b.current,
      period: period.period,
      pillars: rollup.scoredCount ? (rollup.team.pillars as Record<string, Score>) : null,
      overall: rollup.scoredCount ? rollup.team.overall : null,
      scoredCount: rollup.scoredCount, roleCount: rollup.roleCount,
      seatCount: seats.filter(s => s.invitedAt || s.acceptedAt || s.authUserId).length,
      gates: { zeroHarm: g.zeroHarm?.pass ?? null, clearToWork: g.clearToWork?.pass ?? null },
      locked: period.status === 'locked',
    });
  }

  const scored = entities.filter(e => e.pillars);
  const groupAverages: Record<string, Score> = {};
  for (const p of PILLARS) {
    const values = scored.map(e => e.pillars![p]).filter((v): v is number => v !== null && v !== undefined);
    groupAverages[p] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }

  return (
    <Shell
      title="Group"
      subtitle={`${entities.length} businesses · ${scored.length} with a score this month`}
    >
      <section className="card">
        <h2 className="font-serif text-xl text-ink">Across the group</h2>
        <p className="mt-1 text-sm text-ink-light">
          The mean of the businesses that have a score. One with nothing scored is missing data, not a zero,
          so it is left out rather than dragging the figure down.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PILLARS.map(p => {
            const v = groupAverages[p];
            return (
              <div
                key={p}
                className="card-inset"
                style={{ borderTop: `4px solid ${LIGHT_COLOUR[light(v)]}` }}
              >
                <div className="label-caps">{PILLAR_META[p].name}</div>
                <div className="mt-1 font-serif text-2xl text-ink">{pct(v)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        {entities.map(e => (
          <div key={e.id} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-serif text-lg text-ink">
                  {e.name}
                  {e.current && <span className="ml-2 text-xs text-ink-light">you are in this one</span>}
                </span>
                <span className="block text-xs text-ink-light">
                  {[e.sector, `${e.roleCount} roles`, `${e.seatCount} ${e.seatCount === 1 ? 'seat' : 'seats'}`]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-sm text-ink-light">
                {e.period ? `${e.period} · ${e.locked ? 'locked' : 'open'}` : 'Not scoring yet'}
              </span>
            </div>

            {e.pillars ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PILLARS.map(p => (
                    <div key={p} className="card-inset">
                      <div className="label-caps">{PILLAR_META[p].name}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span
                          className="block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: LIGHT_COLOUR[light(e.pillars![p])] }}
                        />
                        <span className="font-serif text-lg text-ink">{pct(e.pillars![p])}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-light">
                  Averaged across {e.scoredCount} of {e.roleCount} roles.
                  {e.gates && (
                    <>
                      {' '}Zero Harm {gateWord(e.gates.zeroHarm)} · Clear to Work {gateWord(e.gates.clearToWork)}. Gates
                      are pass or fail and are never averaged into a pillar.
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-light">
                Nothing scored this month, so there is no figure. A blank month is not a failing one.
              </p>
            )}
          </div>
        ))}
      </section>

      <p className="mt-8 text-xs text-ink-light">
        Listed in the order you joined them, never sorted by score. There is no leaderboard anywhere in SPEC,
        including here — a group that ranks its businesses against each other gets businesses that manage the
        ranking.
      </p>
    </Shell>
  );
}

const gateWord = (pass: boolean | null) => (pass === null ? 'not reporting' : pass ? 'pass' : 'fail');
