import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { TrainingPath } from '@/components/today-blocks';
import { CurriculumEditor } from '@/components/curriculum-editor';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { currentPeriod } from '@/lib/period';
import { getScorecard } from '@/lib/queries';
import { getToday } from '@/lib/today-data';
import { pathFor, pathProgress, signoffFor, aceSteps, type TrainingModule } from '@/lib/training';
import { LIGHT_COLOUR } from '@/lib/today';
import { signOffTraining } from '@/app/today/actions';

export const dynamic = 'force-dynamic';

/**
 * Training — the path for the role you hold, and the paths of the roles you manage.
 *
 * Trained on the job, not on the software. Every module is tied to a pillar and through it to the
 * KPIs the role is already scored on, so finishing a path is meant to move a number somebody is
 * accountable for.
 *
 * The path belongs to the role. Whoever holds the role inherits it; reassigning somebody never
 * edits it; and a role may require training with nobody in it.
 */
export default async function Training() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const scope = await getScope(user);
  const manage = canManage(user.access);
  const data = await getToday(user);

  const modules = await db.select().from(schema.trainingModules)
    .where(eq(schema.trainingModules.tenantId, user.tenantId))
    .orderBy(schema.trainingModules.sortOrder);
  const catalogue: TrainingModule[] = modules.filter(m => m.active).map(m => ({
    id: m.id, title: m.title, summary: m.summary,
    pillar: m.pillar as TrainingModule['pillar'], minutes: m.minutes, core: m.core,
  }));

  // The roles this person manages, and where each holder is on that role's path.
  const managed = scope.roles.filter(r => scope.canEdit(r.id) && r.id !== scope.myRoleId);
  const curriculum = managed.length
    ? await db.select().from(schema.roleCurriculum).where(inArray(schema.roleCurriculum.roleId, managed.map(r => r.id)))
    : [];
  const assignments = managed.length
    ? await db.select().from(schema.roleAssignments)
        .where(and(inArray(schema.roleAssignments.roleId, managed.map(r => r.id)), isNull(schema.roleAssignments.toDate)))
    : [];
  const userIds = assignments.map(a => a.userId).filter((id): id is string => !!id);
  const records = userIds.length
    ? await db.select().from(schema.trainingRecords)
        .where(and(eq(schema.trainingRecords.tenantId, user.tenantId), inArray(schema.trainingRecords.userId, userIds)))
    : [];

  const team = managed.map(role => {
    const entries = curriculum.filter(c => c.roleId === role.id)
      .map(c => ({ moduleId: c.moduleId, dueDays: c.dueDays, sortOrder: c.sortOrder }));
    const assignment = assignments.find(a => a.roleId === role.id);
    const theirs = records.filter(r => r.userId === assignment?.userId)
      .map(r => ({ moduleId: r.moduleId, progress: r.progress, resultPct: r.resultPct, completedAt: r.completedAt }));
    const path = pathFor(entries, catalogue, theirs, assignment?.fromDate ?? null);
    const progress = pathProgress(path);
    return {
      role,
      person: role.holder?.name ?? role.pencilled ?? null,
      invited: !!assignment?.userId,
      progress,
      signoff: signoffFor(progress, { trainedAt: assignment?.trainedAt ?? null, trainedBy: assignment?.trainedBy ?? null }, null),
      overdue: path.filter(m => m.due === 'overdue'),
      moduleIds: entries.map(e => e.moduleId),
    };
  });

  const period = await currentPeriod(user.tenantId);
  const ace = data.ace;

  return (
    <Shell
      title="Training"
      subtitle="Trained on the role, not on the software. Every module is tied to a number somebody owns."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">My path</h2>
            <span className="text-sm text-ink-light">{data.myRole?.title ?? 'No role yet'}</span>
          </div>
          <TrainingPath path={data.training.path} progress={data.training.progress} signoff={data.training.signoff} />
        </section>

        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">
              {data.scored ? 'Ace' : 'Ace eligibility'}
            </h2>
            {data.scored && <span className="text-sm text-ink-light">{ace.months} of {ace.required} months</span>}
          </div>
          <ul className="mt-4 grid gap-3">
            {ace.steps.map(s => (
              <li key={s.label} className="flex items-start gap-3">
                <span
                  className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending }}
                />
                <span className="min-w-0">
                  <span className={`block text-sm ${s.done ? 'text-ink' : 'text-ink-light'}`}>{s.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-light">{s.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-light">
            Sales Ace on the growth side, Ops Ace on operations. The training has to be signed off before
            the run can start — the months only count once somebody has said you are capable in the role.
          </p>
        </section>
      </div>

      {managed.length > 0 && (
        <section className="card mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">Who is where</h2>
            <span className="text-sm text-ink-light">{managed.length} {managed.length === 1 ? 'role' : 'roles'} you manage</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {team.map(t => (
              <li key={t.role.id} className="card-inset">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-serif text-base text-ink">{t.person ?? 'Nobody in this role'}</span>
                    <span className="block text-xs text-ink-light">{t.role.title}</span>
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: t.signoff.state === 'signed' ? LIGHT_COLOUR.green : t.signoff.state === 'ready' ? LIGHT_COLOUR.amber : undefined }}
                  >
                    {t.signoff.label}
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(Math.round((t.progress.pct ?? 0) * 100), 2)}%`,
                      background: t.progress.pathComplete ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber,
                    }}
                  />
                </div>
                <div className="mt-1 text-xs text-ink-light">
                  {t.progress.total
                    ? `${t.progress.complete} of ${t.progress.total} modules${t.overdue.length ? ` · ${t.overdue.length} overdue` : ''}`
                    : 'No path assigned to this role yet.'}
                </div>
                <div className="mt-1 text-xs text-ink-light">{t.signoff.note}</div>

                {t.signoff.state === 'ready' && manage && (
                  <form action={signOffTraining} className="mt-3">
                    <input type="hidden" name="roleId" value={t.role.id} />
                    <SubmitButton className="btn-primary px-3 py-1.5 text-xs" pending="Signing…">
                      Sign the path off
                    </SubmitButton>
                  </form>
                )}
                {!t.invited && t.person && (
                  <p className="mt-2 text-xs text-ink-light">
                    Pencilled in and not invited, so there is nobody to record progress against yet.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-light">
            Overdue compliance training reaches the board pack regardless of scores, so it is worth seeing
            here first.
          </p>
        </section>
      )}

      {manage && managed.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-serif text-xl text-ink">Assign the path to the role</h2>
          <p className="mt-1 text-sm text-ink-light">
            Modules are assigned to the role, not the person. Whoever holds it inherits the path, and core
            modules cannot be removed — every role starts with them.
          </p>
          <CurriculumEditor
            catalogue={catalogue}
            roles={team.map(t => ({ roleId: t.role.id, title: t.role.title, moduleIds: t.moduleIds }))}
          />
        </section>
      )}

      {!period && (
        <p className="mt-6 text-sm text-ink-light">
          Nothing is scored yet, so no Ace run can start.{' '}
          <Link href="/setup/kpis" className="text-rust-700 hover:underline">Set the KPIs</Link> and the months
          begin to count.
        </p>
      )}
    </Shell>
  );
}
