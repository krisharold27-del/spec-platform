'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AREAS, capabilitiesIn, CONNECTED_LABEL, choose, readChoices, totalsOf, connectedNote,
  type Choices, type Runner,
} from '@/lib/coverage';

/**
 * The map and its switches.
 *
 * Remembered in this browser only — see the note on the page. Every read and write of storage is
 * guarded: a private window or blocked storage simply shows the defaults, and the switch still works
 * for the visit.
 */
const keyFor = (tenantId: string) => `spec:coverage:${tenantId}`;

export function CoverageMap({ tenantId, defaults }: { tenantId: string; defaults: Choices }) {
  const [choices, setChoices] = useState<Choices>(defaults);

  useEffect(() => {
    try {
      setChoices(readChoices(window.localStorage.getItem(keyFor(tenantId)), defaults));
    } catch { /* storage unavailable: the defaults stand */ }
    // Read once per business. `defaults` is rebuilt each render on the server side, not here.
  }, [tenantId]);

  const pick = (key: string, runner: Runner) => {
    setChoices(prev => {
      const next = choose(prev, key, runner);
      try { window.localStorage.setItem(keyFor(tenantId), JSON.stringify(next)); } catch { /* visit only */ }
      return next;
    });
  };

  const totals = totalsOf(choices);
  const tiles = [
    { label: 'Things SPEC does', value: totals.total, note: 'Across jobs, HR and safety' },
    { label: 'Running in SPEC', value: totals.inSpec, note: 'Nothing else to buy for these' },
    { label: 'From connected systems', value: totals.connected, note: connectedNote(totals) },
  ];

  const pill = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
      on ? 'bg-[#4f7a3f] text-white' : 'bg-surface-raised text-ink-light hover:text-ink'}`;

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
        {AREAS.map(area => (
          <section key={area.key} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-2xl text-ink">{area.title}</h2>
              <Link href={area.href} className="text-sm text-rust-700 hover:underline">Open {area.short} →</Link>
            </div>
            <p className="mb-4 mt-2 max-w-[66ch] text-sm leading-relaxed text-ink-light">{area.blurb}</p>
            <div className="grid gap-2">
              {capabilitiesIn(area.key).map(c => {
                const own = choices[c.key] === 'connected';
                return (
                  <div key={c.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3" data-capability={c.key}>
                    <span className="grid min-w-0 flex-[1_1_320px] gap-0.5">
                      <span className="text-[14.5px] font-bold text-ink">{c.name}</span>
                      <span className="text-[13px] leading-[19px] text-ink-light">{c.what}</span>
                    </span>
                    <span className="flex shrink-0 gap-1.5" role="group" aria-label={`Who runs ${c.name}`}>
                      <button type="button" className={pill(!own)} aria-pressed={!own} onClick={() => pick(c.key, 'spec')}>
                        SPEC
                      </button>
                      {c.connect && (
                        <button type="button" className={pill(own)} aria-pressed={own} onClick={() => pick(c.key, 'connected')}>
                          {CONNECTED_LABEL[c.connect]}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-light">
        Your choices here are remembered in this browser only, for now. They start from the systems
        you have connected, and change nothing else in SPEC yet.
      </p>
    </>
  );
}
