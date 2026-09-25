import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { SwitchCards } from '@/components/recommends';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { refusedReason } from '@/lib/refuse';
import { switchReading } from '@/lib/recommends-data';
import {
  SWITCH_AREAS, areaOf, switchPlan, mayRunSideBySide, mayUseSwitch, mayUndo, stillChecking, confirmed,
  productName, sideBySideName, didYouKnow, GUARANTEE, DAY_ONE, FRICTION_KINDS, monthOf,
} from '@/lib/switch';
import { LIGHT_COLOUR } from '@/lib/today';
import { runSideBySide, sayReady, switchNow, undoSwitch, reportFriction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Switch when ready' };

/**
 * Switch when ready — one area's switch-over plan.
 *
 * Reached from a "Did you know?" card once somebody taps "I want this". The plan is tailored to the
 * business — its own gaps are its steps — and every step's done-ness is worked out from its data, so
 * there is nothing to tick. The switch is one toggle, and it unlocks only when the owner has said
 * ready AND SPEC's check has confirmed. Undo is always there. See lib/switch.
 */
export default async function SwitchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  if (!canManage(user.access)) redirect('/my-page');
  const cannot = refusedReason(sp);
  const area = areaOf(typeof sp.area === 'string' ? sp.area : '');

  if (!area) {
    return (
      <Shell title="Switch when ready" headline="Keep running what you run today. Switch an area to SPEC when you are ready.">
        <Refused reason={cannot} />
        <p className="mb-4 max-w-2xl text-sm text-ink-light">{DAY_ONE}</p>
        <SwitchCards areas={SWITCH_AREAS.map(a => a.key)} back="/switch" />
      </Shell>
    );
  }

  const { row, checks, rec } = await switchReading(user.tenantId, area);
  const admin = (await getScope(user)).canAdminister;
  const product = productName(area);
  const plan = row ? switchPlan(area, row, checks) : null;
  const ok = confirmed(area, checks);
  const told = sp.told === '1';

  const Control = ({ action, label, primary }: { action: (f: FormData) => Promise<void>; label: string; primary?: boolean }) => (
    <form action={action}>
      <input type="hidden" name="area" value={area.key} />
      <SubmitButton className={primary ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}>{label}</SubmitButton>
    </form>
  );

  return (
    <Shell title="Switch when ready" headline={`Your ${area.noun}, and ${product}.`}>
      <Link href="/virtual-gm" className="text-sm text-rust-700 hover:underline">&larr; Virtual GM + Virtual Admin</Link>
      <Refused reason={cannot} />

      {!row ? (
        <section className="mt-4 grid gap-3">
          <p className="max-w-2xl text-sm text-ink-light">{didYouKnow(area)} {DAY_ONE}</p>
          <SwitchCards areas={[area.key]} back={`/switch?area=${area.key}`} />
        </section>
      ) : (
        <>
          {/* ── The plan ─────────────────────────────────────────────────────────────────────── */}
          <section className="mt-4 card" data-switch-plan>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Your switch-over plan</h2>
              <span className="text-sm text-ink-light" data-switch-progress>{plan!.done} of {plan!.steps.length} done</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round((plan!.done / plan!.steps.length) * 100)}%`, background: LIGHT_COLOUR.green }} />
            </div>
            <ol className="mt-4 grid gap-2">
              {plan!.steps.map((s, i) => (
                <li key={s.key} className="flex items-start gap-3 text-sm" data-switch-step={s.key} data-done={s.done}>
                  <span className="mt-0.5 w-5 shrink-0 text-center font-semibold" style={{ color: s.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending }}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className="grid">
                    {s.href ? <Link href={s.href} className="text-ink hover:text-rust">{s.label} &rarr;</Link> : <span className="text-ink">{s.label}</span>}
                    {s.note && <span className="text-xs text-ink-light">{s.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* ── The switch ───────────────────────────────────────────────────────────────────── */}
          <section className="mt-6 card" data-switch-controls>
            <h2 className="font-serif text-xl text-ink">
              {row.state === 'spec' ? `${product} runs your ${area.noun}` : 'The switch'}
            </h2>
            <p className="mt-1 text-sm text-ink-light">
              {row.state === 'spec'
                ? `Switched ${row.switchedAt?.slice(0, 10)}. Your old system was never touched, so undo puts you straight back.`
                : row.state === 'side_by_side'
                  ? `${product} is running ${sideBySideName(area)} with your own system. Your own system is still the one that counts.`
                  : `${DAY_ONE} It unlocks when you say you’re ready and SPEC has confirmed everything matches.`}
            </p>

            {!admin && row.state !== 'spec' && (
              <p className="mt-3 text-sm text-ink-light">An administrator of this business makes the switch.</p>
            )}

            {admin && (
              <div className="mt-4 flex flex-wrap gap-2">
                {mayRunSideBySide(area, row) && (
                  <Control action={runSideBySide} label={area.key === 'accounting' ? 'Turn on Shadow' : 'Run side by side'} />
                )}
                {row.state !== 'spec' && !row.ownerReadyAt && <Control action={sayReady} label="I’m ready to switch" />}
                {mayUseSwitch(area, row, checks) && <Control action={switchNow} label={`Switch to ${product}`} primary />}
                {mayUndo(row) && <Control action={undoSwitch} label="Undo — back to your own system" />}
              </div>
            )}

            {/* Owner ready, but not confirmed: say exactly what is still being checked. */}
            {row.ownerReadyAt && row.state !== 'spec' && !mayUseSwitch(area, row, checks) && (
              <div className="mt-4 rounded-xl bg-cream px-3.5 py-2.5 text-sm" data-switch-not-yet>
                <span className="font-semibold text-ink">Not available yet.</span>{' '}
                <span className="text-ink-light">You’ve said you’re ready. Still being checked:</span>
                <ul className="mt-1 grid gap-0.5 text-ink-light">
                  {stillChecking(area, row, checks).map(s => <li key={s}>{s}</li>)}
                </ul>
                {!ok && <p className="mt-1 text-xs text-ink-light">We’ll tell you here when it’s ready.</p>}
              </div>
            )}
          </section>

          {/* ── The Simple Guarantee ─────────────────────────────────────────────────────────── */}
          <section className="mt-6 card" data-switch-guarantee>
            <h2 className="font-serif text-xl text-ink">{GUARANTEE}</h2>
            {told ? (
              <p className="mt-2 text-sm text-ink" data-switch-told>
                Logged, so it gets fixed. Your Simple Guarantee claim for {monthOf()} is recorded — that month comes off your bill.
              </p>
            ) : (
              <form action={reportFriction} className="mt-3 grid max-w-xl gap-2">
                <input type="hidden" name="area" value={area.key} />
                <label className="text-sm text-ink" htmlFor="kind">Was anything not easy?</label>
                <select id="kind" name="kind" required className="rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm">
                  {FRICTION_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <textarea name="note" rows={2} maxLength={1000} placeholder="What happened, if you want to say (stays in your business)"
                  className="rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm" />
                <SubmitButton className="btn-secondary w-fit px-4 py-2 text-sm">Tell SPEC</SubmitButton>
              </form>
            )}
          </section>

          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-rust-700">What SPEC checked</summary>
            <p className="mt-2 text-ink-light">{rec.headline}</p>
          </details>
        </>
      )}
    </Shell>
  );
}
