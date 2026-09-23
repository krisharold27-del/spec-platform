'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SITEVIP_SYSTEMS, defaultOwnSystems, startHref, systemsLine } from '@/lib/sitevip';

/**
 * The two moving parts of the siteVIP front door. Everything else on that page is server-rendered.
 *
 * The business-name box is a real GET form onto /signup with the field named `business` — the
 * parameter sign-up already reads — so it still works with no JavaScript at all. With JavaScript,
 * Enter on an empty box does nothing (the design's rule: "Type your business name and press
 * Enter"), and a name is trimmed before it travels.
 */
export function StartBox({ id }: { id: string }) {
  const router = useRouter();
  const [biz, setBiz] = useState('');
  return (
    <div>
      <form
        action="/signup"
        method="get"
        onSubmit={e => { e.preventDefault(); router.push(startHref(biz)); }}
        className="mt-8 flex max-w-[560px] items-center gap-2.5 rounded-full bg-cream py-1.5 pl-5 pr-1.5"
      >
        <input
          id={id}
          type="text"
          name="business"
          value={biz}
          onChange={e => setBiz(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !biz.trim()) e.preventDefault(); }}
          maxLength={200}
          autoComplete="organization"
          placeholder="Your business name"
          aria-label="Your business name"
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base text-ink outline-none placeholder:text-ink-light"
        />
        <button type="submit" className="shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-rust px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-rust-600">
          Start &rarr;
        </button>
      </form>
      <p className="ml-5 mt-3 text-[13px] text-ink-light">Type your business name and press Enter.</p>
    </div>
  );
}

/** Use siteVIP, or keep what you have — one pill pair per area, and a line that counts them. */
export function SystemsChoice() {
  const [own, setOwn] = useState<Record<string, boolean>>(defaultOwnSystems);
  const pill = (on: boolean) =>
    `min-h-[36px] cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
      on ? 'bg-light-green text-white' : 'bg-cream text-ink-light hover:text-ink'
    }`;
  return (
    <>
      <div className="grid gap-2">
        {SITEVIP_SYSTEMS.map(s => {
          const mine = !!own[s.job];
          return (
            <div key={s.job} className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] bg-white px-4 py-3">
              <span className="text-[15px] font-semibold">{s.job}</span>
              <span className="flex gap-1.5" role="group" aria-label={s.job}>
                <button type="button" aria-pressed={!mine} className={pill(!mine)} onClick={() => setOwn(o => ({ ...o, [s.job]: false }))}>
                  siteVIP
                </button>
                <button type="button" aria-pressed={mine} className={pill(mine)} onClick={() => setOwn(o => ({ ...o, [s.job]: true }))}>
                  {s.own}
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[13.5px] leading-[21px] text-ink-light" aria-live="polite">{systemsLine(own)}</p>
    </>
  );
}
