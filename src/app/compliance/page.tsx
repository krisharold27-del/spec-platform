import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import {
  AREAS, areaSpec, isComplianceArea, stateOf, stateNote, stopsWork, byUrgency,
  complianceStats, headline, STATE_LABEL, WARN_BEFORE_DAYS, CLEAR_TO_WORK_WARNS_AT,
  type ComplianceArea, type ItemState,
} from '@/lib/compliance';
import { addItem, renewItem, satisfyItem } from './actions';

export const dynamic = 'force-dynamic';

/** Colour is how something is GOING, never what it IS — the rule the whole product runs on. */
const COLOUR: Record<ItemState, string> = {
  current: LIGHT_COLOUR.green,
  expiring: LIGHT_COLOUR.amber,
  lapsed: LIGHT_COLOUR.red,
  missing: LIGHT_COLOUR.pending,
};
const INK: Record<ItemState, string> = {
  current: LIGHT_INK.green,
  expiring: LIGHT_INK.amber,
  lapsed: LIGHT_INK.red,
  missing: LIGHT_INK.pending,
};

/** One shape for every row, whichever of the six areas it came from. */
interface Row {
  id: string;
  title: string;
  covers: string | null;
  expiresAt: string | null;
  satisfiedAt?: string | null;
  reference: string | null;
  /** Where the row actually lives, when it is not this page's own. */
  heldAt?: { href: string; label: string };
}

/**
 * Compliance — do what we say, and prove it.
 *
 * Kris's design of 24 September. Six areas, four of which are stored here and two of which are read
 * from where SPEC already holds them: licences are `obligations` (the same rows behind Clear to
 * Work on People) and breaches are the corrective actions raised against safety reports.
 */
