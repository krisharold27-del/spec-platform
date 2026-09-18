import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, PILLARS } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';

import { steps, currentStep, progress, WHAT_SPEC_DOES } from '@/lib/setup';
import { goalsFor } from '@/lib/goals-data';
import { goalsAnswered, goalsSet } from '@/lib/goals';
import { LIGHT_COLOUR } from '@/lib/today';
import { setTier } from '@/app/settings/actions';

export const dynamic = 'force-dynamic';

/**
 * The week-one cascade.
 *
 * Every step in the only order they work in, and every one of them computed from what the business
 * has actually done. Nothing here is a checkbox: a setup screen that can be ticked without the work
 * being done is a screen that lies to whoever reads it next.
 */
export default async function Setup() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const scope = await getScope(user);

  /*
    Scoped through this business's own roles rather than read whole and filtered afterwards.

    The filter that used to follow was correct, but "read everything, then keep ours" is the exact
    shape that leaked in boards-data — one clause written slightly wrong and another company's rows
    are in the result. It also grows with every customer SPEC ever signs.
  */
  const ourRoleIds = scope.roles.map(r => r.id);
  const criteria = ourRoleIds.length
    ? await db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, ourRoleIds))
    : [];
  const assignments = await db.select().from(schema.roleAssignments).where(isNull(schema.roleAssignments.toDate));
  const seats = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const roles = scope.roles;
  const scored = roles.filter(r => isScored(r.level, criteria.filter(c => c.roleId === r.id && c.active).length));
  const withKpis = scored.filter(r => {
    const own = criteria.filter(c => c.roleId === r.id && c.active);
    return PILLARS.every(p => own.filter(c => c.pillar === p && c.kpi).length >= 2);
  });
  const filled = roles.filter(r => assignments.some(a => a.roleId === r.id));
  const managerRoles = roles.filter(r => r.level === 'manager' || r.level === 'supervisor');
  const handedOver = managerRoles.filter(r => {
    const holder = r.holder?.email;
    return holder && seats.some(s => s.email === holder && (s.invitedAt || s.acceptedAt || s.authUserId));
  });

  const goals = await goalsFor(user.tenantId);

  const all = steps({
    goalsAnswered: goalsAnswered(goals),
    goalCount: goalsSet(goals),
    named: !!tenant.name,
    // Basic is the default, so it only counts as chosen once somebody has actually been asked.
    roleCount: roles.length,
    rolesWithKpis: withKpis.length,
    scoredRoleCount: scored.length,
    rolesFilled: filled.length,
    managersHandedOver: handedOver.length,
    managerCount: managerRoles.length,
  });
  const now = currentStep(all);
  const p = progress(all);

  return (
    <Shell
      title={`Setting up ${tenant.name}`}
      subtitle={`${all.length} steps, in the only order they work in. Drawing the whole business is free.`}
    >
      <section className="card">
        <div className="flex flex-wrap items-center gap-2">
          {all.map(s => (
            <Link
              key={s.key}
              href={s.href}
              /* `.pill` is a status badge everywhere else and is not pressed; here each one is a
                 link to a step, so it needs a target rather than just a shape. */
              className="pill inline-flex min-h-[28px] items-center"
              style={{
                background: `color-mix(in srgb, ${s.done ? LIGHT_COLOUR.green : s.key === now.key ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending} 14%, transparent)`,
                color: s.done ? LIGHT_COLOUR.green : s.key === now.key ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending,
              }}
            >
              {s.done ? '✓ ' : ''}{s.label}
            </Link>
          ))}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(p.pct * 100, 2)}%`, background: p.done === p.total ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}
          />
        </div>
        <p className="mt-3 text-sm text-ink-light">{p.done} of {p.total} done · you are on {now.label.toLowerCase()}</p>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4">
          {all.map(s => (
            <section
              key={s.key}
              className="card"
              style={{ borderLeft: `4px solid ${s.done ? LIGHT_COLOUR.green : s.key === now.key ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending}` }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="label-caps">{s.kicker}</span>
                <span className="text-sm text-ink-light">{s.state}</span>
              </div>
              <Link href={s.href} className="mt-1 block font-serif text-lg text-ink hover:text-rust">{s.label}</Link>
              <p className="mt-1 text-sm text-ink-light">{s.detail}</p>

              {/*
                The "do you want the power of AI?" question used to sit here, and answering it
                switched a business between two tiers that cost the same money. There is one SPEC
                now — see ONE_PRODUCT in lib/plan — so the step is gone rather than answered for
                them: a setup question whose answer never varies is a step that wastes somebody's
                first ten minutes.
              */}

              <Link href={s.href} className="mt-3 link-go">
                {s.done ? 'Look at it again →' : 'Do this step →'}
              </Link>
            </section>
          ))}
        </div>

        <div className="grid gap-6">
          <section className="rounded-lg bg-sage-100 p-4">
            <h2 className="font-serif text-xl text-ink">What SPEC is doing</h2>
            <div className="mt-3 grid gap-3">
              {all.map(s => (
                <div key={s.key}>
                  <div className="label-caps" style={{ color: s.key === now.key ? LIGHT_COLOUR.amber : undefined }}>
                    {s.label}
                  </div>
                  <p className="mt-1 text-sm text-ink">{WHAT_SPEC_DOES[s.key]}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-light">
              SPEC proposes and sense-checks. It never sets a target, writes a score or changes your chart —
              and no leader is ever handed a blank form to invent an answer for.
            </p>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Where you are</h2>
            <dl className="mt-3 grid gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-light">Roles drawn</dt>
                <dd className="font-serif text-lg text-ink">{roles.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-light">Targets agreed</dt>
                <dd className="font-serif text-lg text-ink">{withKpis.length} of {scored.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-light">Roles filled</dt>
                <dd className="font-serif text-lg text-ink">{filled.length} of {roles.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-light">Managers handed over</dt>
                <dd className="font-serif text-lg text-ink">{handedOver.length} of {managerRoles.length}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-ink-light">
              Nothing here expires and nothing goes read-only. A seat is billed when a real person is invited
              in — a role with nobody in it is free, however long it stays that way.
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
