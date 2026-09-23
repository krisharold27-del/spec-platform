import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth';
import { loadDirectory, mayEditContact } from '@/lib/directory-data';
import { searchDirectory, telHref, mailHref, type DirPerson } from '@/lib/directory';
import { STATE_LABEL } from '@/lib/obligations';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { SubmitButton } from '@/components/submit-button';
import { saveStaffContact } from './actions';

const CLEAR_INK = { clear: LIGHT_INK.green, blocked: LIGHT_INK.red, unknown: LIGHT_INK.pending } as const;
const CLEAR_BG = { clear: LIGHT_COLOUR.green, blocked: LIGHT_COLOUR.red, unknown: LIGHT_COLOUR.pending } as const;
const LICENCE_INK = { expired: LIGHT_INK.red, missing: LIGHT_INK.pending, expiring: LIGHT_INK.amber, current: LIGHT_INK.green } as const;

/**
 * People → Staff list: everybody in the business, one row a person. See lib/directory for the two
 * readings — the directory for everybody, Clear to Work and licences only down the viewer's line.
 */
export async function StaffListTab({ user, q }: { user: CurrentUser; q: string }) {
  const { people, scope, selfKey } = await loadDirectory(user);
  const list = searchDirectory(people, q);
  const onChart = people.filter(p => p.roles.length).length;
  const csv = `/people/export-staff${q ? `?${new URLSearchParams({ q })}` : ''}`;

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Everyone in the business</h2>
        <span className="text-sm text-ink-light">
          {people.length} {people.length === 1 ? 'person' : 'people'} · {onChart} on the chart
        </span>
      </div>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
        Leaders and team members alike. Phone and email are for everybody in the business; Clear to
        Work and licences show for you and the people beneath you, the same as every scorecard.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action="/people" method="get" className="flex min-w-0 max-w-md flex-1 gap-2">
          <input type="hidden" name="mode" value="staff" />
          <input className="input min-w-0 flex-1" type="search" name="q" defaultValue={q} placeholder="Search name, role, phone" aria-label="Search the staff list" />
          <button className="btn-secondary" type="submit">Search</button>
        </form>
        <a href={csv} className="btn-ghost" download>Download CSV</a>
      </div>

      {!list.length ? (
        <p className="mt-4 text-sm text-ink-light">
          {q ? 'Nobody matches that.' : 'Nobody yet. Put people in their roles on the org chart and they are listed here.'}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {list.map(p => (
            <PersonRow key={p.key} p={p} q={q} editable={mayEditContact(p, user, scope, selfKey)} self={p.key === selfKey} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonRow({ p, q, editable, self }: { p: DirPerson; q: string; editable: boolean; self: boolean }) {
  const tel = telHref(p.phone);
  const mail = mailHref(p.email);
  return (
    <li className="card-inset grid gap-2 md:grid-cols-[1.3fr_1.2fr_1fr_1.1fr] md:items-start">
      <div className="min-w-0">
        <div className="font-serif text-base text-ink">
          {p.name}{self && <span className="ml-2 text-xs text-ink-light">you</span>}
        </div>
        {p.roles.length ? p.roles.map(r => (
          <div key={r.roleId} className="text-xs text-ink-light">
            {p.canOpenCard
              ? <Link href={`/scorecard/${r.roleId}`} className="text-ink hover:text-rust">{r.title}</Link>
              : <span className="text-ink">{r.title}</span>}
            {r.isTeam && ' · team'}
            {r.reportsTo && <> · reports to {r.reportsTo}</>}
          </div>
        )) : <div className="text-xs text-ink-light">Not on the chart yet</div>}
      </div>

      <div className="grid gap-1 text-sm">
        {tel ? <a href={tel} className="inline-flex min-h-[32px] items-center text-rust-700 hover:underline">{p.phone}</a>
          : <span className="text-ink-light">{p.phone ?? 'No phone recorded'}</span>}
        {mail ? <a href={mail} className="break-all text-rust-700 hover:underline">{p.email}</a>
          : <span className="text-ink-light">No email recorded</span>}
      </div>

      <div className="text-xs text-ink-light">
        {p.startDate
          ? <>{p.startFrom === 'stated' ? 'Started' : 'On the chart since'} {p.startDate}</>
          : 'Start date not recorded'}
        {!p.hasSeat && <span className="mt-0.5 block">No SPEC login</span>}
      </div>

      <div className="grid gap-1">
        {p.clear ? (
          <span>
            <span
              className="pill"
              style={{ background: `color-mix(in srgb, ${CLEAR_BG[p.clear.state]} 14%, transparent)`, color: CLEAR_INK[p.clear.state] }}
            >
              {p.clear.label}
            </span>
            {p.clear.state === 'blocked' && p.clear.reason && <span className="mt-1 block text-xs text-ink-light">{p.clear.reason}</span>}
          </span>
        ) : p.licences === null ? (
          <span className="text-xs text-ink-light">Clear to Work shows to them and the people above them.</span>
        ) : (
          <span className="text-xs text-ink-light">{p.roles.length ? 'Not a crew role' : 'Nothing to establish until they hold a role'}</span>
        )}
        {p.licences && p.licences.length > 0 && (
          <ul className="grid gap-0.5 text-xs">
            {p.licences.map((l, i) => (
              <li key={i} style={{ color: LICENCE_INK[l.state] }}>
                {l.what} · {STATE_LABEL[l.state]}{l.expiresAt && l.state !== 'missing' ? ` ${l.expiresAt.slice(0, 10)}` : ''}
              </li>
            ))}
          </ul>
        )}
        {p.licences && !p.licences.length && <span className="text-xs text-ink-light">No licence expiring</span>}
      </div>

      {editable && (
        <details className="md:col-span-4">
          <summary className="cursor-pointer text-xs text-rust-700 hover:underline">
            {self ? 'Your details' : 'Change details'}
          </summary>
          <form action={saveStaffContact} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
            <input type="hidden" name="key" value={p.key} />
            <input type="hidden" name="q" value={q} />
            <input className="input" type="tel" name="phone" defaultValue={p.phone ?? ''} maxLength={40} placeholder="Phone" aria-label={`Phone for ${p.name}`} />
            {p.hasSeat
              ? <span className="self-center text-xs text-ink-light">Email is their sign-in: {p.email}</span>
              : <input className="input" type="email" name="email" defaultValue={p.email ?? ''} maxLength={160} placeholder="Email" aria-label={`Email for ${p.name}`} />}
            <input className="input" type="date" name="startDate" defaultValue={p.startFrom === 'stated' ? p.startDate ?? '' : ''} aria-label={`Start date for ${p.name}`} />
            <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
          </form>
        </details>
      )}
    </li>
  );
}
