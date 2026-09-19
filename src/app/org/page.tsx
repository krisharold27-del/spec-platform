import { and, eq, inArray, isNull } from 'drizzle-orm';
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
  /*
    Why SPEC said no, in the words the guard used.

    Every refusal on this page used to `throw`, which renders "This page did not load — something
    went wrong on our end". Nothing had gone wrong: the server had correctly refused, and the
    customer was told the product was broken. See `refuse` in ./actions.
  */
  const cannot = String(sp.cannot ?? '').slice(0, 300);
  // Same length cap and the same reasoning: it arrives in the address, so it is somebody else's text.
  const invited = String(sp.invited ?? '').slice(0, 200);
  const claimed = String(sp.claimed ?? '').slice(0, 200);
  const asked = String(sp.asked ?? '').slice(0, 200);
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

  /*
    This business's own systems, for the "Connect a system" card.

    The design lists connectors with a state beside each. What is drawn is the register THIS business
    keeps — never a menu of logos SPEC does not talk to yet. Offering to connect a payroll system
    that nothing behind it can reach is the same class of claim as the feed wording that had to be
    torn out on 18 September, and it would be on the first screen a new customer opens.
  */
  const connections = manage
    ? await db.select().from(schema.systemConnections)
        .where(and(
          eq(schema.systemConnections.tenantId, user.tenantId),
          /*
            A personal mailbox is NOT one of the business's systems, and every list of the business's
            systems has to say so in its query. `tests/mail.test.ts` caught this within a minute of
            the card being written — somebody's own inbox would have been printed on the org chart as
            a company connection, for their whole team to read.
          */
          isNull(schema.systemConnections.personalFor),
        ))
    : [];

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

  /*
    ── What this person can actually change, worked out the same way the server works it out ───────

    Kris, 19 September: *"I still cant change my name in the org chart"*.

    The chart offered an edit box on EVERY card whenever somebody's access level was full — and the
    server then allowed the save only inside that person's own branch, which is a different question
    entirely. SPEC works out your branch by walking DOWN from your own role, so somebody who is not
    placed on the chart has no branch at all: every box on the screen, on every card, was one the
    server was always going to refuse.

    A control that cannot work is worse than no control. It is also invisible as a fault — it looks
    like the product quietly ignoring you, which is exactly what Kris described twice.

    So the page asks `scope.canEdit` — the same function the actions call — for every role, and the
    panel offers a box only where a save will really land. Where it will not, it says why.
  */
  const editableIds = scope.roles.filter(r => scope.canShapeChart(r.id)).map(r => r.id);
  /*
    Only when there is NOTHING they can change. Somebody who can shape part of the chart is not
    read-only, and telling them they are would be its own lie — that case is somebody else's
    branch, which the panel says on the card itself.
  */
  const readOnlyReason = editableIds.length > 0
    ? null
    : !manage
      ? 'Your account can see this chart but not change it. An administrator can give you edit access from Admin.'
      : 'You are not in a role on this chart yet, so SPEC cannot tell which part of it is yours — that is why nothing here will save. Put yourself in a role from People, then come back.';

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

      {cannot && (
        <p
          role="status"
          className="mt-6 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm text-ink"
        >
          {cannot}
        </p>
      )}

      {/*
        An invitation that went, said out loud.

        A refusal already gets a sentence here; a success that gives nothing back is the other half
        of the same fault. Somebody has just spent a seat and started a monthly charge — they should
        not have to go and check whether it happened, and "the page looks the same" is not an answer.
      */}
      {asked && (
        <p
          role="status"
          className="mt-6 rounded-lg border-l-4 border-sage bg-surface p-4 text-sm text-ink"
        >
          Your request for <b>{asked}</b> is with the administrator. It is in their Approvals, with
          the reason you gave. Nothing changes until they decide.
        </p>
      )}

      {claimed && (
        <p
          role="status"
          className="mt-6 rounded-lg border-l-4 border-sage bg-surface p-4 text-sm text-ink"
        >
          You are now in <b>{claimed}</b>. SPEC works out what you can change by looking at where
          you sit on this chart, so everything under that role is yours from here.
        </p>
      )}

      {invited && (
        <p
          role="status"
          className="mt-6 rounded-lg border-l-4 border-sage bg-surface p-4 text-sm text-ink"
        >
          Invitation sent to <b>{invited}</b>. They set their own password when they arrive and land
          on their own My Page. The link works once, and only for that address.
        </p>
      )}

      {/*
        ── The chart FIRST, then everything that is a question about it ─────────────────────────

        The design was re-cut on 18 September and Kris sent it over with *"redo the org chart page
        like this"*. The change is the order: the diagram used to sit under three panels of
        proposals and setup, so the thing the page is named after was the fourth thing on it. Now
        the chart is directly under Link → Flow → Grow, and what SPEC has to ASK about the chart —
        roles it thinks are missing, the goal worked down it, and where a structure can be brought
        in from — follows underneath, in the order somebody would deal with them.

        The two panels beside the chart live inside the canvas component: they follow the selection,
        and a selection is a thing the browser holds rather than the server.
      */}
      {roles.length > 0 && (
        <div className="mt-6">
          <OrgCanvas
            roles={roles}
            rootId={rootId}
            canEdit={manage}
            editableIds={editableIds}
            myRoleId={scope.myRoleId}
            readOnlyReason={readOnlyReason}
            averages={{
              safety: averages.safety ?? null,
              people: averages.people ?? null,
              earnings: averages.earnings ?? null,
              compliance: averages.compliance ?? null,
            }}
          />
        </div>
      )}

      {/* What the chart is still missing. Nothing here is real until somebody says so. */}
      <PredictedRoles
        predicted={predicted}
        read={read === '' ? null : Number(read)}
        canEdit={manage}
      />

      {/*
        And then the goal, worked down the chart.

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
        Bringing a structure in — three ways, in the design's own order.

        Folded shut once there is a chart, because importing is something a business does on the
        first morning and never again; open while the chart is empty, because on that one morning it
        is the whole point of the screen.
      */}
      {manage && (
        <details open={roles.length === 0} className="mt-6 rounded-2xl bg-surface p-6 sm:p-8">
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-3">
            <span>
              <span className="font-serif text-[22px] leading-tight text-ink">Start from what you already have</span>
              <span className="mt-2.5 block max-w-[58ch] text-[14.5px] leading-[23px] text-ink/80">
                Nobody types their org chart twice. Bring it in from a document, a spreadsheet, or the
                system that already holds it.
              </span>
            </span>
            <span className="shrink-0 text-sm text-rust-700 hover:underline">Import your structure</span>
          </summary>

          <div className="mt-7 grid items-start gap-4 lg:grid-cols-3">
            {/*
              Upload a file. A business's structure lives in a document, not in somebody's clipboard
              — this is the card Kris asked for when the picker took CSV and nothing else.
            */}
            <div className="grid content-start gap-3 rounded-[20px] bg-cream p-6">
              <p className="font-serif text-[17px] text-ink">Upload a file</p>
              <p className="text-[13.5px] leading-[21px] text-ink/80">
                Word, PDF, Excel or CSV. SPEC reads the role, the person and who they report to, then
                asks you to confirm before anything is drawn.
              </p>
              <ChartFile targetId="chart-paste" />
            </div>

            <div className="grid content-start gap-3 rounded-[20px] bg-cream p-6">
              <p className="font-serif text-[17px] text-ink">Paste it in</p>
              <p className="text-[13.5px] leading-[21px] text-ink/80">
                One role per line: role, person, who they report to. Straight out of a document or a
                spreadsheet column. A manager SPEC cannot match is still created — it lands off the
                chart, where you can drag it in.
              </p>
              <form action={importChart} className="grid gap-3">
                <textarea
                  id="chart-paste"
                  className="min-h-[120px] w-full resize-y rounded-[18px] border border-ink/15 bg-surface px-4 py-3.5 font-mono text-[13px] leading-5 text-ink"
                  name="text"
                  placeholder={'General Manager, Kris Harold\nOperations Manager, Dane Whitmore, General Manager\nScheduler, Amrit Kaur, Operations Manager'}
                  aria-label="Paste your structure"
                />
                <SubmitButton className="btn-primary justify-self-start" pending="Drawing…">Build the chart</SubmitButton>
              </form>
            </div>

            {/*
              Connect a system.

              The design lists connectors with a state beside each. What is drawn here is this
              business's OWN connections, read from the register — not a menu of logos SPEC does not
              talk to yet. A card that offers to connect BambooHR when nothing behind it can would be
              the same lie the feed wording was.
            */}
            <div className="grid content-start gap-3 rounded-[20px] bg-cream p-6">
              <p className="font-serif text-[17px] text-ink">Connect a system</p>
              <p className="text-[13.5px] leading-[21px] text-ink/80">
                The structure stays in step with the system that owns it. New starter there, new role
                here.
              </p>
              {connections.length > 0 ? (
                <ul className="grid gap-2">
                  {connections.map(c => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5"
                    >
                      <span className="truncate text-sm text-ink">{c.name}</span>
                      <span className="shrink-0 text-[12.5px] text-ink-light">
                        {c.status === 'live' ? 'Connected' : c.status === 'pending' ? 'Waiting on approval' : 'Not connected'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] leading-5 text-ink-light">Nothing is connected yet.</p>
              )}
              <Link href="/connections" className="btn-secondary justify-self-start">Open the connection centre</Link>
            </div>
          </div>

          <div className="mt-6 border-t border-ink/10 pt-6">
            <p className="font-serif text-[17px] text-ink">Or add one role</p>
            <p className="mt-2 max-w-[58ch] text-[13.5px] leading-[21px] text-ink/80">
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
        </details>
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
