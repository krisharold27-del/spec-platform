'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  layout, rootsOf, detachedBranches, canMove, canRemove, collapsedAway, teamSize, type ChartRole,
} from '@/lib/orgchart';
import { PILLAR_META } from '@/lib/pillars';
import { LIGHT_COLOUR, light } from '@/lib/today';
import { AcePips, AceStar } from '@/components/ace-pips';
import {
  moveRole, movePerson, breakLink, vacateRole, addRole, removeRole, renameRole, renamePerson,
} from '@/app/org/actions';

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
 *
 * ── Everything else you can do to a card lives in one menu ────────────────────────────────────────
 *
 * Adding a report, renaming, unlinking, vacating and removing were either scattered across other
 * screens or missing entirely, and the chart carried two permanent text buttons on every card to
 * cover the two that existed. That is the design's shape restored: right-click a card and the menu
 * says what can be done to it, so the card itself stays a card.
 *
 * Two deliberate departures from the prototype, both of which would be wrong here:
 *
 *   There is a "⋯" button as well as the right-click. A menu reachable only by right-click is
 *   reachable only by people who already know it is there, and on a trackpad or a tablet often not
 *   at all. The prototype could assume a mouse; a product cannot.
 *
 *   There is no "Reset structure". In the prototype that restores the seed data. Here it would
 *   delete a real business's org chart with one press and no way back.
 */

type DragKind = 'role' | 'person';
interface Drag { kind: DragKind; id: string; title: string }
/** Where the menu is, and what it is about. A null `roleId` is the canvas itself. */
interface Menu { x: number; y: number; roleId: string | null }
interface Item { label: string; run: () => void; danger?: boolean }

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

