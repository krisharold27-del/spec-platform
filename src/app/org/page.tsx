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
import { aceWatch } from '@/lib/ace-watch-data';
import type { AceWatchRow } from '@/lib/ace-watch';
import { LIGHT_COLOUR } from '@/lib/today';
import { addRole, importChart } from './actions';
import { Problems } from '@/components/problems';
import { ChartFile } from '@/components/chart-file';
import { PredictedRoles } from '@/components/predicted-roles';
import { pendingPredictions } from '@/lib/predict-data';
import { Cascade } from '@/components/cascade';
import { cascadeFor } from '@/lib/cascade-data';
import { goalsFor } from '@/lib/goals-data';
import { goalsAnswered } from '@/lib/goals';

export const dynamic = 'force-dynamic';

/**
 * The interactive org chart — the instrument the board reviews through.
 *
 * The chart is the product rather than a diagram of it: roles report to roles, a role exists
 * whether or not anybody holds it, and every score in SPEC rolls up the lines drawn here.
 * Link → Flow → Grow is the order it has to happen in — there is no point chasing a score for a
 * business that has not finished drawing itself.
 */
export default async function OrgChart({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const read = String(sp.read ?? '');
  const cascadeRead = String(sp.cascade ?? '');
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
  /*
    Every role's Ace run, read once for the whole chart.

    This is where a run belongs, because this is the screen a leader actually works in. Before this,
    finding out where somebody was in their three meant opening their scorecard, one role at a time,
    which is not something anybody does for forty people. Read in a flat number of queries and
    indexed by role, so putting it on every card costs the same as putting it on one.
  */
  const aces = period
    ? new Map((await aceWatch(tenant.id, period.id, ourRoleIds)).map(a => [a.roleId, a]))
    : new Map<string, AceWatchRow>();

  // Proposals, which are deliberately NOT roles — see lib/predict-data. Nothing that walks the
  // business can see them, which is what stops one ever being counted, scored or billed for.
  const predicted = await pendingPredictions(user.tenantId);

  // The goal, worked down the chart. Proposals too — a row becomes a KPI only when somebody takes it.
  const cascade = await cascadeFor(user.tenantId);
  const goalsSet = goalsAnswered(await goalsFor(user.tenantId));

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
      // Null for a checklist role: no scorecard, so no run to be on.
      ace: aces.get(r.id) ?? null,
      // What the role is measured on, named under each pillar in the Role scorecard panel. The
      // criteria are already in hand, so this is free.
      kpis: {
        safety: own.filter(c => c.pillar === 'safety').map(c => c.text),
        people: own.filter(c => c.pillar === 'people').map(c => c.text),
        earnings: own.filter(c => c.pillar === 'earnings').map(c => c.text),
        compliance: own.filter(c => c.pillar === 'compliance').map(c => c.text),
      },
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
      headline="Link it. Then it flows. Then it grows."
      subtitle={
        manage
          ? 'Right-click anywhere to add a role. Drag it onto the role it reports to and the line is drawn. Have you ever been sure the business is linked, flowing and growing? Now you can be.'
          : 'Every line here was drawn by someone in your business. Have you ever been sure the business is linked, flowing and growing? Now you can be.'
      }
    >
      {/*
        Link → Flow → Grow, as three washes of colour rather than three labelled cards.

        The design gives each one a tint — green when it is met, pale rust when it is not — and a
        single dot. The product wrote the word "MET" or "STEP 3" in capitals beside the title and
        drew a 4px rule across the top of a white card, which is a status table pretending to be a
        picture. The tint IS the status; nothing has to be read to get it.
      */}
      <section className="grid gap-4 sm:grid-cols-3">
        {journey.map(s => (
          <div
            key={s.key}
            className="rounded-2xl p-6"
            style={{ background: s.met ? 'rgba(79,122,63,0.12)' : '#f0e2cb' }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-serif text-[22px] leading-none text-ink">{s.title}</span>
              <span
                aria-hidden
                className="block h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: s.met ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}
              />
            </div>
            <p className="mt-3 text-sm leading-[22px] text-ink">{s.detail}</p>
            {/* The status still has words, for anybody who cannot see the colour at all. */}
            <span className="sr-only">{s.met ? 'Met' : 'Not yet met'}</span>
          </div>
        ))}
      </section>

      {/*
        What the chart is missing, above the chart itself.

        Above rather than below, because it is a question about the structure and the structure is
        what the page is for — and because a proposal nobody scrolls to is a proposal nobody decides.
      */}
      <PredictedRoles
        predicted={predicted}
        read={read === '' ? null : Number(read)}
        canEdit={manage}
      />

      {/*
        And then the goal, worked down the chart the structure just settled.

        Below the predicted roles on purpose: the design says "this is that cascade, ONCE STRUCTURE
        IS APPROVED", and the order on the page is the order of the thinking. There is no point
        deciding what a role measures before deciding whether the role exists.
      */}
      <Cascade
        view={cascade}
        goalsSet={goalsSet}
        canEdit={manage}
        read={cascadeRead === '' ? null : Number(cascadeRead)}
      />

      {/*
        Bringing a structure in, ABOVE the chart and folded shut.

        The design puts one quiet strip here — a line and an "Import your structure" link — because
        importing is something a business does once, on the first morning, and never again. The
        product had it at the BOTTOM of the page as two permanently-open cards with a textarea, a
        file picker and three paragraphs, so every visit to the chart ended in a wall of setup.

        Open by default while the chart is empty, because on that one morning it is the whole point
        of the screen.
      */}
      {manage && (
        <details open={roles.length === 0} className="mt-6 rounded-2xl bg-surface p-6">
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-3">
            <span>
              <span className="font-serif text-xl text-ink">Start from what you already have</span>
              <span className="mt-1 block text-sm text-ink-light">
                Nobody types their org chart twice. Bring it in from a document, a spreadsheet, or the
                system that already holds it.
              </span>
            </span>
            <span className="shrink-0 text-sm text-rust-700 hover:underline">Import your structure</span>
          </summary>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
            <div>
              <h2 className="label-caps text-rust-700">Bring in a whole structure</h2>
              <p className="mt-2 text-sm text-ink-light">
                One role per line: <span className="font-mono text-xs">role, person, reports to</span>. A manager
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
            </div>

            <div>
              <h2 className="label-caps text-rust-700">Or add one role</h2>
              <p className="mt-2 text-sm text-ink-light">
                It starts vacant. Roles are defined by what the business needs and a person is assigned
                afterwards — never the other way round. On the chart itself, right-click does the same thing.
              </p>
              <form action={addRole} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1.5fr_auto]">
                <input className="input" name="title" required placeholder="Role title" aria-label="Role title" />
                <select className="input" name="parentId" aria-label="Reports to" defaultValue={rootId ?? ''}>
                  <option value="">Top of the chart</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
                <SubmitButton className="btn-primary shrink-0" pending="Adding…">Add it</SubmitButton>
              </form>
            </div>
          </div>
        </details>
      )}

      {/*
        The chart, and the two panels the design hangs off it: the selected role's scorecard, and
        what the board sees. All three live in the canvas component because the first two follow the
        selection, and a selection is a thing the browser holds rather than the server.
      */}
      {roles.length > 0 && (
        <div className="mt-6">
          <OrgCanvas
            roles={roles}
            rootId={rootId}
            canEdit={manage}
            averages={{
              safety: averages.safety ?? null,
              people: averages.people ?? null,
              earnings: averages.earnings ?? null,
              compliance: averages.compliance ?? null,
            }}
          />
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
      <Problems screen="org" heading="What the chart changes" />

    </Shell>
  );
}
