'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  layout, rootsOf, detachedBranches, canMove, type ChartRole,
} from '@/lib/orgchart';
import { PILLAR_META } from '@/lib/pillars';
import { LIGHT_COLOUR, light } from '@/lib/today';
import { moveRole, movePerson, breakLink, vacateRole } from '@/app/org/actions';

/**
 * The chart itself.
 *
 * Cards are absolutely positioned from a computed layout; the connectors are three kinds of thin
 * rectangle. Nested flex columns produce unconnected lines and a recursion bug — the layout
 * function is deliberately the only thing that decides where anything goes.
 *
 * Two drag types, which are two different business decisions:
 *   the CARD    — the role moves, and everybody under it moves with it.
 *   the NAME    — the person moves, and the roles stay exactly as they were. If the destination is
 *                 filled, the two people swap.
 */

type DragKind = 'role' | 'person';
interface Drag { kind: DragKind; id: string; title: string }

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

export function OrgCanvas({ roles, rootId, canEdit }: { roles: ChartRole[]; rootId: string | null; canEdit: boolean }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [, start] = useTransition();

  const detached = detachedBranches(roles, rootId);
  const offIds = new Set(detached.flatMap(d => [d.role.id]));
  const onChart = rootId ? roles.filter(r => !isOff(r, roles, rootId)) : roles;
  const { cards, lines, width, height } = layout(rootsOf(onChart), onChart);

  function drop(targetId: string) {
    setOver(null);
    if (!drag) return;
    const d = drag;
    setDrag(null);

    if (d.kind === 'person') {
      if (d.id === targetId) return;
      const form = new FormData();
      form.set('fromRoleId', d.id);
      form.set('toRoleId', targetId);
      start(() => { void movePerson(form); });
      return;
    }

    const check = canMove(d.id, targetId, roles);
    if (!check.ok) {
      setProblem(check.reason);
      return;
    }
    setProblem(null);
    const form = new FormData();
    form.set('roleId', d.id);
    form.set('ontoId', targetId);
    start(() => { void moveRole(form); });
  }

  return (
    <>
      {problem && (
        <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-3 text-sm text-ink-light">
          {problem}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-cream p-4">
        <div className="relative mx-auto" style={{ width, height }}>
          {lines.map((l, i) => (
            <div
              key={i}
              className="absolute"
              style={{ left: l.x, top: l.y, width: l.w, height: l.h, background: '#ffe1d0' }}
            />
          ))}

          {cards.map(c => {
            const r = c.role;
            const isOver = over === r.id;
            const dragging = drag?.kind === 'role' && drag.id === r.id;
            return (
              <div
                key={r.id}
                draggable={canEdit}
                onDragStart={() => canEdit && setDrag({ kind: 'role', id: r.id, title: r.title })}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={e => { if (canEdit && drag) { e.preventDefault(); setOver(r.id); } }}
                onDragLeave={() => setOver(o => (o === r.id ? null : o))}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(r.id); }}
                className={`absolute rounded-lg border bg-surface p-2.5 shadow-sm transition-colors ${
                  isOver ? 'border-rust' : 'border-ink/10'
                } ${dragging ? 'opacity-40' : ''} ${canEdit ? 'cursor-grab' : ''}`}
                style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
              >
                <Link
                  href={`/scorecard/${r.id}`}
                  className="block truncate font-serif text-sm text-ink hover:text-rust"
                  title={r.title}
                >
                  {r.title}
                </Link>

                {r.person ? (
                  <span
                    draggable={canEdit}
                    onDragStart={e => {
                      if (!canEdit) return;
                      e.stopPropagation();
                      setDrag({ kind: 'person', id: r.id, title: r.person! });
                    }}
                    className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs ${
                      r.pencilled ? 'bg-ink/5 text-ink-light' : 'bg-rust-100 text-rust-800'
                    } ${canEdit ? 'cursor-grab' : ''}`}
                    title={r.pencilled ? `${r.person} — pencilled in, not invited` : r.person}
                  >
                    {r.person}
                  </span>
                ) : (
                  <span className="mt-1 inline-block text-xs text-ink-light">Vacant</span>
                )}

                {r.scored ? (
                  <span className="mt-2 flex gap-1">
                    {PILLARS.map(p => (
                      <span
                        key={p}
                        title={`${PILLAR_META[p].name} ${r.pillars?.[p] === null || !r.pillars ? 'no score' : `${Math.round(r.pillars[p]! * 100)}%`}`}
                        className="block rounded-full"
                        style={{
                          width: c.depth === 0 ? 10 : 8,
                          height: c.depth === 0 ? 10 : 8,
                          background: LIGHT_COLOUR[light(r.pillars?.[p] ?? null)],
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="mt-2 block text-[10px] text-ink-light">Checklist role</span>
                )}

                {canEdit && (
                  <span className="mt-1 flex gap-2 text-[10px] text-ink-light">
                    <button
                      type="button"
                      onClick={() => { const f = new FormData(); f.set('roleId', r.id); start(() => { void breakLink(f); }); }}
                      className="hover:text-rust"
                    >
                      Unlink
                    </button>
                    {r.person && (
                      <button
                        type="button"
                        onClick={() => { const f = new FormData(); f.set('roleId', r.id); start(() => { void vacateRole(f); }); }}
                        className="hover:text-rust"
                      >
                        Vacate
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <p className="mt-2 text-xs text-ink-light">
          Drag a card to move the role and everybody under it. Drag a name to move just the person — if the
          role you drop it on is filled, the two swap.
        </p>
      )}

      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Off the chart</h2>
          <span className="text-sm text-ink-light">
            {detached.length
              ? `${detached.reduce((s, d) => s + d.below + 1, 0)} roles out of every average`
              : 'Nothing detached'}
          </span>
        </div>
        {detached.length ? (
          <>
            <div
              className="mt-3 flex flex-wrap gap-2 rounded-lg border border-dashed border-rust-300 p-3"
              onDragOver={e => { if (canEdit && drag?.kind === 'role') e.preventDefault(); }}
            >
              {detached.map(d => (
                <span
                  key={d.role.id}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDrag({ kind: 'role', id: d.role.id, title: d.role.title })}
                  onDragEnd={() => setDrag(null)}
                  className={`rounded-full border border-rust-400 px-3 py-1.5 text-xs text-rust-800 ${canEdit ? 'cursor-grab' : ''}`}
                >
                  {d.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-light">
              These keep their KPIs and their people. They are out of every average and out of the Flow stage
              until they are dragged back onto a role — excluded, and counted, rather than quietly dropped.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-light">Every role is linked, so every role counts.</p>
        )}
      </section>
    </>
  );
}

/** Is this role outside the branch hanging off the chart's root? */
function isOff(role: ChartRole, all: ChartRole[], rootId: string): boolean {
  const seen = new Set<string>();
  let cursor: ChartRole | undefined = role;
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === rootId) return false;
    seen.add(cursor.id);
    cursor = cursor.parentId ? all.find(r => r.id === cursor!.parentId) : undefined;
  }
  return true;
}
