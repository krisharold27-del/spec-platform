import { SubmitButton } from '@/components/submit-button';
import { pillTone, LIGHT_INK, type Light } from '@/lib/today';
import {
  CHECKS, stateOf, mayBook, expiringSoon, chaseText, subbieStats, subbieLine, WARN_DAYS,
  type Check,
} from '@/lib/subbies';
import { inviteSubbie, recordSubbieCheck } from './actions';

function Pill({ light, children }: { light: Light; children: React.ReactNode }) {
  return <span className="pill whitespace-nowrap" style={pillTone(light)}>{children}</span>;
}

export interface SubbieRow {
  id: string;
  business: string;
  contact: string;
  mobile: string;
  status: string;
  checks: Check[];
}

/**
 * Subcontractors — People → Subcontractors.
 *
 * ── What a subbie is, settled ────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"subcontractors are people working for the business and are held to the full
 * expectation on every job. Each subbie is a PAID TEAM SEAT, not free. Same SWMS, checklists and
 * KPIs as employees; their scores count on their supervisor's team board."* They see only their own
 * jobs, never the business's prices.
 *
 * So this sits under People, not beside suppliers, and it looks like the rest of People. The six
 * checks are the whole screen: ALL SIX or they cannot be booked — see lib/subbies for why five is
 * not a number this uses.
 */
export function SubbiesTab({ rows, manage, today, business }: {
  rows: SubbieRow[];
  manage: boolean;
  today: string;
  business: string;
}) {
  const byId = new Map(rows.map(r => [r.id, r.checks]));
  const stats = subbieStats(rows, byId, today);

  return (
    <div className="grid gap-6">
      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Subcontractors</h2>
          <span className="text-sm text-ink-light">A team seat each, the same as anybody else</span>
        </div>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Subbies are people working for the business, held to the full expectation on every job —
          the same SWMS, the same checklists, the same KPIs, and their scores count on their
          supervisor&rsquo;s board. They see only their own jobs, never what the work is being
          charged at.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{subbieLine(stats)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Clear to work', value: String(stats.active), note: 'all six checks current', light: 'green' as Light },
            { label: 'Setting up', value: String(stats.onboarding), note: 'invited, not finished', light: 'pending' as Light },
            { label: 'Cannot be booked', value: String(stats.blocked), note: 'something missing or lapsed', light: (stats.blocked ? 'red' : 'green') as Light },
            { label: `Expiring in ${WARN_DAYS} days`, value: String(stats.expiring), note: 'chase before it stops work', light: (stats.expiring ? 'amber' : 'green') as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>

        {manage && (
          <form action={inviteSubbie} className="mt-4 grid gap-2 sm:grid-cols-[1.5fr_1.2fr_1fr_auto]">
            <input className="input" name="business" required maxLength={160} placeholder="Their business name" aria-label="Business name" />
            <input className="input" name="contact" maxLength={120} placeholder="Who you deal with" aria-label="Contact name" />
            <input className="input" name="mobile" required maxLength={40} inputMode="tel" placeholder="Mobile" aria-label="Mobile" />
            <SubmitButton className="btn-secondary shrink-0" pending="Inviting…">Invite</SubmitButton>
          </form>
        )}
        <p className="mt-2 text-xs text-ink-light">
          They set themselves up on their phone in about ten minutes — the six checks below, once,
          and SPEC keeps track of the dates after that.
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
          No subcontractors yet. Invite one above and they do the rest from their phone.
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map(r => {
            const verdict = mayBook(r.checks, today);
            const soon = expiringSoon(r.checks, today);
            return (
              <section key={r.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="grid gap-0.5">
                    <strong className="text-sm text-ink">{r.business}</strong>
                    <span className="text-xs text-ink-light">
                      {r.contact || 'no contact named'}{r.mobile ? ` · ${r.mobile}` : ''}
                    </span>
                  </div>
                  <Pill light={verdict.ok ? 'green' : r.status === 'active' ? 'red' : 'pending'}>
                    {verdict.ok ? 'Clear to work' : r.status === 'active' ? 'Cannot be booked' : 'Setting up'}
                  </Pill>
                </div>

                {!verdict.ok && (
                  <p className="mt-3 rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: 'color-mix(in srgb, var(--red) 12%, transparent)' }}>
                    {verdict.why}
                  </p>
                )}

                <div className="mt-3 grid gap-2">
                  {CHECKS.map(c => {
                    const found = r.checks.find(x => x.kind === c.key);
                    const state = found ? stateOf(found, today) : 'missing';
                    const light: Light = state === 'current' ? 'green' : state === 'expiring' ? 'amber' : 'red';
                    return (
                      <div key={c.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-2.5">
                        <span className="grid min-w-0 flex-[1_1_320px] gap-0.5">
                          <span className="text-sm font-semibold text-ink">{c.label}</span>
                          <span className="text-xs text-ink-light">{c.why}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Pill light={light}>
                            {state === 'missing' ? 'Not supplied'
                              : state === 'expired' ? `Lapsed ${found?.expiresAt}`
                                : state === 'expiring' ? `Expires ${found?.expiresAt}` : 'Current'}
                          </Pill>
                          {manage && (
                            <form action={recordSubbieCheck} className="flex gap-1.5">
                              <input type="hidden" name="subbieId" value={r.id} />
                              <input type="hidden" name="kind" value={c.key} />
                              {c.expires && <input className="input w-[150px]" name="expiresAt" type="date" aria-label={`${c.label} expiry`} />}
                              <SubmitButton className="btn-secondary shrink-0 text-xs" pending="…">Record</SubmitButton>
                            </form>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/*
                  The chase, drafted and not sent. A message that goes out on its own is a message
                  the business did not know it sent, and the first time it is wrong it is the
                  business's name on it.
                */}
                {soon.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {soon.map(c => (
                      <p key={c.kind} className="rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: 'color-mix(in srgb, var(--amber) 12%, transparent)' }}>
                        <b>Ready to send:</b> {chaseText(business, r.contact || r.business, c.kind, c.expiresAt ?? '')}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
