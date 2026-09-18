'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  layout, rootsOf, detachedBranches, canMove, canRemove, collapsedAway, teamSize, boardVerdict,
  type ChartRole, type Rollup,
} from '@/lib/orgchart';
import { PILLAR_META } from '@/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK, light } from '@/lib/today';
import { AcePips, AceStar } from '@/components/ace-pips';
import { ChartKey } from '@/components/chart-key';
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

export function OrgCanvas({ roles, rootId, canEdit, averages }: {
  roles: ChartRole[];
  rootId: string | null;
  canEdit: boolean;
  averages: Rollup;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  /*
    The chart opens with the top role already chosen.

    The Role scorecard panel beside it started empty, so the first thing a new customer saw in the
    place the design puts a filled scorecard was a sentence telling them to press something. The top
    of the chart is the one role that is always there.
  */
  const [selectedId, setSelectedId] = useState<string | null>(rootId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /*
    What is CURRENTLY TYPED in the rename panel, held in React rather than left in the DOM.

    These two boxes were `defaultValue` and uncontrolled, which looks simpler and is wrong here. This
    chart re-renders whenever anything on the page finishes a server action, and an uncontrolled
    input loses whatever is in it the moment React replaces the element. It failed about one time in
    four: you type a name, press Save, and the form posts an EMPTY name — so `renamePerson` returns
    without doing anything and the chart comes back exactly as it was, with no error and nothing to
    tell you what happened.

    Found by measuring rather than by reading: a browser check reported the box empty at the instant
    of submit while the same run had typed into it a moment earlier.

    SPEC already treats losing what somebody typed as a cardinal fault — it is why sign-up carries
    its four boxes back on every bounce. The same rule applies to a box on a chart.
  */
  const [draft, setDraft] = useState<{ id: string; title: string; person: string } | null>(null);
  /*
    Which part of the chart is being looked at.

    Forty roles do not fit on a screen and never will, so the design puts a selector on the canvas:
    pick a role and the chart shows that role and everybody under it. Null is the whole company.
    Nothing is hidden from the business by this — the averages, the counts and the off-chart tray
    are all still the whole company — it only changes what is DRAWN.
  */
  const [viewFrom, setViewFrom] = useState<string | null>(null);
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
  // A role the selector points at that has since been removed falls back to the whole company
  // rather than drawing an empty canvas.
  const from = viewFrom && onChart.some(r => r.id === viewFrom) ? viewFrom : null;
  const inView = from ? onChart.filter(r => under(r, onChart, from)) : onChart;
  const drawn = inView.filter(r => !hidden.has(r.id));
  const { cards, lines, width, height } = layout(rootsOf(drawn), drawn);

  /*
    The line the design prints beside the key: how big the chart is, how much of it is off, and how
    much of it is green. Three numbers that answer "where are we" without opening anything.
  */
  const allGreen = onChart.filter(
    r => r.scored && r.pillars && PILLARS.every(p => (r.pillars![p] ?? 0) >= 0.8),
  ).length;
  const offCount = detached.reduce((s, d) => s + d.below + 1, 0);
  const summary = `${onChart.length} role${onChart.length === 1 ? '' : 's'} · ${offCount} off the chart · ${allGreen} all green`;

  const verdict = boardVerdict(averages);

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

  /*
    A fresh draft when a DIFFERENT role is selected, and never otherwise — re-seeding on every render
    would put the stored value back over the top of whatever is being typed, which is the same bug
    wearing a different hat.
  */
  useEffect(() => {
    const role = selectedId ? roles.find(r => r.id === selectedId) : null;
    if (!role) { setDraft(null); return; }
    setDraft(d => (d?.id === role.id ? d : { id: role.id, title: role.title, person: role.person ?? '' }));
  }, [selectedId, roles]);

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
    const MENU_W = 230;
    // Six items now that KPIs sit at the top. Under-counting here puts the last item — which is the
    // one that removes a role — off the bottom of a laptop screen.
    const MENU_H = 8 + 6 * 38;
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
    /*
      After the panel has re-rendered for the newly selected role, not before — and NEVER over the
      top of somebody who has already started typing.

      Without that second condition the panel steals focus a frame after it opens. Press "Rename role
      & person", click straight into the name box because that is the box you wanted, and your first
      keystrokes land in the TITLE instead: the role ends up called "Yard LeadR. Nakamura" and the
      name you typed is nowhere. Caught by a browser check that printed both boxes at the moment of
      submit, after two wrong guesses at what was happening.
    */
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const active = document.activeElement;
      if (active && panel.contains(active)) return;    // they got there first
      panel.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
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
      /*
        FIRST, and deliberately above everything else.

        Kris, 18 September: *"org chart and entering kpi's is everything to this system - why is it
        so hard"*. He was right that it was hard. Every route into the KPI screen in the product was
        an EMPTY STATE — a "Set the KPIs" link that appeared while a role had none and vanished the
        moment it had them — and the org chart, which is where the work actually happens, had no
        route at all. So the first time was findable and every time after that meant typing the
        address.

        This is the path his brief describes: you are looking at the chart, you open the role, you
        set its numbers. It carries the role id, which the scorecard's version did not — pressing
        that one opened whichever role the screen happened to list first.
      */
      { label: 'Set this role\u2019s KPIs', run: () => { shut(); window.location.href = `/setup/kpis?role=${roleId}`; } },
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
      {/*
        ── The chart as one panel, which is how the design draws it ──────────────────────────────

        It was a bare strip of cream on the page background with the key floating above it and the
        off-chart tray in a separate card two scrolls further down. The design puts the whole
        instrument in a single raised surface: what you are looking at, what the colours mean, the
        tree, what has fallen off it, and how to work it — in that order, in one place. A diagram
        with its own frame reads as a thing; the same diagram loose on a page reads as decoration.
      */}
      <section
        data-org-canvas
        className="rounded-2xl bg-surface p-5 shadow-sm sm:p-8"
        onContextMenu={e => openMenu(e, null)}
      >
        {/*
          What part of the business is on screen, and how to change it.

          Forty roles on one canvas is a picture nobody can read. The selector narrows the drawing
          to one branch — and the sentence beside it says so plainly, because a chart quietly
          showing you two thirds of a company is a chart that lies by omission.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <span className="text-[13.5px] text-ink-light">
            Viewing:{' '}
            <strong className="font-medium text-ink">
              {from
                ? `${roles.find(r => r.id === from)?.title ?? 'a role'} and below`
                : 'the whole company'}
            </strong>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="org-view-from">View from role</label>
            <select
              id="org-view-from"
              value={from ?? ''}
              onChange={e => setViewFrom(e.target.value || null)}
              className="min-h-[36px] rounded-md border border-ink/15 bg-cream px-2.5 py-1 text-[13px] text-ink"
            >
              <option value="">Whole company chart</option>
              {onChart.map(r => (
                <option key={r.id} value={r.id}>
                  {r.title}{r.person ? ` — ${r.person}` : ' — vacant'}
                </option>
              ))}
            </select>
            {from && (
              <button
                type="button"
                onClick={() => setViewFrom(null)}
                className="whitespace-nowrap text-sm text-rust-700 hover:underline"
              >
                See whole company chart
              </button>
            )}
          </div>
        </div>

        {/*
          The key on one line, inside the frame, with the three counts on the end of it — the way
          the design has it. Above the tree, so nobody meets a wall of amber before being told what
          amber means.
        */}
        <ChartKey summary={summary} />

        {/* pt-4 so the count badge, which hangs off the top-left corner of a card, is not clipped
            by the frame the chart now sits in. */}
        <div className="mt-4 overflow-x-auto pt-4">
        <div className="relative mx-auto" style={{ width, height }}>
          {/*
            The lines carry the reading, and they are rails rather than hairlines.

            They were 2px of one flat colour — plumbing. The design draws them 5px and rounded,
            coloured by what they are reporting, so a branch in trouble is visible from the shape of
            the chart instead of by reading eight cards. `LIGHT_COLOUR` because these are looked at
            rather than read; a line with nothing scored behind it stays the quiet sand it was.
          */}
          {lines.map((l, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: l.x, top: l.y, width: l.w, height: l.h,
                background: l.score === null ? '#e7d6bb' : LIGHT_COLOUR[light(l.score)],
              }}
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
                /* A stable hook for the browser checks. They used to find a card by the link inside
                   it; the title stopped being a link when a single press started opening the panel,
                   which would have left those checks matching person pills instead of cards. */
                data-role-card={r.id}
                draggable={canEdit}
                onDragStart={() => canEdit && setDrag({ kind: 'role', id: r.id, title: r.title })}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={e => { if (canEdit && drag) { e.preventDefault(); setOver(r.id); } }}
                onDragLeave={() => setOver(o => (o === r.id ? null : o))}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(r.id); }}
                onClick={() => setSelectedId(r.id)}
                onContextMenu={e => openMenu(e, r.id)}
                /*
                  Double-click opens the role's scorecard, which is what the design assigns it.

                  It used to fold the team away, and the title was a link so that a SINGLE click left
                  the page altogether — which meant the panel that is supposed to fill when you press
                  a role could never fill, because pressing a role navigated. Folding moved onto the
                  count badge, where it is both visible and one press.
                */
                onDoubleClick={() => { window.location.href = `/scorecard/${r.id}`; }}
                title={`${r.title} — click to open its scorecard here, double-click for the full one`}
                /*
                  The design's card: rounded, a rust edge, and everything centred.

                  It was a square-ish panel with a hairline grey border and left-aligned text, which
                  is a table cell. The design draws a card — 18px radius, a warm edge that is part of
                  the chart rather than a divider, and the title centred over the person and the
                  four letters, so a row of them reads as a row.
                */
                className={`absolute flex flex-col items-center justify-center rounded-[18px] border-2 bg-surface px-3 py-2.5 text-center shadow-sm transition-colors ${
                  isOver ? 'border-rust' : selectedId === r.id ? 'border-rust' : 'border-rust-300'
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
                <span
                  /*
                    ── leading-[1.35], not leading-tight ────────────────────────────────────────

                    THIS is what Kris photographed on JBI: "Cobram Supervisor" and "Wangaratta
                    Supervisor" with the bottoms of the letters shaved off. Not the card — the
                    card had room to spare. A two-line clamp draws a box exactly two line-heights
                    tall and hides everything outside it, so at `leading-tight` (1.25) the box is
                    shorter than the serif's descenders and the tails of p, g and y are cut off by
                    the clamp itself. Every word present, every box the right size, and the text
                    sliced through the middle of the letters.

                    1.35 clears the descenders, and `pb-[3px]` puts three pixels of slack below the
                    last line on top of that. Belt and braces on purpose: line-height is rounded to
                    whole pixels differently at different zoom levels and on different platforms, so
                    a ratio that is comfortable at 100% on this machine can still shave a tail at
                    110% on somebody else's. Clipping through the middle of a person's role is not a
                    thing to leave to rounding.

                    `scripts/org-journey.mjs` asserts the ratio AND that the box is at least two full
                    lines tall, so a future tightening of the type cannot quietly start cutting names
                    in half again.
                  */
                  className={`block w-full pb-[3px] font-serif text-sm leading-[1.35] text-ink [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] [overflow:hidden] ${r.ace?.holdingAce ? 'px-5' : ''}`}
                  title={r.title}
                >
                  {r.title}
                </span>

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

                {r.level !== 'staff' ? (
                  /*
                    Four letters on EVERY role that carries a scorecard, whether or not its KPIs are
                    set yet.

                    This used to be gated on `scored`, which is "not a staff role AND has at least
                    one criterion". So on the first morning — every role created, none of them set
                    up — the whole chart read "Checklist role", which is not true and is the one
                    thing on the card that would make a leader think SPEC had decided their managers
                    do not get measured. A role with no KPIs shows four grey letters, which is what
                    the key already promises: *not set — no KPIs yet, so nothing to score*.

                    Two readings on one row: this month on the left, the Ace run on the right.

                    The run started in the top corner and pushed the titles into truncating — "Head
                    of Commercial" became "Head of Commer…", which is a bad trade for three circles.
                    Here it costs no width that was being used, and the card reads as one line of
                    state: where they are this month, and where they are in their three.

                    ── S P E C, as the design draws them ──────────────────────────────────────

                    Four solid tiles with the letter in them.

                    They were four grey dots, which say nothing and read as punctuation. The letter
                    is the identity and the fill is how that pillar is GOING — the rule in
                    lib/pillars, kept exactly: the letter never changes colour to mean a pillar.

                    Filled with LIGHT_INK rather than LIGHT_COLOUR because these carry white text.
                    That set exists precisely because three of the four signal colours cannot be
                    read against — see SCORE_INK — and tests/colour.test.ts holds the ratio.
                  */
                  <span className="mt-2 flex items-center justify-center gap-1.5">
                    {PILLARS.map(p => {
                      const value = r.pillars?.[p] ?? null;
                      const size = c.depth === 0 ? 22 : 19;
                      return (
                        <span
                          key={p}
                          title={`${PILLAR_META[p].name} ${value === null ? 'no score' : `${Math.round(value * 100)}%`}`}
                          className="grid shrink-0 place-content-center rounded-md font-serif text-cream"
                          style={{
                            width: size, height: size, fontSize: size * 0.6, lineHeight: 1,
                            background: LIGHT_INK[light(value)],
                          }}
                        >
                          {PILLAR_META[p].letter}
                        </span>
                      );
                    })}
                    {/*
                      The Ace run, out of the row rather than on the end of it.

                      It sat beside the four letters with `ml-auto`, which pushed them off centre —
                      and the four letters centred under the title is the whole look of the design's
                      card. Pinned to the bottom corner instead, where it costs no width and the
                      letters stay where the eye expects them.
                    */}
                    {r.ace && (
                      <span className="absolute bottom-1.5 right-2 flex items-center">
                        <AcePips ace={r.ace} big={false} />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="mt-2 block text-[10px] text-ink-light">Checklist role</span>
                )}

                {/*
                  The team count as the design has it: a small rust disc hanging off the top-left
                  corner, costing the card no space. It was a line of text inside the card reading
                  "Team of 3", which is a sentence where the design has a number.
                */}
                {team > 0 && (
                  <button
                    type="button"
                    /* A hook that survives restyling. The browser check used to find a leader by the
                       words "Team of", which this badge replaced — so a visual change silently broke
                       a behavioural check. The count is what it is looking for; let it ask for that. */
                    data-team={team}
                    /* The badge is now the fold, because a gesture nobody can see is a gesture
                       nobody uses. Press it and the branch closes; press it again and it opens. */
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      setCollapsed(s => {
                        const next = new Set(s);
                        if (!next.delete(r.id)) next.add(r.id);
                        return next;
                      });
                    }}
                    title={shut_ ? `${team} folded away — press to open` : `Team of ${team} — press to fold away`}
                    className="absolute -left-2.5 -top-2.5 z-[2] grid h-[22px] min-w-[22px] place-content-center rounded-full bg-rust-700 px-1.5 text-[11px] font-bold text-cream shadow-sm"
                  >
                    {shut_ ? `+${team}` : team}
                  </button>
                )}
                {canEdit && (
                  /*
                    The same menu as the right-click, on a key anybody can find. Kept to one glyph
                    because the card is a card: the two permanent text buttons that used to sit here
                    said "Unlink" and "Vacate" on every role in the business, whether or not either
                    made any sense for it.

                    Pinned to the corner rather than taking a row of its own. In the flow it cost
                    every card eighteen pixels of height that a two-line role title needs — which is
                    how "Wangaratta Supervisor" came to be cut off along the bottom edge on JBI.
                  */
                  <button
                    type="button"
                    aria-label={`What can be done with ${r.title}`}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => openMenu(e, r.id)}
                    /* Out from under the Ace star, which hangs off the same corner. */
                    className={`absolute top-1 rounded px-1 text-[13px] leading-none text-ink-light hover:text-rust ${
                      r.ace?.holdingAce ? 'right-8' : 'right-1.5'
                    }`}
                  >
                    ⋯
                  </button>
                )}
              </div>
            );
          })}

        </div>
        </div>

        {/*
          What has fallen off the chart, inside the frame rather than in a card of its own.

          The design keeps it here, under a dashed rule, because a detached branch is a fact ABOUT
          this chart — and because the only thing to do with one is drag it back onto the chart that
          is directly above it. In its own card two scrolls away it was a list nobody connected to
          the picture.
        */}
        {detached.length > 0 && (
          <div className="mt-9 border-t-2 border-dashed border-rust-300 pt-6">
            <p className="label-caps mb-3.5 text-[#a63b26]">
              Off the chart — drag onto the role it reports to. Anything below a detached role comes back
              with it, and none of it counts towards the board figures.
            </p>
            <div
              className="flex flex-wrap gap-3"
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
                  className={`grid gap-0.5 rounded-xl border border-rust-400 bg-cream px-3.5 py-2.5 ${canEdit ? 'cursor-grab' : ''}`}
                >
                  <span className="font-serif text-[15px] text-ink">{d.role.title}</span>
                  <span className="text-[12.5px] text-ink-light">
                    {d.role.person ?? 'Vacant'}
                    {d.below > 0 && ` · ${d.below} below`}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/*
          How the chart is worked, once, at the foot of the frame — the design's own sentence. It
          used to be a note under the canvas that only appeared for an editor and said something
          different; this says what every gesture does, in the order somebody would try them.
        */}
        <p className="mt-6 text-[13px] leading-[22px] text-ink-light">
          {canEdit
            ? 'Press a card to open it in the scorecard beside the chart, or double-click for the full one. Drag a card to re-report it. Drag the name pill off one card onto another to move the person into that role — if it is filled, the two swap. Right-click a role, or press ⋯, to set its KPIs, break its link or make it vacant. Press the number on a leader to fold their team away. '
            : 'Press a card to open it beside the chart, or double-click for the full scorecard. Press the number on a leader to fold their team away. '}
          Lights read left to right: Safety, People, Earnings, Compliance.
        </p>
      </section>

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

      {/*
        ── The two panels the chart hangs off ────────────────────────────────────────────────────

        The design's shape, and the reason the built page felt like a diagram with nothing to do:
        the role you pressed on the left, and what the whole thing adds up to on the right. The
        product had neither — it had a rename form that only appeared from a menu item, and the
        averages appeared nowhere on this screen at all, even though the chart is where they are
        made.
      */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section ref={panelRef} className="rounded-2xl bg-sage-100 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="label-caps text-sage-700">Role scorecard</span>
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                /* A floor, not a size — the usability journey holds every pressable thing to 24px,
                   and this was 20. */
                className="inline-flex min-h-[24px] items-center text-sm text-ink-light underline hover:text-rust"
              >
                Done
              </button>
            )}
          </div>

          {!selected ? (
            <p className="mt-4 text-sm leading-6 text-ink-light">
              Press a role on the chart and its scorecard opens here — what it is measured on, how each
              pillar is going this month, and the way to change either.
            </p>
          ) : (
            <>
              {/*
                Renaming, in the place the design puts it rather than behind a menu item.

                Two ordinary forms with a Save on each, not the prototype's save-as-you-type. A chart
                is a shared document: a keystroke that reaches the database before anybody has
                finished thinking is how a role gets renamed "Operations Manage" because a colleague
                walked past.
              */}
              {canEdit ? (
                <>
                  <form action={renameRole} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="roleId" value={selected.id} />
                    <label className="sr-only" htmlFor="org-title">Role title</label>
                    <input
                      id="org-title"
                      name="title"
                      value={draft?.id === selected.id ? draft.title : selected.title}
                      onChange={e => setDraft(d => (d ? { ...d, title: e.target.value } : d))}
                      className="min-h-[44px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 font-serif text-[19px] text-ink"
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
                      value={draft?.id === selected.id ? draft.person : selected.person ?? ''}
                      onChange={e => setDraft(d => (d ? { ...d, person: e.target.value } : d))}
                      className="min-h-[40px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 text-sm text-ink"
                      placeholder="Vacant — type a name to pencil somebody in"
                    />
                    <button className="btn-secondary">Save the name</button>
                  </form>
                </>
              ) : (
                <div className="mt-4">
                  <p className="font-serif text-[19px] text-ink">{selected.title}</p>
                  <p className="mt-1 text-sm text-ink-light">{selected.person ?? 'Vacant'}</p>
                </div>
              )}

              {/*
                The four pillars as the design draws them: a card each, the percentage in serif, and
                the measures NAMED underneath.

                The prototype puts a slider here and drags the score around. That is the one thing
                from this design that must not be built: a score in SPEC is what the KPI results add
                up to, and a control that sets it directly would make every number on the board a
                matter of opinion. The button goes to where the numbers are actually decided.
              */}
              <div className="mt-6 grid gap-3">
                {PILLARS.map(p => {
                  const value = selected.pillars?.[p] ?? null;
                  const named = selected.kpis?.[p] ?? [];
                  return (
                    <div key={p} className="rounded-2xl bg-cream p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="label-caps flex items-center gap-2.5 text-ink-light">
                          <span
                            aria-hidden
                            className="block h-3 w-3 shrink-0 rounded-full"
                            style={{ background: LIGHT_COLOUR[light(value)] }}
                          />
                          {PILLAR_META[p].name}
                        </span>
                        <span className="font-serif text-[22px] leading-none text-ink">
                          {value === null ? '0%' : `${Math.round(value * 100)}%`}
                        </span>
                      </div>
                      <div className="mt-3.5 grid gap-1.5">
                        {named.length ? (
                          named.map(n => (
                            <span key={n} className="text-[13.5px] leading-5 text-ink/80">{n}</span>
                          ))
                        ) : (
                          <span className="text-[13.5px] leading-5 text-ink-light">
                            No KPIs set, so nothing to score.
                          </span>
                        )}
                      </div>
                      {/* The bar is a reading of the score, never a way to set one. */}
                      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((value ?? 0) * 100)}%`,
                            background: LIGHT_COLOUR[light(value)],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {canEdit && (
                <>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <Link href={`/setup/kpis?role=${selected.id}`} className="btn-primary">
                      Set this role&rsquo;s KPIs
                    </Link>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => post(addRole, { title: 'New role', parentId: selected.id })}
                    >
                      Add a direct report
                    </button>
                    <Link href={`/scorecard/${selected.id}`} className="btn-secondary">
                      Open scorecard
                    </Link>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-light">
                    A name typed here is pencilled in: free, and nobody is emailed. Invitations are sent
                    from <Link href="/people" className="underline hover:text-rust">People</Link>. Clearing
                    the box changes nothing — use <span className="italic">Make this role vacant</span> to
                    empty a role.
                  </p>
                </>
              )}
            </>
          )}
        </section>

        {/*
          What the board sees, on the screen where it is decided.

          The averages were computed on this page already and shown nowhere — you had to go to the
          team roll-up to find out what the chart you were editing added up to. Moving a role or
          filling a vacancy changes these four numbers, so this is where they belong.
        */}
        <section className="rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
          <span className="label-caps block text-rust-700">What the board sees</span>
          <p className="mt-3.5 max-w-[40ch] text-[15.5px] leading-[26px] text-ink/80">
            Each pillar is the average of every scored role on the chart. Change the structure or a score
            and this moves with it.
          </p>
          <div className="mt-5 grid gap-3.5">
            {PILLARS.map(p => {
              const value = averages[p];
              return (
                <div key={p}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5 text-[14.5px] leading-[22px] text-ink">
                      <span
                        aria-hidden
                        className="block h-3 w-3 shrink-0 rounded-full"
                        style={{ background: LIGHT_COLOUR[light(value)] }}
                      />
                      {PILLAR_META[p].name}
                    </span>
                    <span className="font-serif text-[17px] leading-none text-ink">
                      {value === null ? '0%' : `${Math.round(value * 100)}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((value ?? 0) * 100)}%`,
                        background: LIGHT_COLOUR[light(value)],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/*
            The verdict, in the design's own words — and the honest fourth case the prototype does
            not have, because a prototype always has numbers in it and a real business on its first
            morning does not.
          */}
          <div className="mt-6 rounded-2xl p-5" style={{ background: verdict.wash }}>
            <p className="font-serif text-[18px] leading-[1.3] text-ink">{verdict.title}</p>
            <p className="mt-2 text-sm leading-[22px] text-ink/80">{verdict.body}</p>
          </div>
        </section>
      </div>
    </>
  );
}

/** Is this role the one being viewed from, or somewhere under it? */
function under(role: ChartRole, all: ChartRole[], fromId: string): boolean {
  const seen = new Set<string>();
  let cursor: ChartRole | undefined = role;
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === fromId) return true;
    seen.add(cursor.id);
    cursor = cursor.parentId ? all.find(r => r.id === cursor!.parentId) : undefined;
  }
  return false;
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
