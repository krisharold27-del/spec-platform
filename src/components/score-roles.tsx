'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { saveScorecard } from '@/app/scorecard/[roleId]/actions';
import { STATUSES, STATUS_ORDER, type Status } from '@/lib/status';
import { ROW_STATE_LABEL, type RowState } from '@/lib/month';
import { LIGHT_COLOUR } from '@/lib/today';
import { PILLAR_META } from '@/lib/pillars';
import type { Pillar, RoleScore } from '@/lib/scoring';

/**
 * Scoring one role at a time.
 *
 * Role tabs rather than one long page: a month is closed by going through people, and a manager
 * marking their own reports should not have to scroll past everybody else's.
 *
 * A fed row is read-only. Its number came from a connected system, and letting somebody type over
 * it would break the one thing that makes a fed number worth more than a typed one — that nobody
 * can quietly change it.
 */

const TONE = {
  green: LIGHT_COLOUR.green, amber: LIGHT_COLOUR.amber, red: LIGHT_COLOUR.red, grey: LIGHT_COLOUR.pending,
} as const;

export interface ScoreRow {
  criterionId: string;
  pillar: Pillar;
  text: string;
  target: string | null;
  result: string | null;
  note: string | null;
  status: string | null;
  state: RowState;
  readOnly: boolean;
  sourceLine: string;
  tone: keyof typeof TONE;
}

export interface ScoreRole {
  roleId: string;
  title: string;
  holder: string | null;
  canEdit: boolean;
  score: RoleScore;
  rows: ScoreRow[];
}

export function ScoreRoles({ roles, periodId, locked, liveSources }: {
  roles: ScoreRole[]; periodId: string; locked: boolean; liveSources: string[];
}) {
  const [open, setOpen] = useState(roles[0]?.roleId ?? '');
  const role = roles.find(r => r.roleId === open) ?? roles[0];

  if (!roles.length) {
    return (
      <p className="text-sm text-ink-light">
        No role in your part of the chart carries a scorecard yet. Two measures per pillar is the starting point.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {roles.map(r => {
          const active = r.roleId === role.roleId;
          const marked = r.rows.filter(x => x.status || x.state !== 'needs_confirming').length;
          const complete = r.rows.length > 0 && marked === r.rows.length;
          return (
            <button
              key={r.roleId}
              type="button"
              onClick={() => setOpen(r.roleId)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${active ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
            >
              {r.title}
              <span className="ml-2 text-xs opacity-70">{complete ? '✓' : `${marked}/${r.rows.length}`}</span>
            </button>
          );
        })}
      </div>

      {role && (
        <form action={saveScorecard} className="card mt-4">
          <input type="hidden" name="roleId" value={role.roleId} />
          <input type="hidden" name="periodId" value={periodId} />

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-serif text-lg text-ink">{role.title}</h3>
              <p className="text-xs text-ink-light">{role.holder ?? 'Nobody in this role'}</p>
            </div>
            <span className="text-sm text-ink-light">
              {liveSources.length
                ? `${liveSources.length} ${liveSources.length === 1 ? 'system feeds' : 'systems feed'} this business`
                : 'Every number here is entered by hand'}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {role.rows.map(r => (
              <div key={r.criterionId} className="card-inset" style={{ borderLeft: `4px solid ${TONE[r.tone]}` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{r.text}</span>
                  <span className="flex items-center gap-2">
                    <span className="label-caps">{PILLAR_META[r.pillar].name}</span>
                    <span
                      className="pill"
                      style={{ background: `color-mix(in srgb, ${TONE[r.tone]} 14%, transparent)`, color: TONE[r.tone] }}
                    >
                      {ROW_STATE_LABEL[r.state]}
                    </span>
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
                  <label className="text-xs text-ink-light">
                    Target
                    <div className="input mt-1 font-mono text-[13.5px]">{r.target ?? '—'}</div>
                  </label>

                  <label className="text-xs text-ink-light">
                    Result
                    {r.readOnly ? (
                      <div className="input mt-1 font-mono text-[13.5px]">{r.result ?? '—'}</div>
                    ) : (
                      <input
                        className="input mt-1 font-mono text-[13.5px]"
                        name={`result:${r.criterionId}`}
                        defaultValue={r.result ?? ''}
                        disabled={!role.canEdit}
                        placeholder="What actually happened"
                      />
                    )}
                  </label>

                  <label className="text-xs text-ink-light">
                    Status
                    {r.readOnly ? (
                      <div className="input mt-1">{r.status ? STATUSES[r.status as Status]?.label : 'From the system'}</div>
                    ) : (
                      <select
                        className="input mt-1"
                        name={`status:${r.criterionId}`}
                        defaultValue={r.status ?? ''}
                        disabled={!role.canEdit}
                      >
                        <option value="">Not marked</option>
                        {STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{STATUSES[s].label}</option>
                        ))}
                      </select>
                    )}
                  </label>
                </div>

                {!r.readOnly && (
                  <input
                    className="input mt-2"
                    name={`note:${r.criterionId}`}
                    defaultValue={r.note ?? ''}
                    disabled={!role.canEdit}
                    placeholder="What is behind this number — required for a miss"
                  />
                )}

                <div className="mt-2 text-xs text-ink-light">
                  {r.sourceLine}
                  {r.readOnly && ' · read-only, because a system produced it'}
                </div>
                {r.status === 'not_tracked' && (
                  <div className="mt-1 text-xs text-ink-light">
                    Excluded from the score on both sides. A gap in the business, reported as a gap.
                  </div>
                )}
              </div>
            ))}
            {role.rows.length === 0 && (
              <p className="text-sm text-ink-light">Nothing is set against this role yet.</p>
            )}
          </div>

          {locked ? (
            <p className="mt-4 text-xs text-ink-light">
              This month is locked. Nothing recalculates history.
            </p>
          ) : role.canEdit ? (
            <SubmitButton className="btn-primary mt-4 justify-self-start" pending="Saving…">
              Save {role.title}
            </SubmitButton>
          ) : (
            <p className="mt-4 text-xs text-ink-light">
              You can see this card but not mark it — scoring belongs to the role above it.
            </p>
          )}
        </form>
      )}
    </>
  );
}
