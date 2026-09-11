'use client';

import { useState } from 'react';
import type { Pillar, Score } from '@/lib/scoring';
import type { ScorecardRow } from '@/lib/queries';
import { toneOf, labelOf, isExcluded, type Tone } from '@/lib/scorecard';
import { LIGHT_COLOUR } from '@/lib/today';
import { targetLabel } from '@/lib/targets';

/**
 * The four pillars, and the measures behind whichever one is open.
 *
 * One pillar at a time rather than four tables stacked: a card is read by asking one question at a
 * time, and the four questions are the product. Rows outside the score are muted and say why — a
 * business cannot fix a gap it cannot see, and it must never be shown as a failure.
 */

const TONE: Record<Tone, string> = {
  green: LIGHT_COLOUR.green,
  amber: LIGHT_COLOUR.amber,
  red: LIGHT_COLOUR.red,
  grey: LIGHT_COLOUR.pending,
};

export interface PillarPanel {
  pillar: Pillar;
  name: string;
  question: string;
  score: Score;
  line: string;
  tone: Tone;
  rows: ScorecardRow[];
}

/** Targets and results are compared down a column, so they are set in a monospaced face. */
const MONO = 'font-mono text-[13.5px] leading-5';

export function ScorecardTabs({ summaries, scored }: { summaries: PillarPanel[]; scored: boolean }) {
  const [open, setOpen] = useState<Pillar>(summaries[0]?.pillar ?? 'safety');
  const panel = summaries.find(s => s.pillar === open) ?? summaries[0];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaries.map(s => {
          const active = s.pillar === open;
          return (
            <button
              key={s.pillar}
              type="button"
              onClick={() => setOpen(s.pillar)}
              aria-pressed={active}
              className={`card text-left transition-colors ${active ? 'border-rust' : 'hover:border-rust/40'}`}
              style={{ borderTopColor: TONE[s.tone], borderTopWidth: 4 }}
            >
              <div className="label-caps">{s.name}</div>
              <div className="mt-2 font-serif text-3xl text-ink">
                {scored && s.score !== null ? `${Math.round(s.score * 100)}%` : '—'}
              </div>
              <p className="mt-1 text-xs text-ink-light">{s.question}</p>
              <p className="mt-2 text-xs text-ink-light">{s.line}</p>
            </button>
          );
        })}
      </div>

      {panel && (
        <section className="mt-6">
          <h2 className="font-serif text-xl text-ink">{panel.name}</h2>
          <p className="mt-1 text-sm text-ink-light">{panel.question}</p>

          {panel.rows.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="table-clean min-w-[720px]">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>Target</th>
                    <th>Result</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.rows.map(r => {
                    const tone = toneOf(r);
                    const muted = isExcluded(r);
                    return (
                      <tr key={r.criterionId} className={muted ? 'text-ink-light' : ''}>
                        <td>
                          <span className={muted ? '' : 'text-ink'}>{r.text}</span>
                          {r.note && <span className="mt-0.5 block text-xs text-ink-light">{r.note}</span>}
                        </td>
                        <td className={MONO}>{targetLabel(r.target, r.proposedTarget)}</td>
                        <td className={MONO}>{r.result ?? '—'}</td>
                        <td>
                          <span
                            className="pill"
                            style={{ background: `color-mix(in srgb, ${TONE[tone]} 14%, transparent)`, color: TONE[tone] }}
                          >
                            {labelOf(r)}
                          </span>
                        </td>
                        <td className="text-xs">{r.source ?? 'Nothing produces this yet'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-light">
              Nothing is set against {panel.name} for this role yet. Two measures per pillar is the starting
              point, and a pillar with none has no score rather than a bad one.
            </p>
          )}

          {panel.rows.some(isExcluded) && (
            <p className="mt-3 text-xs text-ink-light">
              The muted rows are outside the score — not tracked, still to mark, or being watched. They are
              excluded from both sides of the fraction rather than counted as zeros, and they are listed here
              rather than dropped.
            </p>
          )}
        </section>
      )}
    </>
  );
}
