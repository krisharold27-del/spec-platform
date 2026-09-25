'use client';

import { useState } from 'react';
import { RECOMMENDS } from '@/lib/out-simple';

/**
 * The one moving part of the out-simple story: Claude's recommendation, answered.
 *
 * It is an example and is labelled as one — pressing Yes here changes nothing anywhere. Inside SPEC
 * the same card runs on the business's own numbers (components/recommends). Only rendered while the
 * `recommends` flag in lib/out-simple is on; otherwise the page shows "Arriving now" and no buttons.
 */
export function RecommendDemo() {
  const [answer, setAnswer] = useState<'ask' | 'yes' | 'later'>('ask');
  const ex = RECOMMENDS.example;
  return (
    <div className="rounded-lg bg-white p-[clamp(20px,3vw,28px)] shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-light">Example</p>
      <p className="mt-2 font-serif text-[clamp(20px,2.4vw,24px)] leading-snug">{ex.headline}</p>
      <ul className="mt-4 grid gap-2">
        {ex.facts.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-[14.5px] leading-[22px] text-ink-light">
            <span className="mt-[8px] h-2 w-2 flex-none rounded-full bg-light-green" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-ink/10 pt-4" aria-live="polite">
        {answer === 'ask' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-serif text-lg">{ex.ask}</span>
            <button type="button" onClick={() => setAnswer('yes')} className="min-h-[44px] rounded-full bg-rust px-6 text-[15px] font-semibold text-white hover:bg-rust-600">
              Yes
            </button>
            <button type="button" onClick={() => setAnswer('later')} className="min-h-[44px] rounded-full bg-cream px-6 text-[15px] font-semibold text-ink hover:bg-sage-100">
              Not yet
            </button>
          </div>
        )}
        {answer !== 'ask' && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 text-[15px] leading-[23px]">
              {answer === 'yes' && <span className="mr-1.5 font-semibold text-sage-800">✓</span>}
              {answer === 'yes' ? ex.done : ex.later}
            </p>
            <button type="button" onClick={() => setAnswer('ask')} className="min-h-[44px] text-sm text-rust-700 underline">
              Try it again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