export default async function CompliancePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const manager = canManage(user.access);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const tabParam = String(sp.tab ?? 'licences');
  const tab: ComplianceArea = isComplianceArea(tabParam) ? tabParam : 'licences';
  const spec = areaSpec(tab);

  /* ── What this page stores itself ──────────────────────────────────────────────────────────── */
  const stored = await db.select().from(schema.complianceItems)
    .where(eq(schema.complianceItems.tenantId, user.tenantId))
    .orderBy(desc(schema.complianceItems.createdAt));

  /* ── Licences, read from where Clear to Work reads them ────────────────────────────────────── */
  const obligations = await db.select().from(schema.obligations)
    .where(eq(schema.obligations.tenantId, user.tenantId));

  const staff = await db.select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const people = await db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const whoFor = (o: { staffId: string | null; userId: string | null; roleId: string | null }) =>
    staff.find(s => s.id === o.staffId)?.name
    ?? people.find(p => p.id === o.userId)?.name
    ?? scope.roles.find(r => r.id === o.roleId)?.title
    ?? null;

  const licenceRows: Row[] = obligations.map(o => ({
    id: o.id,
    title: o.what,
    covers: whoFor(o),
    expiresAt: o.expiresAt,
    reference: o.evidence,
    heldAt: { href: '/people#clear-to-work', label: 'People' },
  }));

  /* ── Breaches, read from the corrective actions already raised ─────────────────────────────── */
  const actions = await db.select().from(schema.safetyActions)
    .where(eq(schema.safetyActions.tenantId, user.tenantId))
    .orderBy(desc(schema.safetyActions.createdAt));

  const breachRows: Row[] = actions.map(a => ({
    id: a.id,
    title: a.text,
    covers: a.owner ? `Owner: ${a.owner}` : 'No owner',
    expiresAt: a.dueAt,
    satisfiedAt: a.doneAt,
    reference: null,
    heldAt: { href: '/safety', label: 'Safety' },
  }));

  const storedRows = (kind: ComplianceArea): Row[] =>
    stored.filter(i => i.kind === kind).map(i => ({
      id: i.id, title: i.title, covers: i.covers, expiresAt: i.expiresAt,
      satisfiedAt: i.satisfiedAt, reference: i.reference,
    }));

  const rowsFor = (k: ComplianceArea): Row[] =>
    k === 'licences' ? licenceRows : k === 'breaches' ? breachRows : storedRows(k);

  /*
    The counts are over EVERYTHING the business has to keep current, across all six areas — because
    "how many things are stopping work" is a question about the business, not about whichever tab
    happens to be open.
  */
  const everything = AREAS.flatMap(a => rowsFor(a.key));
  const breachesThisYear = actions.filter(a =>
    !a.doneAt && a.dueAt && a.dueAt < today && a.dueAt.slice(0, 4) === today.slice(0, 4)).length;
  const stats = complianceStats(everything, breachesThisYear, now);

  const rows = byUrgency(rowsFor(tab), now);
  const count = (k: ComplianceArea) =>
    rowsFor(k).filter(r => stopsWork(stateOf(r, now))).length;

  return (
    <Shell
      title="Compliance"
      kicker="Compliance"
      headline="Do what we say, and prove it."
      subtitle={`Every licence, policy, certificate, contract and audit in one place. SPEC warns ${WARN_BEFORE_DAYS} days before anything lapses, and anything that lapses stops the work it covers.`}
    >
      <Refused reason={refusedReason(sp)} />

      <p className="-mt-3 mb-6 max-w-3xl text-base text-ink">{headline(stats)}</p>

      {/* ── The four numbers ────────────────────────────────────────────────────────────────── */}
      <section aria-label="Compliance at a glance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Current', value: `${stats.current} of ${stats.total}`, note: 'licences, policies and documents', tone: LIGHT_COLOUR.green },
          { label: `Expiring in ${WARN_BEFORE_DAYS} days`, value: String(stats.expiringSoon), note: stats.expiringSoon ? 'renew them before they bite' : 'nothing due', tone: stats.expiringSoon ? LIGHT_COLOUR.amber : LIGHT_COLOUR.green },
          { label: 'Stopping work', value: String(stats.stoppingWork), note: 'cannot be booked until fixed', tone: stats.stoppingWork ? LIGHT_COLOUR.red : LIGHT_COLOUR.green },
          { label: 'Breaches this year', value: String(stats.breachesThisYear), note: 'the standard is zero', tone: stats.breachesThisYear ? LIGHT_COLOUR.red : LIGHT_COLOUR.green },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 block h-3 w-3 flex-none rounded-full" style={{ background: s.tone }} />
              <div>
                <p className="text-sm text-ink-light">{s.label}</p>
                <p className="font-serif text-3xl text-ink">{s.value}</p>
                <p className="mt-0.5 text-xs text-ink-light">{s.note}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── The six areas ───────────────────────────────────────────────────────────────────── */}
      <nav aria-label="Compliance areas" className="mt-6 flex flex-wrap gap-2">
        {AREAS.map(a => {
          const on = a.key === tab;
          const n = count(a.key);
          return (
            <Link
              key={a.key}
              href={`/compliance?tab=${a.key}`}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm ${
                on ? 'bg-ink text-cream' : 'bg-surface text-ink ring-1 ring-cream-border hover:bg-cream'
              }`}
            >
              {a.label}
              {n > 0 && (
                <span
                  className="grid h-5 min-w-[20px] place-content-center rounded-full px-1.5 text-[11.5px] font-semibold"
                  style={on
                    ? { background: '#fff', color: LIGHT_INK.red }
                    : { background: `color-mix(in srgb, ${LIGHT_COLOUR.red} 16%, transparent)`, color: LIGHT_INK.red }}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">{spec.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{spec.blurb}</p>

        {/*
          Said out loud on the two areas SPEC already holds. A screen that shows somebody's licence
          without saying where it lives invites them to fix it here and wonder why People disagrees.
        */}
        {spec.readOnly && (
          <p className="mt-2 max-w-3xl text-sm text-ink">
            {tab === 'licences'
              ? <>Read from People, where licences and tickets are held against the person and gate Clear to Work. SPEC keeps one copy. <Link href="/people#clear-to-work" className="text-rust-700 hover:underline">Add or renew one on People →</Link></>
              : <>Read from Safety, where corrective actions are raised against what went wrong. <Link href="/safety" className="text-rust-700 hover:underline">Open the safety register →</Link></>}
          </p>
        )}

        {rows.length === 0 && (
          <p className="mt-4 text-sm text-ink-light">
            Nothing recorded in {spec.title.toLowerCase()} yet.
            {spec.readOnly ? ' It will appear here as soon as it is recorded where it lives.' : ' Add the first one below.'}
          </p>
        )}

        <ul className="mt-4 grid gap-2">
          {rows.map(r => {
            const state = stateOf(r, now);
            return (
              <li key={r.id} className="rounded-2xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="text-sm text-ink-light">
                      {[r.covers, r.satisfiedAt ? `Done ${r.satisfiedAt.slice(0, 10)}` : stateNote(r, now), r.reference]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ color: INK[state], background: `color-mix(in srgb, ${COLOUR[state]} 14%, transparent)` }}
                  >
                    {STATE_LABEL[state]}
                  </span>
                </div>

                {manager && !spec.readOnly && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-cream-border pt-3">
                    <form action={renewItem} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="text-xs text-ink-light">
                        Renewed until
                        <input type="date" name="expiresAt" required className="input mt-1 block py-1.5 text-sm" />
                      </label>
                      <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Renew</SubmitButton>
                    </form>
                    {!r.satisfiedAt && (
                      <form action={satisfyItem} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="reference" placeholder="Reference" className="input py-1.5 text-sm" />
                        <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Mark done</SubmitButton>
                      </form>
                    )}
                  </div>
                )}

                {spec.readOnly && r.heldAt && (
                  <p className="mt-1 text-xs text-ink-light">
                    Held on <Link href={r.heldAt.href} className="text-rust-700 hover:underline">{r.heldAt.label}</Link>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {manager && !spec.readOnly && (
          <form action={addItem} className="mt-5 grid gap-2 border-t border-cream-border pt-5 sm:grid-cols-5">
            <input type="hidden" name="kind" value={tab} />
            <input name="title" required placeholder="What it is" className="input sm:col-span-2" />
            <input name="covers" placeholder="Who or what it covers" className="input" />
            <label className="text-xs text-ink-light">
              Expires
              <input type="date" name="expiresAt" className="input mt-1 w-full py-1.5 text-sm" />
            </label>
            <select name="ownerRoleId" defaultValue="" className="input">
              <option value="">Who owns it</option>
              {scope.roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <div className="sm:col-span-5">
              <SubmitButton className="btn-secondary px-5 py-2">Add to {spec.label.toLowerCase()}</SubmitButton>
            </div>
          </form>
        )}

        <p className="mt-4 text-xs text-ink-light">Feeds {spec.feeds}.</p>
      </section>

      {/*
        The two windows differ on purpose, and saying so is cheaper than somebody finding out by
        being surprised — see WARN_BEFORE_DAYS in lib/compliance.
      */}
      <p className="mt-6 max-w-3xl text-sm text-ink-light">
        Compliance warns {WARN_BEFORE_DAYS} days out, because a renewal that takes six weeks against
        a shorter warning is a fortnight of somebody who cannot be sent anywhere. Clear to Work on
        People warns at {CLEAR_TO_WORK_WARNS_AT} days, because it answers a different question —
        whether this person can work today.
      </p>
    </Shell>
  );
}
