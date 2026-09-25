import {
  weekWatch, rosterLine, ALLOWANCE_FROM_THE_AWARD, AFTER_HOURS_ROUTES,
  keyWatch, keyRolesLine, HANDOVER, WHY_A_BACKUP,
  type OnCallWeek, type KeyRole,
} from '@/lib/on-call';
import { useWatch, usingLine, ADOPTION_IS_NOT_A_MEMO, USING_LABEL, type PersonWeek } from '@/lib/round3';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * On call, key roles with a named backup, and who did the week on the phone.
 *
 * Three lists whose whole value is the ABSENCE they surface. An empty on-call week looks exactly
 * like a week nobody has filled in yet until eleven o'clock on a Friday; a key role with no backup
 * looks fine while that person keeps turning up; and somebody who did none of the week on the phone
 * looks like nothing at all, because their hours simply arrive as a text message that somebody in
 * the office types up.
 */
export function OnCallPanel({ weeks, keyRoles, week }: {
  weeks: OnCallWeek[];
  keyRoles: KeyRole[];
  week: PersonWeek[];
}) {
  return (
    <div className="grid gap-10" data-oncall-panel>
      {/* ── On call ─────────────────────────────────────────────────────────────────────────── */}
      <section data-oncall>
        <h2 className="font-serif text-2xl text-ink">On call</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{rosterLine(weeks)}</p>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{AFTER_HOURS_ROUTES}</p>
        {weeks.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {weeks.map(w => {
              const watch = weekWatch(w);
              return (
                <li
                  key={w.weekStart}
                  className="card-inset grid gap-0.5 border-l-4"
                  style={{ borderLeftColor: watch.state === 'covered' ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}
                  data-oncall-week={w.weekStart}
                  data-oncall-state={watch.state}
                >
                  <span className="text-sm text-ink">{watch.says}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 max-w-3xl text-xs text-ink-light">{ALLOWANCE_FROM_THE_AWARD}</p>
      </section>

      {/* ── Key roles ───────────────────────────────────────────────────────────────────────── */}
      <section data-key-roles>
        <h2 className="font-serif text-2xl text-ink">Key roles</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{keyRolesLine(keyRoles)}</p>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{WHY_A_BACKUP}</p>
        {keyRoles.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {keyRoles.map(r => {
              const watch = keyWatch(r);
              return (
                <li
                  key={r.roleId}
                  className="card-inset grid gap-0.5 border-l-4"
                  style={{ borderLeftColor: watch.state === 'covered' ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}
                  data-key-role={r.roleId}
                  data-key-state={watch.state}
                >
                  <span className="font-serif text-base text-ink">{r.title}</span>
                  <span className="text-sm text-ink">{watch.says}</span>
                </li>
              );
            })}
          </ul>
        )}
        <h3 className="mt-5 font-serif text-lg text-ink">When somebody resigns</h3>
        <ul className="mt-2 grid gap-0.5">
          {HANDOVER.map(step => (
            <li key={step} className="text-sm text-ink-light" data-handover>{step}</li>
          ))}
        </ul>
      </section>

      {/* ── Using siteVIP this week ─────────────────────────────────────────────────────────── */}
      <section data-using>
        <h2 className="font-serif text-2xl text-ink">Using siteVIP this week</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{usingLine(week)}</p>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{ADOPTION_IS_NOT_A_MEMO}</p>
        {week.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {week.map(p => {
              const watch = useWatch(p);
              /*
                Somebody with no days booked is not on the list as a failure. A supervisor told off
                about somebody's holiday stops reading the list, and then it guards nothing.
              */
              if (watch.state === 'not_working') return null;
              return (
                <li
                  key={p.personKey}
                  className="card-inset grid gap-0.5"
                  data-using-person={p.personKey}
                  data-using-state={watch.state}
                >
                  <span className="text-sm text-ink">{watch.says}</span>
                  <span className="text-xs text-ink-light">
                    {p.did.length === 0 ? 'None of it' : p.did.map(u => USING_LABEL[u]).join(' · ')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