export function OrgCanvas({ roles, rootId, canEdit }: { roles: ChartRole[]; rootId: string | null; canEdit: boolean }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const panelRef = useRef<HTMLDivElement>(null);

  const detached = detachedBranches(roles, rootId);
  const onChart = rootId ? roles.filter(r => !isOff(r, roles, rootId)) : roles;

  /*
    Collapsing hides the drawing, never the business. The roles below a collapsed card are still on
    the chart, still in every average and still counted everywhere else on this page — only `layout`
    is told to leave them out. See `collapsedAway`.
  */
  const hidden = collapsedAway(collapsed, onChart);
  const drawn = onChart.filter(r => !hidden.has(r.id));
  const { cards, lines, width, height } = layout(rootsOf(drawn), drawn);

  const shut = useCallback(() => setMenu(null), []);

  // Escape closes it, and so does a press anywhere else. Both, because a menu you cannot dismiss is
  // worse than no menu — and a menu that eats the next click is how a page starts feeling broken.
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', shut);
    window.addEventListener('resize', shut);
    // Pinned to the window, so anything that scrolls under it leaves it pointing at the wrong card.
    window.addEventListener('scroll', shut, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', shut);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', shut, true);
    };
  }, [menu, shut]);

  const post = (action: (f: FormData) => unknown, fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    start(() => { void action(f); });
  };

  /**
   * Open the menu where the press landed, in window coordinates, kept inside the window.
   *
   * The clamp is not tidiness. Right-click a card near the right-hand edge of a laptop screen and
   * an unclamped menu opens with half its words past the edge — including, on a five-item menu,
   * the one that removes the role.
   */
  function openMenu(e: React.MouseEvent, roleId: string | null) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const MENU_W = 210;
    const MENU_H = 8 + 5 * 38;
    setMenu({
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - MENU_W)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H)),
      roleId,
    });
    if (roleId) setSelectedId(roleId);
  }

  /** Select a card and put the cursor in the box that renames it — what "Rename" has to mean. */
  function editRole(roleId: string) {
    setSelectedId(roleId);
    shut();
    // After the panel has re-rendered for the newly selected role, not before.
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      panelRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    });
  }

  function itemsFor(roleId: string | null): Item[] {
    if (!roleId) {
      /*
        The canvas itself. One item, because the only thing that makes sense here is starting a role
        that does not report anywhere yet — it lands in "Off the chart", visible and counted, where
        it can be dragged into place.
      */
      return [{ label: 'Add a new role', run: () => { post(addRole, { title: 'New role' }); shut(); } }];
    }
    const role = roles.find(r => r.id === roleId);
    if (!role) return [];
    const out: Item[] = [
      { label: 'Add a direct report', run: () => { post(addRole, { title: 'New role', parentId: roleId }); shut(); } },
      { label: 'Rename role & person', run: () => editRole(roleId) },
    ];
    // Nothing to break when it already hangs from nothing.
    if (role.parentId) {
      out.push({ label: 'Break the link', run: () => { post(breakLink, { roleId }); shut(); } });
    }
    if (role.person) {
      out.push({ label: 'Make this role vacant', run: () => { post(vacateRole, { roleId }); shut(); } });
    }
    out.push({
      label: 'Remove role',
      danger: true,
      run: () => {
        /*
          The server refuses this too, and its refusal is the one that counts. This one exists so
          the answer arrives as a sentence on the chart instead of as an error page.
        */
        const check = canRemove(roleId, roles, rootId);
        shut();
        if (!check.ok) { setProblem(check.reason); return; }
        setProblem(null);
        if (selectedId === roleId) setSelectedId(null);
        post(removeRole, { roleId });
      },
    });
    return out;
  }

  function drop(targetId: string) {
    setOver(null);
    if (!drag) return;
    const d = drag;
    setDrag(null);

    if (d.kind === 'person') {
      if (d.id === targetId) return;
      post(movePerson, { fromRoleId: d.id, toRoleId: targetId });
      return;
    }

    const check = canMove(d.id, targetId, roles);
    if (!check.ok) {
      setProblem(check.reason);
      return;
    }
    setProblem(null);
    post(moveRole, { roleId: d.id, ontoId: targetId });
  }

  const selected = selectedId ? roles.find(r => r.id === selectedId) ?? null : null;
  const items = menu ? itemsFor(menu.roleId) : [];

  return (
    <>
      {problem && (
        <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-3 text-sm text-ink-light">
          {problem}
          <button type="button" onClick={() => setProblem(null)} className="ml-3 underline hover:text-rust">
            Close
          </button>
        </div>
      )}

      {/* Marked so the usability journey can say out loud that the chart is exempt from the 40px
          thumb rule rather than quietly failing on it every run. This is a drag-and-drop surface
          sized by the chart, not by a hand; the phone has its own field view. */}
      {/*
        The canvas menu hangs off the OUTER surface, including the padding around the tree.

        On the inner tree it was unreachable in practice: the tree is sized to exactly fit the cards
        and centred, so almost every pixel of it IS a card, and right-clicking what looks like empty
        space next to the chart opened the menu for whichever card happened to be under the cursor.
        The quiet margin round the outside is the part a person reads as "not a card".
      */}
      <div
        data-org-canvas
        className="overflow-x-auto rounded-lg bg-cream p-4"
        onContextMenu={e => openMenu(e, null)}
      >
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
            const team = teamSize(r.id, onChart);
            const shut_ = collapsed.has(r.id);
            return (
              <div
                key={r.id}
                draggable={canEdit}
                onDragStart={() => canEdit && setDrag({ kind: 'role', id: r.id, title: r.title })}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={e => { if (canEdit && drag) { e.preventDefault(); setOver(r.id); } }}
                onDragLeave={() => setOver(o => (o === r.id ? null : o))}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(r.id); }}
                onClick={() => setSelectedId(r.id)}
                onContextMenu={e => openMenu(e, r.id)}
                /*
                  A leader with a team folds away on a double-click, which is the only gesture on
                  this card that costs nothing and changes nothing. A card with nobody under it has
                  nothing to fold, so it does nothing rather than doing something surprising.
                */
                onDoubleClick={() => {
                  if (!team) return;
                  setCollapsed(s => {
                    const next = new Set(s);
                    if (!next.delete(r.id)) next.add(r.id);
                    return next;
                  });
                }}
                title={team ? `Team of ${team} — double-click to ${shut_ ? 'open' : 'fold away'}` : undefined}
                className={`absolute rounded-lg border bg-surface p-2.5 shadow-sm transition-colors ${
                  isOver ? 'border-rust' : selectedId === r.id ? 'border-rust-400' : 'border-ink/10'
                } ${dragging ? 'opacity-40' : ''} ${canEdit ? 'cursor-grab' : ''}`}
                style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
              >
                {/*
                  The standing, hanging off the corner where it costs no card space at all — the
                  design's own placement, and the thing the pips were moved off the title to protect.
                */}
                {r.ace?.holdingAce && <AceStar ace={r.ace} />}

                {/*
                  Two lines rather than one, clamped, with the card height fixed by the layout.

                  Truncating to a single line turned "Safety & Compliance Lead" into "Safety & Comp…"
                  — a role nobody can identify on a chart whose whole job is showing who does what.
                  The clamp is what lets the height stay a structural constant: the title can never
                  push the card taller than the row spacing allows.
                */}
                <Link
                  href={`/scorecard/${r.id}`}
                  className={`block font-serif text-sm leading-tight text-ink hover:text-rust [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] [overflow:hidden] ${r.ace?.holdingAce ? 'pr-7' : ''}`}
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
                  /*
                    Two readings on one row: this month on the left, the Ace run on the right.

                    The run started in the top corner and pushed the titles into truncating — "Head
                    of Commercial" became "Head of Commer…", which is a bad trade for three circles.
                    Here it costs no width that was being used, and the card reads as one line of
                    state: where they are this month, and where they are in their three.
                  */
                  <span className="mt-2 flex items-center gap-1">
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
                    {r.ace && (
                      <span className="ml-auto flex items-center">
                        <AcePips ace={r.ace} big={c.depth === 0} />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="mt-2 block text-[10px] text-ink-light">Checklist role</span>
                )}

                <span className="mt-1 flex items-center gap-2 text-[10px] text-ink-light">
                  {team > 0 && (
                    <span title={`Team of ${team}`}>
                      {shut_ ? `+${team} folded away` : `Team of ${team}`}
                    </span>
                  )}
                  {canEdit && (
                    /*
                      The same menu as the right-click, on a key anybody can find. Kept to one glyph
                      because the card is a card: the two permanent text buttons that used to sit
                      here said "Unlink" and "Vacate" on every role in the business, whether or not
                      either made any sense for it.
                    */
                    <button
                      type="button"
                      aria-label={`What can be done with ${r.title}`}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => openMenu(e, r.id)}
                      className="ml-auto rounded px-1 leading-none hover:text-rust"
                    >
                      ⋯
                    </button>
                  )}
                </span>
              </div>
            );
          })}

        </div>
      </div>

      {/*
        Pinned to the window, not to the canvas.

        Drawn inside the canvas it was clipped: the chart scrolls sideways, and a box that scrolls
        sideways has an edge. A menu that opens half off the edge of its own container, or opens
        below a chip in the tray and simply is not there, is worse than one that never opened.
      */}
      {menu && items.length > 0 && (
        <div
          role="menu"
          onPointerDown={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
          className="fixed z-30 min-w-[200px] rounded-xl border border-ink/10 bg-surface p-1.5 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {items.map(i => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              onClick={i.run}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-cream ${
                i.danger ? 'text-rust-800' : 'text-ink'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <p className="mt-2 text-xs text-ink-light">
          Drag a card to move the role and everybody under it. Drag a name to move just the person — if the
          role you drop it on is filled, the two swap. Right-click a card, or press ⋯, for everything else.
        </p>
      )}

      {/*
        The panel the "Rename" menu item opens into.

        Two ordinary forms with a Save on each, rather than the prototype's save-as-you-type. A chart
        is a shared document: a keystroke that reaches the database before anybody has finished
        thinking is how a role gets renamed "Operations Manage" because a colleague walked past.
      */}
      {canEdit && selected && (
        <section ref={panelRef} className="card mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">{selected.title}</h2>
            <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-ink-light underline hover:text-rust">
              Done
            </button>
          </div>

          <form action={renameRole} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="roleId" value={selected.id} />
            <label className="sr-only" htmlFor="org-title">Role title</label>
            <input
              id="org-title"
              name="title"
              defaultValue={selected.title}
              key={`t-${selected.id}-${selected.title}`}
              className="w-full rounded border border-ink/15 px-3 py-2 font-serif text-base"
              placeholder="Role title"
            />
            <button className="btn-secondary">Save the role name</button>
          </form>

          <form action={renamePerson} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="roleId" value={selected.id} />
            <label className="sr-only" htmlFor="org-person">Person in the role</label>
            <input
              id="org-person"
              name="person"
              defaultValue={selected.person ?? ''}
              key={`p-${selected.id}-${selected.person ?? ''}`}
              className="w-full rounded border border-ink/15 px-3 py-2 text-sm"
              placeholder="Vacant — type a name to pencil somebody in"
            />
            <button className="btn-secondary">Save the name</button>
          </form>

          <p className="mt-2 text-xs text-ink-light">
            A name typed here is pencilled in: free, and nobody is emailed. Invitations are sent from{' '}
            <Link href="/people" className="underline hover:text-rust">People</Link>. Clearing the box changes
            nothing — use <span className="italic">Make this role vacant</span> to empty a role.
          </p>
        </section>
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
                  onClick={() => setSelectedId(d.role.id)}
                  onContextMenu={e => openMenu(e, d.role.id)}
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
