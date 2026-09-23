import Link from 'next/link';
import {
  AREAS, AREA_CATEGORY, SYSTEM_NOUN, capabilitiesIn, CONNECTED_LABEL, CONNECTION_WORDS, areaRunner, totalsOf,
  connectedNote, connectionState, connectHref, connectLabel,
  type Choices, type ConnectCategory, type Runner,
} from '@/lib/coverage';
import { chooseRunner } from './actions';

/**
 * The map and its switches.
 *
 * Kept per business in `coverage_choices` — see the note on the page. Each switch is a small form
 * posting to `chooseRunner`, so it works without script and the choice is the business's, not this
 * browser's. People who cannot change it see where things stand and no switch.
 */
export function CoverageMap({ choices, connections, canChange }: {
  choices: Choices;
  connections: { category: string; status: string }[];
  canChange: boolean;
}) {
  const totals = totalsOf(choices);
  const tiles = [
    { label: 'Things SPEC does', value: totals.total, note: 'Across jobs, HR and safety' },
    { label: 'Running in SPEC', value: totals.inSpec, note: 'Nothing else to buy for these' },
    { label: 'From connected systems', value: totals.connected, note: connectedNote(totals) },
  ];

  const pill = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
      on ? 'bg-[#4f7a3f] text-white' : 'bg-surface-raised text-ink-light hover:text-ink'}`;

  /** One side of a switch: a button that posts, or — read-only — just the state. */
  const side = (on: boolean, label: string, fields: Record<string, string>, runner: Runner) =>
    canChange ? (
      <form action={chooseRunner}>
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="runner" value={runner} />
        <button type="submit" className={pill(on)} aria-pressed={on}>{label}</button>
      </form>
    ) : (
      <span className={pill(on)} aria-current={on ? 'true' : undefined}>{label}</span>
    );

  /** Where the business's own system stands, for a row or an area handed to it. Never red. */
  const connection = (category: ConnectCategory) => {
    const state = connectionState(category, connections);
    return state === 'live' ? (
      <span className="text-[13px] font-semibold text-[#4f7a3f]" data-connection="live">{CONNECTION_WORDS.live}</span>
    ) : (
      <span className="text-[13px] text-ink-light" data-connection={state}>
        {state === 'waiting' && <>{CONNECTION_WORDS.waiting} · </>}
        <Link href={connectHref(category)} className="text-rust-700 hover:underline">{connectLabel(category)} →</Link>
      </span>
    );
  };

  return (
    <>
      <section className="grid gap-3.5 pb-6 sm:grid-cols-3">
        {tiles.map(t => (
          <div key={t.label} className="card">
            <span className="label-caps">{t.label}</span>
            <p className="mt-2.5 font-serif text-[34px] leading-none text-ink">{t.value}</p>
            <p className="mt-2 text-[13px] text-ink-light">{t.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6">
        {AREAS.map(area => {
          const whole = areaRunner(choices, area.key);
          const category = AREA_CATEGORY[area.key];
          return (
            <section key={area.key} id={area.key} className="card scroll-mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-ink">{area.title}</h2>
                <Link href={area.href} className="text-sm text-rust-700 hover:underline">Open {area.short} →</Link>
              </div>
              <p className="mb-4 mt-2 max-w-[66ch] text-sm leading-relaxed text-ink-light">{area.blurb}</p>

              {/* The whole area at once — the simple answer. The rows underneath are for a mix. */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3.5" data-area-switch={area.key}>
                <span className="grid min-w-0 flex-[1_1_260px] gap-0.5">
                  <span className="text-[14.5px] font-bold text-ink">All of {area.short}</span>
                  <span className="text-[13px] text-ink-light">
                    {whole === 'own'
                      ? <>In your own {SYSTEM_NOUN[category]} · {connection(category)}</>
                      : whole === 'mixed'
                        ? 'Some in SPEC, some in your own systems — set row by row below.'
                        : 'SPEC — built in, nothing to connect.'}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5" role="group" aria-label={`Who runs ${area.short}`}>
                  {side(whole === 'spec', 'Use SPEC', { area: area.key }, 'spec')}
                  {side(whole === 'own', 'Use my own system', { area: area.key }, 'own')}
                </span>
              </div>

              <div className="grid gap-2">
                {capabilitiesIn(area.key).map(c => {
                  const own = choices[c.key] === 'own';
                  return (
                    <div key={c.key} id={`cap-${c.key}`} className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3" data-capability={c.key}>
                      <span className="grid min-w-0 flex-[1_1_320px] gap-0.5">
                        <span className="text-[14.5px] font-bold text-ink">
                          {c.name}
                          {c.href && !own && (
                            <Link href={c.href} className="ml-2 text-[13px] font-normal text-rust-700 hover:underline">Open in SPEC →</Link>
                          )}
                        </span>
                        <span className="text-[13px] leading-[19px] text-ink-light">{c.what}</span>
                        {own && <span className="mt-0.5">{connection(c.connect)}</span>}
                      </span>
                      <span className="flex shrink-0 gap-1.5" role="group" aria-label={`Who runs ${c.name}`}>
                        {side(!own, 'SPEC', { capability: c.key }, 'spec')}
                        {side(own, CONNECTED_LABEL[c.connect], { capability: c.key }, 'own')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-ink-light">
        {canChange
          ? 'Saved for the whole business. Everything starts in SPEC, and the SPEC screens stay open whichever you choose.'
          : 'Set for the whole business by a manager. Everything starts in SPEC.'}
      </p>
    </>
  );
}
