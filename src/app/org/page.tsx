import { inArray } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { OrgCanvas } from '@/components/org-canvas';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getTenantById, getScorecard, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { detachedBranches, stages, type ChartRole } from '@/lib/orgchart';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { addRole, importChart } from './actions';
import { Problems } from '@/components/problems';
import { ChartFile } from '@/components/chart-file';
import { ChartKey } from '@/components/chart-key';

export const dynamic = 'force-dynamic';

/**
 * The interactive org chart — the instrument the board reviews through.
 *
 * The chart is the product rather than a diagram of it: roles report to roles, a role exists
 * whether or not anybody holds it, and every score in SPEC rolls up the lines drawn here.
 * Link → Flow → Grow is the order it has to happen in — there is no point chasing a score for a
 * business that has not finished drawing itself.
 */
export default async function OrgChart() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const scope = await getScope(user);
  const period = await currentPeriod(tenant.id);
  const manage = canManage(user.access);

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
  const roles: ChartRole[] = [];
  for (const r of scope.roles) {
    const own = criteria.filter(c => c.roleId === r.id && c.active);
    const scored = isScored(r.level, own.length);
    let pillars: ChartRole['pillars'] = null;
    if (period && scored) {
      const { score } = await getScorecard(r.id, period.id);
      pillars = score.pillars;
    }
    roles.push({
      id: r.id, title: r.title,
      person: r.holder?.name ?? r.pencilled ?? null,
      pencilled: !r.holder && !!r.pencilled,
      parentId: r.reportsToRoleId, level: r.level, stream: r.stream,
      pillars, scored,
      // Two measures per pillar is the starting point the whole system is built around.
      hasKpis: PILLARS.every(p => own.filter(c => c.pillar === p && c.kpi).length >= 2),
    });
  }

  // The chart hangs off the top of the business, not off whatever this viewer happens to see.
  const rootId = roles.find(r => r.level === 'gm')?.id ?? roles.find(r => !r.parentId)?.id ?? null;
  const detached = detachedBranches(roles, rootId);

  const offIds = new Set(detached.flatMap(d => [d.role.id]));
  const attachedScored = roles.filter(r => r.scored && !offIds.has(r.id));
  const averages: Record<string, number | null> = {};
  for (const p of PILLARS) {
    const values = attachedScored
      .map(r => r.pillars?.[p])
      .filter((v): v is number => v !== null && v !== undefined);
    averages[p] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }
  const journey = stages(roles, detached, averages);

  return (
    <Shell
      title="Interactive org chart"
      subtitle={`${tenant.name} · roles report to roles, and a role exists whether or not anybody holds it.`}
    >
      {/* The design leads this screen with the sequence rather than the diagram, because the
          sequence is the part people get wrong: they chase a score before the chart is drawn. */}
      <section className="callout max-w-3xl">
        <div className="font-serif text-xl text-ink">Link it. Then it flows. Then it grows.</div>
        <p className="mt-2 text-sm text-ink-light">
          {manage
            ? 'Add a role, then drag it onto the role it reports to and the line is drawn.'
            : 'Every line here was drawn by someone in your business.'}{' '}
          Have you ever been sure the business is linked, flowing and growing? Now you can be.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {journey.map((s, i) => (
          <div
            key={s.key}
            className="card"
            style={{ borderTopColor: s.met ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending, borderTopWidth: 4 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-lg text-ink">{s.title}</span>
              <span className="label-caps" style={{ color: s.met ? LIGHT_INK.green : undefined }}>
                {s.met ? 'Met' : `Step ${i + 1}`}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-light">{s.detail}</p>
          </div>
        ))}
      </section>

      {roles.length === 0 ? (
        <div className="callout mt-6 max-w-2xl">
          <div className="font-serif text-lg text-ink">Start from what you already have</div>
          <p className="mt-1 text-sm text-ink-light">
            Paste your structure in below — one role per line — or add them one at a time. Nobody is emailed
            and nothing is billed: a name here is just a name until you choose to invite them.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <OrgCanvas roles={roles} rootId={rootId} canEdit={manage} />
        </div>
      )}

      {/* What the colours on every card mean. The design carries this and the product did not, so a
          new customer saw a wall of red and amber with nothing telling them what it meant. */}
      <ChartKey />

      {manage && (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="font-serif text-xl text-ink">Add a role</h2>
            <p className="mt-1 text-sm text-ink-light">
              It starts vacant. Roles are defined by what the business needs and a person is assigned
              afterwards — never the other way round.
            </p>
            <form action={addRole} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1.5fr_auto]">
              <input className="input" name="title" required placeholder="Role title" aria-label="Role title" />
              <select className="input" name="parentId" aria-label="Reports to" defaultValue={rootId ?? ''}>
                <option value="">Top of the chart</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <SubmitButton className="btn-primary shrink-0" pending="Adding…">Add it</SubmitButton>
            </form>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Start from what you already have</h2>
            <p className="mt-1 text-sm text-ink-light">
              Nobody types their org chart twice. One role per line: <span className="font-mono text-xs">role, person, reports to</span>. A manager
              SPEC cannot match is still created — it lands off the chart, where you can drag it in.
            </p>
            <form action={importChart} className="mt-4 grid gap-2">
              <textarea
                id="chart-paste"
                className="input min-h-[120px] rounded-lg font-mono text-xs"
                name="text"
                placeholder={'General Manager, A. Morgan\nOperations Manager, J. Barnes, General Manager\nSite Supervisor, , Operations Manager'}
                aria-label="Paste your structure"
              />
              <SubmitButton className="btn-primary justify-self-start" pending="Drawing…">Build the chart</SubmitButton>
            </form>
            <p className="mt-3 text-xs text-ink-light">
              A CSV exported from a payroll or HR system pastes in the same way — SPEC drops the header row
              when it recognises one.
            </p>
            {/*
              Upload a file, because a business's structure lives in a file rather than in somebody's
              clipboard. It fills the box above rather than going anywhere, so what runs is the same
              import that is already tested, and the person sees what arrived before anything is drawn.
            */}
            <ChartFile targetId="chart-paste" />
          </section>
        </div>
      )}

      {!manage && (
        <p className="mt-6 text-sm text-ink-light">
          You can see the structure — the shape of a business is not a secret — but changing it belongs to
          whoever manages your part of the chart.
        </p>
      )}

      <p className="mt-8 text-xs text-ink-light">
        <Link href="/team" className="text-rust-700 hover:underline">The team roll-up</Link> averages the scored
        roles that are actually on the chart. Anything off it is excluded and counted, never quietly dropped.
      </p>
      <Problems screen="org" />

    </Shell>
  );
}
