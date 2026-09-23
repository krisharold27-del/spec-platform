import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { DealBoard, type BoardCard } from '@/components/deal-board';
import { getCurrentUser, canManage } from '@/lib/auth';
import { refusedReason } from '@/lib/refuse';
import { pillTone } from '@/lib/today';
import { loadCrm, mayShapePipeline, type CrmView, type DealRow, type ActivityRow } from '@/lib/crm-data';
import {
  forecast, stageTotals, probabilityOf, weightedCents, lastTouch, rotting, dealFlag, nextActivity,
  orderActivities, dueLabel, bucketOf, activityLabel, eventLine, search, money, pctLabel,
  ACTIVITY_KINDS, LOST_REASONS, WIN_RATE_DAYS, type StageDef, type Bucket,
} from '@/lib/crm';
import {
  addDeal, moveDeal, markWon, markLost, reopenDeal, updateDeal, addNote, addActivity, toggleActivity,
  addOrganisation, addPerson, saveStage, addStage, removeStage,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * The CRM — selling the work before it is a job.
 *
 * A board of deals by stage, the people and organisations they are with, and the next thing to do on
 * each. Every figure is worked out from what the business recorded (lib/crm), the forecast on every
 * read. A deal is seen by its owner and the people above them in their own line, never sideways.
 * Won, a deal becomes a job in Jobs, and the job is run there.
 *
 * SPEC sends nothing from here. An "email to send" is a reminder to send it yourself.
 */

const TABS = [
  { key: 'deals', label: 'Deals' },
  { key: 'activities', label: 'Activities' },
  { key: 'people', label: 'People' },
  { key: 'organisations', label: 'Organisations' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function Crm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;
  const openId = one(sp.deal);
  const tab: Tab = openId ? 'deals' : (TABS.find(t => t.key === one(sp.tab))?.key ?? 'deals');
  const cannot = refusedReason(sp);
  const manage = canManage(user.access);
  const today = new Date().toISOString().slice(0, 10);

  const view = await loadCrm(user);
  const f = forecast(view.deals, view.stages, today);

  const tiles = [
    { label: 'Open deals', value: money(f.openCents), note: f.openCount ? `${f.openCount} ${f.openCount === 1 ? 'deal' : 'deals'} on the board` : 'Nothing on the board yet' },
    { label: 'Weighted', value: money(f.weightedCents), note: 'Each deal’s value × its stage’s chance of winning' },
    { label: 'Won this month', value: money(f.wonThisMonthCents), note: f.wonThisMonthCount ? `${f.wonThisMonthCount} won, now in Jobs` : 'None won yet this month' },
    {
      label: 'Win rate',
      value: pctLabel(f.winRate),
      note: f.winRate === null ? `Not measured yet — nothing closed in ${WIN_RATE_DAYS} days` : `Of ${f.closedInWindow} closed in the last ${WIN_RATE_DAYS} days`,
    },
  ];

  const tabHref = (key: string, extra: Record<string, string> = {}) =>
    `/crm?${new URLSearchParams({ tab: key, ...extra }).toString()}`;

  return (
    <Shell
      title="CRM"
      kicker="CRM"
      headline="Every deal, first call to won."
      subtitle="Who you are talking to, what it is worth, and the next thing to do. Won, it becomes a job."
    >
      <Refused reason={cannot} />

      {/* Worked out on every read from the deals below, never stored. */}
      <section aria-label="Forecast" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(t => (
          <div key={t.label} className="card">
            <span className="label-caps">{t.label}</span>
            <p className="mt-2 font-serif text-3xl leading-none text-ink">{t.value}</p>
            <p className="mt-2 text-xs text-ink-light">{t.note}</p>
          </div>
        ))}
      </section>

      <nav aria-label="CRM" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={t.key === tab ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${t.key === tab ? 'bg-rust text-cream' : 'bg-surface text-ink shadow-sm hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'deals' && <Deals view={view} openId={openId} manage={manage} today={today} showStages={one(sp.stages) === '1'} lose={one(sp.lose) === '1'} access={user.access} />}
      {tab === 'activities' && <Activities view={view} today={today} manage={manage} who={one(sp.who) === 'line' ? 'line' : 'me'} tabHref={tabHref} />}
      {tab === 'people' && <People view={view} q={one(sp.q)} manage={manage} />}
      {tab === 'organisations' && <Organisations view={view} q={one(sp.q)} manage={manage} />}
    </Shell>
  );
}

/* ══ Helpers ══════════════════════════════════════════════════════════════════════════════════════ */

function whoFor(view: CrmView, d: Pick<DealRow, 'organisationId' | 'personId'>): string {
  const org = view.organisations.find(o => o.id === d.organisationId)?.name;
  const person = view.people.find(p => p.id === d.personId)?.name;
  return [org, person].filter(Boolean).join(' · ');
}

function touchOf(view: CrmView, d: DealRow): string {
  return lastTouch(
    d.createdAt,
    view.events.filter(e => e.dealId === d.id).map(e => e.at),
    view.activities.filter(a => a.dealId === d.id).map(a => a.doneAt),
  );
}

const BUCKET_TONE: Record<Bucket, { background: string; color: string } | null> = {
  overdue: pillTone('red'),
  today: pillTone('amber'),
  upcoming: null,
};

/* ══ Deals ════════════════════════════════════════════════════════════════════════════════════════ */

async function Deals({ view, openId, manage, today, showStages, lose, access }: {
  view: CrmView; openId: string; manage: boolean; today: string; showStages: boolean; lose: boolean; access: string;
}) {
  const open = view.deals.filter(d => d.status === 'open');
  const cards: BoardCard[] = open.map(d => {
    const acts = view.activities.filter(a => a.dealId === d.id);
    const next = nextActivity(acts);
    const flag = dealFlag(d, view.stages, next, touchOf(view, d), today);
    return {
      id: d.id, stageId: d.stageId, title: d.title, who: whoFor(view, d), valueCents: d.valueCents, owner: d.ownerName,
      next: next ? { label: next.subject, when: dueLabel(next.dueDate, today), tone: BUCKET_TONE[bucketOf(next.dueDate, today)] } : null,
      flag: flag ? { text: flag.text, tone: pillTone(flag.light) } : null,
    };
  });
  // A deal whose stage has since gone sits in the first column until somebody moves it.
  for (const c of cards) if (!view.stages.some(s => s.id === c.stageId) && view.stages[0]) c.stageId = view.stages[0].id;

  const totals = stageTotals(view.stages, view.deals);
  const closed = view.deals.filter(d => d.status !== 'open')
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')).slice(0, 12);
  const selected = view.deals.find(d => d.id === openId) ?? null;
  const shape = mayShapePipeline(view.scope, access);

  return (
    <div>
      {manage && (
        <details className="card mb-6" open={!view.deals.length}>
          <summary className="cursor-pointer font-serif text-lg text-ink">Add a deal</summary>
          <form action={addDeal} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm">What the work is
              <input className="input" name="title" required maxLength={160} placeholder="e.g. Switchboard upgrade" />
            </label>
            <label className="grid gap-1 text-sm">Value, ex GST ($)
              <input className="input" name="value" inputMode="decimal" placeholder="Leave empty if not priced yet" />
            </label>
            <label className="grid gap-1 text-sm">Site
              <input className="input" name="site" maxLength={160} placeholder="Where the work is, if known" />
            </label>
            <OrgPicker view={view} />
            <PersonPicker view={view} />
            <label className="grid gap-1 text-sm">Owner
              <select className="input" name="ownerRoleId" defaultValue={view.scope.myRoleId ?? ''}>
                {view.owners.map(o => <option key={o.roleId} value={o.roleId}>{o.name} — {o.title}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Stage
              <select className="input" name="stageId">
                {view.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Expected to close
              <input className="input" type="date" name="expectedClose" />
            </label>
            <div className="flex items-end">
              <SubmitButton className="btn-primary" pending="Adding…">Add the deal</SubmitButton>
            </div>
          </form>
        </details>
      )}

      {!view.deals.length ? (
        <section className="card mb-6">
          <h2 className="font-serif text-xl text-ink">No deals yet</h2>
          <p className="mt-2 max-w-[65ch] text-sm text-ink-light">
            Add the first one above — what the work is and who it is for is enough. It lands in
            {' '}{view.stages[0]?.name ?? 'the first stage'}, and from there you move it along as the conversation goes. Won, it
            becomes a job in Jobs. A job that came straight in as an enquiry stays in Jobs; this is for the selling that
            happens before there is a job.
          </p>
        </section>
      ) : null}

      <DealBoard
        columns={view.stages.map(s => ({ id: s.id, name: s.name, probability: s.probability }))}
        cards={cards}
        openId={openId}
        canMove={manage}
      />

      <p className="mt-2 text-xs text-ink-light">
        Weighted, by stage: {totals.map(t => `${view.stages.find(s => s.id === t.stageId)?.name} ${money(t.weightedCents)}`).join(' · ')}.
        {' '}A deal with nothing happening for its stage’s days is flagged as quiet.
      </p>

      {selected && <DealDetail view={view} deal={selected} manage={manage} today={today} lose={lose} />}

      {closed.length > 0 && (
        <section aria-label="Won and lost" className="card mt-6">
          <h2 className="font-serif text-xl text-ink">Won and lost</h2>
          <ul className="mt-3 grid gap-2">
            {closed.map(d => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/crm?deal=${d.id}`} className="font-semibold text-ink hover:underline">{d.title}</Link>
                <span className="text-ink-light">{whoFor(view, d)}</span>
                <span className="flex items-center gap-2">
                  <strong>{money(d.valueCents)}</strong>
                  <span className="pill" style={pillTone(d.status === 'won' ? 'green' : 'pending')}>
                    {d.status === 'won' ? 'Won' : `Lost · ${d.lostReason ?? ''}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Stages" className="mt-6">
        {showStages ? (
          <div className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl text-ink">Your pipeline</h2>
              <Link href="/crm" className="btn-ghost">Done</Link>
            </div>
            <p className="mt-1 max-w-[65ch] text-sm text-ink-light">
              {view.proposed ? 'SPEC proposed these five for a trade business. Change any of them; nothing is saved until you do. ' : ''}
              The chance of winning weights the forecast. Days before quiet is how long a deal can sit in a stage with nothing happening before its card says so.
            </p>
            <div className="mt-4 grid gap-2">
              {view.stages.map(s => (
                <form key={s.id} action={saveStage} className="flex flex-wrap items-end gap-2 rounded-xl bg-cream px-3 py-2.5">
                  <input type="hidden" name="stageId" value={s.id} />
                  <label className="grid min-w-[160px] flex-1 gap-1 text-xs">Stage
                    <input className="input" name="name" defaultValue={s.name} maxLength={60} disabled={!shape} />
                  </label>
                  <label className="grid w-28 gap-1 text-xs">Chance of winning, %
                    <input className="input" name="probability" inputMode="numeric" defaultValue={s.probability} disabled={!shape} />
                  </label>
                  <label className="grid w-28 gap-1 text-xs">Days before quiet
                    <input className="input" name="rotDays" inputMode="numeric" defaultValue={s.rotDays} disabled={!shape} />
                  </label>
                  {shape && <SubmitButton className="btn-secondary px-3" pending="…">Save</SubmitButton>}
                  {shape && !view.proposed && (
                    <button formAction={removeStage} className="btn-ghost px-3 text-xs" type="submit">Remove</button>
                  )}
                </form>
              ))}
            </div>
            {shape ? (
              <form action={addStage} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="grid min-w-[160px] flex-1 gap-1 text-xs">A new stage, at the end
                  <input className="input" name="name" maxLength={60} placeholder="e.g. Waiting on builder" />
                </label>
                <label className="grid w-28 gap-1 text-xs">Chance, %
                  <input className="input" name="probability" inputMode="numeric" />
                </label>
                <SubmitButton className="btn-secondary px-3" pending="…">Add stage</SubmitButton>
              </form>
            ) : (
              <p className="mt-3 text-xs text-ink-light">The top of the chart or an administrator sets up the pipeline.</p>
            )}
          </div>
        ) : (
          <Link href="/crm?stages=1" className="text-sm text-rust-700 hover:underline">Stages, chances and days before quiet →</Link>
        )}
      </section>
    </div>
  );
}

function OrgPicker({ view, current }: { view: CrmView; current?: string | null }) {
  return (
    <label className="grid gap-1 text-sm">Organisation
      <span className="flex gap-2">
        <select className="input min-w-0 flex-1" name="organisationId" defaultValue={current ?? ''}>
          <option value="">— none, or type a new one —</option>
          {view.organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input className="input min-w-0 flex-1" name="organisationName" maxLength={160} placeholder="New organisation" aria-label="New organisation" />
      </span>
    </label>
  );
}

function PersonPicker({ view, current }: { view: CrmView; current?: string | null }) {
  return (
    <label className="grid gap-1 text-sm">Person
      <span className="flex gap-2">
        <select className="input min-w-0 flex-1" name="personId" defaultValue={current ?? ''}>
          <option value="">— none, or type a new one —</option>
          {view.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input min-w-0 flex-1" name="personName" maxLength={120} placeholder="New person" aria-label="New person" />
      </span>
    </label>
  );
}

async function DealDetail({ view, deal, manage, today, lose }: {
  view: CrmView; deal: DealRow; manage: boolean; today: string; lose: boolean;
}) {
  const stage: StageDef | undefined = view.stages.find(s => s.id === deal.stageId);
  const probability = probabilityOf(deal, view.stages);
  const acts = view.activities.filter(a => a.dealId === deal.id);
  const pending = orderActivities(acts, today);
  const done = acts.filter(a => a.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const events = view.events.filter(e => e.dealId === deal.id).slice().reverse();
  const quiet = rotting(deal, view.stages, touchOf(view, deal), today);
  const [job] = deal.jobId
    ? await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, stage: schema.jobs.stage }).from(schema.jobs)
        .where(and(eq(schema.jobs.tenantId, deal.tenantId), eq(schema.jobs.id, deal.jobId)))
    : [];
  const status = deal.status === 'won' ? 'Won' : deal.status === 'lost' ? 'Lost' : stage?.name ?? 'Open';

  return (
    <section aria-label="Deal" className="card mt-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs text-ink-light">{status} · {deal.ownerName || 'No owner'}</span>
          <h2 className="mt-1 font-serif text-2xl text-ink">{deal.title}</h2>
          <p className="mt-1 text-sm text-ink-light">{whoFor(view, deal) || 'No contact yet'}{deal.site ? ` · ${deal.site}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manage && deal.status === 'open' && (
            <>
              <form action={markWon}>
                <input type="hidden" name="dealId" value={deal.id} />
                <SubmitButton className="btn-primary" pending="Winning…">Won</SubmitButton>
              </form>
              <details className="relative" open={lose}>
                <summary className="btn-secondary cursor-pointer list-none">Lost</summary>
                <form action={markLost} className="absolute right-0 z-10 mt-2 grid w-[min(18rem,85vw)] gap-2 rounded-2xl bg-surface p-4 shadow-lg">
                  <input type="hidden" name="dealId" value={deal.id} />
                  <label className="grid gap-1 text-sm">Why was it lost?
                    <select className="input" name="reason" required defaultValue="">
                      <option value="" disabled>Pick one</option>
                      {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">In your words
                    <textarea className="input" name="note" rows={2} maxLength={400} placeholder="Needed when the reason is Other" />
                  </label>
                  <SubmitButton className="btn-primary" pending="Saving…">Mark lost</SubmitButton>
                </form>
              </details>
            </>
          )}
          {manage && deal.status === 'lost' && (
            <form action={reopenDeal}>
              <input type="hidden" name="dealId" value={deal.id} />
              <SubmitButton className="btn-secondary" pending="Reopening…">Reopen</SubmitButton>
            </form>
          )}
          {job && <Link href={`/jobs?tab=pipeline&job=${job.id}`} className="btn-primary">Open {job.ref} in Jobs</Link>}
          <Link href="/crm" className="btn-ghost">Close</Link>
        </div>
      </div>

      {deal.status === 'lost' && (
        <p className="mt-3 text-sm text-ink-light">Lost — {deal.lostReason}{deal.lostNote ? `: ${deal.lostNote}` : ''}.</p>
      )}
      {deal.status === 'won' && job && (
        <p className="mt-3 text-sm text-ink-light">Won and now {job.ref} in Jobs, where it is booked, costed and invoiced.</p>
      )}
      {deal.status === 'open' && quiet.quiet && (
        <p className="mt-3 text-sm" style={{ color: pillTone('amber').color }}>
          Nothing has happened on this deal for {quiet.days} days. Book the next step, or tick off what was done.
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card-inset">
          <p className="label-caps mb-3">The deal</p>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><span>Value, ex GST</span><strong>{deal.valueCents ? money(deal.valueCents) : 'Not priced'}</strong></div>
            <div className="flex justify-between gap-3"><span>Chance of winning</span><strong>{probability}%{deal.status === 'open' ? ` at ${stage?.name ?? 'this stage'}` : ''}</strong></div>
            <div className="flex justify-between gap-3"><span>Weighted</span><strong>{money(weightedCents(deal.valueCents, probability))}</strong></div>
            <div className="flex justify-between gap-3"><span>Expected to close</span><strong>{deal.expectedClose ?? 'Not set'}</strong></div>
            <div className="flex justify-between gap-3"><span>Owner</span><strong>{deal.ownerName || 'Nobody yet'}</strong></div>
          </div>
          {manage && deal.status === 'open' && (
            <form action={moveDeal} className="mt-4 flex gap-2">
              <input type="hidden" name="dealId" value={deal.id} />
              <select className="input min-w-0 flex-1" name="stageId" defaultValue={deal.stageId} aria-label="Stage">
                {view.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <SubmitButton className="btn-secondary shrink-0 px-3" pending="…">Move</SubmitButton>
            </form>
          )}
          {manage && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-rust-700">Edit the details</summary>
              <form action={updateDeal} className="mt-3 grid gap-2">
                <input type="hidden" name="dealId" value={deal.id} />
                <label className="grid gap-1 text-xs">What the work is<input className="input" name="title" defaultValue={deal.title} maxLength={160} /></label>
                <label className="grid gap-1 text-xs">Value, ex GST ($)<input className="input" name="value" inputMode="decimal" defaultValue={deal.valueCents ? String(deal.valueCents / 100) : ''} /></label>
                <label className="grid gap-1 text-xs">Site<input className="input" name="site" defaultValue={deal.site} maxLength={160} /></label>
                <label className="grid gap-1 text-xs">Expected to close<input className="input" type="date" name="expectedClose" defaultValue={deal.expectedClose ?? ''} /></label>
                <label className="grid gap-1 text-xs">Owner
                  <select className="input" name="ownerRoleId" defaultValue={deal.ownerRoleId ?? ''}>
                    {!deal.ownerRoleId && <option value="">Nobody yet</option>}
                    {view.owners.map(o => <option key={o.roleId} value={o.roleId}>{o.name} — {o.title}</option>)}
                  </select>
                </label>
                <OrgPicker view={view} current={deal.organisationId} />
                <PersonPicker view={view} current={deal.personId} />
                <label className="grid gap-1 text-xs">Notes<textarea className="input" name="notes" rows={3} defaultValue={deal.notes} maxLength={4000} /></label>
                <SubmitButton className="btn-secondary" pending="Saving…">Save</SubmitButton>
              </form>
            </details>
          )}
          {deal.notes && <p className="mt-3 whitespace-pre-line text-sm text-ink">{deal.notes}</p>}
        </div>

        <div className="card-inset">
          <p className="label-caps mb-3">What is next</p>
          <ul className="grid gap-2">
            {pending.length ? pending.map(a => <ActivityRowView key={a.id} a={a} today={today} manage={manage} tab="deals" />)
              : <li className="text-sm text-ink-light">Nothing scheduled.</li>}
          </ul>
          {manage && deal.status === 'open' && (
            <form action={addActivity} className="mt-4 grid gap-2">
              <input type="hidden" name="dealId" value={deal.id} />
              <div className="flex gap-2">
                <select className="input min-w-0 flex-1" name="kind" defaultValue="call" aria-label="Kind">
                  {ACTIVITY_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <input className="input min-w-0 flex-1" type="date" name="dueDate" defaultValue={today} required aria-label="Due" />
              </div>
              <input className="input" name="subject" maxLength={200} placeholder="e.g. Ring about the quote" aria-label="What" />
              <select className="input" name="ownerRoleId" defaultValue={deal.ownerRoleId ?? ''} aria-label="Who">
                {view.owners.map(o => <option key={o.roleId} value={o.roleId}>{o.name}</option>)}
              </select>
              <SubmitButton className="btn-secondary" pending="Adding…">Schedule it</SubmitButton>
            </form>
          )}
          {done.length > 0 && (
            <>
              <p className="label-caps mb-2 mt-5">Done</p>
              <ul className="grid gap-2">
                {done.slice(0, 8).map(a => <ActivityRowView key={a.id} a={a} today={today} manage={manage} tab="deals" />)}
              </ul>
            </>
          )}
        </div>

        <div className="card-inset">
          <p className="label-caps mb-3">What happened</p>
          {manage && (
            <form action={addNote} className="mb-3 flex gap-2">
              <input type="hidden" name="dealId" value={deal.id} />
              <input className="input min-w-0 flex-1" name="note" maxLength={1000} placeholder="Add a note" aria-label="Add a note" />
              <SubmitButton className="btn-secondary shrink-0 px-3" pending="…">Add</SubmitButton>
            </form>
          )}
          <ul className="grid gap-2">
            {events.map(e => (
              <li key={e.id} className="text-sm leading-5"><span className="text-ink-light">{e.at.slice(0, 10)}</span> · {eventLine(e, view.stages)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ActivityRowView({ a, today, manage, tab, deal }: {
  a: ActivityRow; today: string; manage: boolean; tab: string; deal?: { id: string; title: string } | null;
}) {
  const b = bucketOf(a.dueDate, today);
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {manage ? (
        <form action={toggleActivity}>
          <input type="hidden" name="activityId" value={a.id} />
          <input type="hidden" name="tab" value={tab} />
          <button
            type="submit"
            aria-label={a.doneAt ? `Mark “${a.subject}” not done` : `Mark “${a.subject}” done`}
            className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border text-xs ${a.doneAt ? 'border-transparent bg-[#4f7a3f] text-white' : 'border-ink/30 bg-surface'}`}
          >
            {a.doneAt ? '✓' : ''}
          </button>
        </form>
      ) : (
        <span aria-hidden className={`mt-0.5 h-5 w-5 rounded-md border ${a.doneAt ? 'bg-[#4f7a3f]' : 'border-ink/30'}`} />
      )}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={a.doneAt ? 'text-ink-light line-through' : 'text-ink'}>
          <span className="text-ink-light">{activityLabel(a.kind)}:</span> {a.subject}
        </span>
        <span className="text-xs text-ink-light">
          {a.doneAt ? `Done ${a.doneAt.slice(0, 10)}${a.doneBy ? ` by ${a.doneBy}` : ''}` : (
            <span style={b === 'upcoming' ? undefined : { color: pillTone(b === 'overdue' ? 'red' : 'amber').color }}>{dueLabel(a.dueDate, today)}</span>
          )}
          {a.ownerName ? ` · ${a.ownerName}` : ''}
          {deal ? <> · <Link href={`/crm?deal=${deal.id}`} className="hover:underline">{deal.title}</Link></> : null}
        </span>
      </span>
    </li>
  );
}

/* ══ Activities ═══════════════════════════════════════════════════════════════════════════════════ */

function Activities({ view, today, manage, who, tabHref }: {
  view: CrmView; today: string; manage: boolean; who: 'me' | 'line'; tabHref: (k: string, e?: Record<string, string>) => string;
}) {
  const mine = view.scope.myRoleId;
  const openDeals = new Map(view.deals.filter(d => d.status === 'open').map(d => [d.id, d]));
  const list = orderActivities(
    view.activities.filter(a => openDeals.has(a.dealId) && (who === 'line' || (mine ? a.ownerRoleId === mine : true))),
    today,
  );
  const groups: { key: Bucket; title: string }[] = [
    { key: 'overdue', title: 'Overdue' },
    { key: 'today', title: 'Today' },
    { key: 'upcoming', title: 'Coming up' },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={tabHref('activities')} aria-current={who === 'me' ? 'true' : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm ${who === 'me' ? 'bg-ink text-cream' : 'bg-surface text-ink shadow-sm'}`}>Yours</Link>
        <Link href={tabHref('activities', { who: 'line' })} aria-current={who === 'line' ? 'true' : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm ${who === 'line' ? 'bg-ink text-cream' : 'bg-surface text-ink shadow-sm'}`}>Everyone in your line</Link>
      </div>
      {!list.length ? (
        <section className="card">
          <h2 className="font-serif text-xl text-ink">Nothing waiting</h2>
          <p className="mt-2 text-sm text-ink-light">Open a deal and schedule the next call, meeting or site visit — it shows here on the day.</p>
        </section>
      ) : (
        <div className="grid gap-4">
          {groups.map(g => {
            const here = list.filter(a => a.bucket === g.key);
            if (!here.length) return null;
            return (
              <section key={g.key} className="card">
                <h2 className="font-serif text-lg text-ink">{g.title} <span className="text-sm text-ink-light">· {here.length}</span></h2>
                <ul className="mt-3 grid gap-2.5">
                  {here.map(a => {
                    const d = openDeals.get(a.dealId);
                    return <ActivityRowView key={a.id} a={a} today={today} manage={manage} tab="activities" deal={d ? { id: d.id, title: d.title } : null} />;
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══ Contacts ═════════════════════════════════════════════════════════════════════════════════════ */

function SearchBox({ tab, q, placeholder }: { tab: string; q: string; placeholder: string }) {
  return (
    <form action="/crm" method="get" className="mb-4 flex max-w-md gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input className="input min-w-0 flex-1" type="search" name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn-secondary" type="submit">Search</button>
    </form>
  );
}

function OpenDeals({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return <span className="text-xs text-ink-light">No open deals you can see</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {deals.map(d => (
        <Link key={d.id} href={`/crm?deal=${d.id}`} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink hover:underline">
          {d.title} · {money(d.valueCents)}
        </Link>
      ))}
    </span>
  );
}

function People({ view, q, manage }: { view: CrmView; q: string; manage: boolean }) {
  const orgName = (id: string | null) => view.organisations.find(o => o.id === id)?.name ?? '';
  const list = search(view.people, q, p => [p.name, p.email, p.phone, orgName(p.organisationId)]);
  return (
    <div>
      <SearchBox tab="people" q={q} placeholder="Search people" />
      {manage && (
        <form action={addPerson} className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">Name<input className="input" name="name" required maxLength={120} /></label>
          <label className="grid gap-1 text-sm">Email<input className="input" type="email" name="email" maxLength={160} /></label>
          <label className="grid gap-1 text-sm">Phone<input className="input" type="tel" name="phone" maxLength={40} /></label>
          <OrgPicker view={view} />
          <div><SubmitButton className="btn-secondary" pending="Adding…">Add person</SubmitButton></div>
        </form>
      )}
      {!list.length ? (
        <p className="card text-sm text-ink-light">{q ? 'Nobody matches that.' : 'No people yet. Add one here, or with a deal.'}</p>
      ) : (
        <ul className="card grid gap-3">
          {list.map(p => (
            <li key={p.id} className="grid gap-1 border-b border-ink/10 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_1fr_2fr] sm:items-center">
              <span className="font-semibold text-ink">{p.name}</span>
              <span className="text-sm text-ink-light">{[orgName(p.organisationId), p.email, p.phone].filter(Boolean).join(' · ') || '—'}</span>
              <OpenDeals deals={view.deals.filter(d => d.status === 'open' && d.personId === p.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Organisations({ view, q, manage }: { view: CrmView; q: string; manage: boolean }) {
  const list = search(view.organisations, q, o => [o.name, o.address, o.phone]);
  return (
    <div>
      <SearchBox tab="organisations" q={q} placeholder="Search organisations" />
      {manage && (
        <form action={addOrganisation} className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">Name<input className="input" name="name" required maxLength={160} /></label>
          <label className="grid gap-1 text-sm">Address<input className="input" name="address" maxLength={200} /></label>
          <label className="grid gap-1 text-sm">Phone<input className="input" type="tel" name="phone" maxLength={40} /></label>
          <div className="flex items-end"><SubmitButton className="btn-secondary" pending="Adding…">Add organisation</SubmitButton></div>
        </form>
      )}
      {!list.length ? (
        <p className="card text-sm text-ink-light">{q ? 'Nothing matches that.' : 'No organisations yet. Add one here, or with a deal.'}</p>
      ) : (
        <ul className="card grid gap-3">
          {list.map(o => {
            const people = view.people.filter(p => p.organisationId === o.id);
            return (
              <li key={o.id} className="grid gap-1 border-b border-ink/10 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_1fr_2fr] sm:items-center">
                <span className="font-semibold text-ink">{o.name}</span>
                <span className="text-sm text-ink-light">
                  {[o.address, o.phone].filter(Boolean).join(' · ') || '—'}
                  {people.length ? ` · ${people.map(p => p.name).join(', ')}` : ''}
                </span>
                <OpenDeals deals={view.deals.filter(d => d.status === 'open' && d.organisationId === o.id)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
