'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  layout, rootsOf, detachedBranches, canMove, canRemove, collapsedAway, teamSize, boardVerdict,
  cardStyle, SEAT_BADGE_ROW, CARD_RING, CARD_RING_SELECTED, type ChartRole, type Rollup,
} from '@/lib/orgchart';
import { PILLAR_META } from '@/lib/pillars';
import {
  pillarReadiness, MIN_KPIS, cadence, memberLine, kpiSuggestions, seatKindFor, readinessLine,
  TEAM_DEFAULT_NAME, TEAM_NAME_EXAMPLES,
} from '@/lib/chart-seats';
import { LIGHT_COLOUR, LIGHT_INK, light } from '@/lib/today';
import { AcePips, AceStar } from '@/components/ace-pips';
import { ChartKey, ChartKeyDetail } from '@/components/chart-key';
import {
  moveRole, movePerson, breakLink, vacateRole, addRole, removeRole, renameRole, renamePerson,
  invitePerson, claimRole, requestRights,
  addTeam, addTeamMember, removeTeamMember, addRoleKpi, removeRoleKpi,
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

/**
 * Keep the menu inside the window.
 *
 * The clamp is not tidiness. Right-click a card near the right-hand edge of a laptop screen and an
 * unclamped menu opens with half its words past the edge — including, on a six-item menu, the one
 * that removes the role.
 */
const MENU_W = 230;
// Six items now that KPIs sit at the top. Under-counting here puts the last item — which is the one
// that removes a role — off the bottom of a laptop screen.
const MENU_H = 8 + 6 * 38;
const place = (x: number, y: number) => ({
  x: Math.max(8, Math.min(x, window.innerWidth - MENU_W)),
  y: Math.max(8, Math.min(y, window.innerHeight - MENU_H)),
});

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

/** Below this, a shrunk card stops being legible — the frame hands the scrollbar back instead. */
const MIN_FIT = 0.45;

export function OrgCanvas({ roles, rootId, canEdit, averages, editableIds = [], myRoleId = null, readOnlyReason = null, openTeamId = null, openRoleId = null }: {
  roles: ChartRole[];
  rootId: string | null;
  canEdit: boolean;
  averages: Rollup;
  /*
    The roles this person can really change — worked out on the server by the same `scope.canEdit`
    the actions call, so the screen and the rule cannot disagree. Offering a box the server is
    always going to refuse is how "I still cant change my name" happens with nothing on screen to
    explain it.
  */
  editableIds?: string[];
  /** The role this viewer's own account holds, if any — so the chart can offer "this is me". */
  myRoleId?: string | null;
  /** Why NOTHING is editable, when that is the situation. Null when it is simply somebody else's branch. */
  readOnlyReason?: string | null;
  /**
   * A team to open straight into, from `?team=` in the address.
   *
   * Every team action redirects back to the chart, and landing on the whole chart after adding
   * somebody to a crew would mean finding the team and opening it again for each name typed. The
   * address carries it so a server round trip comes back where it left.
   */
  openTeamId?: string | null;
  /**
   * A role to come back to, from `?role=` in the address.
   *
   * Every action on a pillar card redirects, which re-renders this component from the server — and
   * the panel's own `selectedId` is initial-only state, so the chart reopened on whatever card it
   * had started on. Adding a KPI to a supervisor put you back on the General Manager, with the
   * measure you had just typed nowhere on screen. Caught by `scripts/org-journey.mjs`, which saw
   * the write succeed in the address and the panel showing somebody else's KPIs.
   */
  openRoleId?: string | null;
}) {
  const editable = new Set(editableIds);
  const month = cadence();
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
  const [selectedId, setSelectedId] = useState<string | null>(openRoleId ?? rootId);
  /*
    Which team is open, if any. The whole canvas is replaced by it — the design's own arrangement,
    and the right one: a crew of eight drawn as eight more cards on the chart would double the width
    of a diagram whose job is showing who reports to whom.
  */
  const [teamId, setTeamId] = useState<string | null>(openTeamId);
  /*
    ── Keeping it in step with the address, which `useState(openTeamId)` alone does not ──────────

    `useState` takes its argument as an INITIAL value and ignores it for ever after. Every team
    action redirects to `/org?team=<id>`, and a redirect out of a server action is a soft
    navigation: this component is re-rendered with a new `openTeamId` and never remounted. So the
    prop was read once, on the first load of the chart, and "Add a team" landed on a page whose
    address said a team was open while the canvas went on drawing the whole chart.

    Adjusted during render rather than in an effect, which is React's own answer to a prop a piece
    of state has to follow. An effect would paint the stale view first and correct it a frame
    later — a visible flash on the one gesture whose whole job is taking somebody somewhere.
  */
  const cameFrom = useRef(openTeamId);
  if (cameFrom.current !== openTeamId) {
    cameFrom.current = openTeamId;
    if (teamId !== openTeamId) setTeamId(openTeamId);
  }
  /* The same, for the card the panel is on. See `openRoleId`. */
  const cameBackTo = useRef(openRoleId);
  if (cameBackTo.current !== openRoleId) {
    cameBackTo.current = openRoleId;
    if (openRoleId && selectedId !== openRoleId) setSelectedId(openRoleId);
  }
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** What is currently typed in the team's name box. Controlled, for the reason below. */
  const [teamDraft, setTeamDraft] = useState<{ id: string; title: string } | null>(null);
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
  /** The frame the tree is scaled to fit inside. See the note beside `data-org-tree` below. */
  const fitRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

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
    How much the tree is shrunk to sit inside its frame with no scrollbar.

    Watches the frame's own width — a `ResizeObserver` rather than `window.resize`, because the
    frame changes size on things a window resize never fires for: the side panel opening beside the
    chart, a team folding open, the browser's own scrollbar appearing once a tall page grows past
    the fold. Height is capped against the viewport too, so a deep chart is shrunk to fit the screen
    rather than merely the width of it — "on one page" means both directions.

    Never scales UP. A chart smaller than its frame is already all on one page; blowing three roles
    up to fill a monitor would not make them more readable, only larger.
  */
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const compute = () => {
      const frameW = el.clientWidth;
      // Leave room for whatever is above the frame — the key, the heading — so the WHOLE tree,
      // not just its top half, lands inside the window without a vertical scroll either.
      const top = el.getBoundingClientRect().top;
      const frameH = Math.max(320, window.innerHeight - top - 24);
      if (!frameW || !width || !height) return;
      // Clamped at MIN_FIT rather than left to shrink further: a chart too big even at the floor
      // gets the scrollbar back (see the overflowX below) instead of cards nobody can read.
      const next = Math.max(MIN_FIT, Math.min(1, frameW / width, frameH / height));
      setFit(prev => (Math.abs(prev - next) > 0.005 ? next : prev));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [width, height]);

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

  /**
   * What the menu was opened ON, and where inside it the press landed.
   *
   * ── Why the menu follows the card instead of closing ─────────────────────────────────────────
   *
   * It used to close on any scroll, which sounded careful and was the bug. Measured on 19 September
   * with the browser instrumented: pressing ⋯ on a card part-way down JBI's chart, moments after
   * that card had been selected, made Chromium scroll the window — to 827 in one run, 339 in the
   * next, both of them the browser bringing the pressed button into view of its own accord, about
   * ten milliseconds AFTER the click. The menu opened and the scroll it caused shut it again. On
   * screen: press the button, the page jumps, nothing appears. Press it again a second later and it
   * works. `scripts/org-journey.mjs` failed on exactly this and I twice blamed the CSS.
   *
   * Closing was the wrong answer to a real problem — a menu pinned to the WINDOW points at the
   * wrong card the moment anything scrolls. So it is pinned to the CARD: the offset from the card
   * is kept, and every scroll re-places the menu over it. Now no scroll can lose it, whoever
   * started the scroll, and it never points at the wrong role.
   *
   * It still closes when the card it belongs to has scrolled out of the window, because a menu for
   * something you can no longer see is a menu about nothing.
   */
  const anchor = useRef<{ el: HTMLElement; dx: number; dy: number } | null>(null);

  const follow = useCallback(() => {
    const a = anchor.current;
    if (!a || !a.el.isConnected) return shut();
    const r = a.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return shut();
    setMenu(m => (m ? { ...m, ...place(r.left + a.dx, r.top + a.dy) } : m));
  }, [shut]);

  // Escape closes it, and so does a press anywhere else. Both, because a menu you cannot dismiss is
  // worse than no menu — and a menu that eats the next click is how a page starts feeling broken.
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', shut);
    window.addEventListener('resize', follow);
    // Capture, because the chart's own frame scrolls sideways and that moves the card too.
    window.addEventListener('scroll', follow, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', shut);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [menu, shut, follow]);

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
   * Open the menu where the press landed, and remember what it was opened on so it can stay there.
   */
  function openMenu(e: React.MouseEvent, roleId: string | null) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    anchor.current = { el, dx: e.clientX - r.left, dy: e.clientY - r.top };
    setMenu({ ...place(e.clientX, e.clientY), roleId });
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
    ];

    /*
      ── A team is not a role, so most of this menu does not apply to it ─────────────────────────

      Design 15 puts "Add a team" on a ROLE's menu — a crew belongs to the leader who runs it. A
      team of teams has nobody accountable for it, so a team's own menu offers opening it, renaming
      it, and taking it off; `mayHoldTeam` refuses the rest on the server too.
    */
    if (role.isTeam) {
      out.push({ label: 'Open the team', run: () => { shut(); setTeamId(roleId); } });
      out.push({ label: 'Rename the team', run: () => editRole(roleId) });
    } else {
      out.push({ label: 'Add a direct report', run: () => { post(addRole, { title: 'New role', parentId: roleId }); shut(); } });
      /*
        The design names it from a `window.prompt`. This adds the team named "Team" and opens it —
        where the name is an ordinary box on the page, alongside everything else about the crew.
        A modal prompt cannot be styled, cannot be cancelled back to anything useful, and on a
        phone is a system dialog over a page the person has not finished reading.
      */
      out.push({ label: 'Add a team', run: () => { post(addTeam, { parentId: roleId, name: '' }); shut(); } });
      out.push({ label: 'Rename role & person', run: () => editRole(roleId) });
    }
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
  /*
    The team being looked at, and the role it belongs to.

    Resolved from `roles` every render rather than held in state, so a name added or removed on the
    server comes back into this view without the component having to be told twice. Falls back to
    the whole chart when the id no longer names a team — a team that has been removed in another
    tab should show the chart, not an empty layer.
  */
  const openTeam = teamId ? roles.find(r => r.id === teamId && r.isTeam) ?? null : null;
  const teamLeader = openTeam?.parentId ? roles.find(r => r.id === openTeam.parentId) ?? null : null;
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
        /* The anchor `addTeam` comes back to. Creating a team IS a navigation — the browser has to
           be told the new team's id — so without somewhere to land it would drop to the top of the
           page and leave the crew it just made off screen. */
        id="chart"
        data-org-canvas
        className="rounded-2xl bg-surface p-5 shadow-sm sm:p-8"
        onContextMenu={e => openMenu(e, null)}
      >
        {/*
          ── The team layer, which REPLACES the chart ────────────────────────────────────────────

          Design 15 draws it inside the same frame, in place of the tree: the crew as a grid of name
          cards, a box to add another, and the four pillars the whole team shares.

          Replacing rather than sitting beside it is the design's arrangement and the right one. A
          crew of eight drawn as eight more cards on the chart would double the width of a diagram
          whose entire job is showing who reports to whom — which is exactly why the team node
          exists instead.
        */}
        {openTeam ? (
          <div data-team-layer={openTeam.id}>
            <button
              type="button"
              onClick={() => setTeamId(null)}
              className="mb-4 text-[13.5px] text-rust-700 underline-offset-2 hover:underline"
            >
              &larr; Back to org chart
            </button>
            <span className="label-caps block text-rust-700">Team layer</span>
            {/*
              ── The team's name, as a box rather than a heading ──────────────────────────────

              Kris, 19 September: *"how do i give the team a team name"*.

              There was no way. The design names a team with a `window.prompt` at the moment it is
              created; I did not build that — a system dialog cannot be styled, cannot be cancelled
              back to anything useful, and on a phone lands over a page nobody has finished reading
              — and then did not build the thing that replaces it either. So every team was created
              called "Team" and stayed called "Team". The rename lived on the card's right-click
              menu, which is the last place somebody looks when they are already inside the team.

              So the name is a box, here, at the top of the crew it belongs to. Prefilled, saved on
              purpose rather than as you type, and focused automatically while the team is still
              called "Team" — which is only ever true on the one screen after it was made, and is
              exactly the moment naming it is the next thing to do.
            */}
            {canEdit && editable.has(openTeam.id) ? (
              <form action={renameRole} className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input type="hidden" name="roleId" value={openTeam.id} />
                <label className="sr-only" htmlFor="team-name">Team name</label>
                <input
                  id="team-name"
                  name="title"
                  /*
                    Controlled, like the panel's two boxes and for the same reason: this component
                    re-renders whenever any action on the page finishes, and an uncontrolled input
                    loses whatever is in it the moment React replaces the element.
                  */
                  value={teamDraft?.id === openTeam.id ? teamDraft.title : openTeam.title}
                  onChange={e => setTeamDraft({ id: openTeam.id, title: e.target.value })}
                  autoFocus={openTeam.title === TEAM_DEFAULT_NAME}
                  placeholder={TEAM_NAME_EXAMPLES.join(', ')}
                  className="min-h-[44px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 font-serif text-2xl text-ink"
                />
                <button className="btn-secondary">Save the team name</button>
              </form>
            ) : (
              <h2 className="mt-1 font-serif text-2xl text-ink">{openTeam.title}</h2>
            )}
            <p className="mt-1.5 text-sm text-ink-light">
              {teamLeader ? `Under ${teamLeader.title}.` : 'Not reporting to anybody yet.'}
              {openTeam.title === TEAM_DEFAULT_NAME
                ? ' Give it the name the business actually uses — Technicians, Apprentices, the Solar crew.'
                : ''}
            </p>

            <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {(openTeam.members ?? []).map(m => (
                <div
                  key={m.id}
                  data-team-member={m.id}
                  className="relative rounded-[20px] bg-cream px-4 py-[18px] text-center"
                  style={{ boxShadow: 'inset 0 0 0 1px #ffe1d0' }}
                >
                  {canEdit && editable.has(openTeam.id) && (
                    <form action={removeTeamMember} className="absolute right-2 top-1.5">
                      <input type="hidden" name="assignmentId" value={m.id} />
                      <button
                        aria-label={`Take ${m.name} out of ${openTeam.title}`}
                        title={`Take ${m.name} out of ${openTeam.title}`}
                        className="text-sm leading-none"
                        style={{ color: LIGHT_COLOUR.red }}
                      >
                        &times;
                      </button>
                    </form>
                  )}
                  <span className="block font-serif text-[15px] leading-5 text-ink">{m.name}</span>
                  {/*
                    Everybody in a team is on a team seat — nothing reports to a team, and the title
                    on the node is the crew's name rather than a job title, so `seatKindFor` lands
                    on `team` for all of them. The design says so on each card, and it is the number
                    on the bill.
                  */}
                  <span className="mt-1.5 block text-[11.5px] text-ink-light">
                    Team seat{m.hasAccount ? '' : ' · pencilled in'}
                  </span>
                </div>
              ))}

              {canEdit && editable.has(openTeam.id) && (
                <form
                  action={addTeamMember}
                  className="flex flex-col gap-2 rounded-[20px] border-2 border-dashed border-rust-400 bg-cream px-4 py-[18px]"
                >
                  <input type="hidden" name="roleId" value={openTeam.id} />
                  <label className="sr-only" htmlFor="team-add">Add somebody to {openTeam.title}</label>
                  <input
                    id="team-add"
                    name="name"
                    autoComplete="off"
                    placeholder="Add a name"
                    className="min-h-[36px] w-full rounded-md border border-ink/15 bg-surface-raised px-2.5 py-1.5 text-[13px] text-ink"
                  />
                  <button className="btn-secondary px-2.5 py-[7px] text-xs">+ Add to team</button>
                </form>
              )}
            </div>

            {/*
              A name typed here costs nothing and emails nobody — the same rule as the chart's own
              name boxes, and the reason a leader can draw a whole crew before deciding who gets a
              login.
            */}
            {canEdit && editable.has(openTeam.id) && (
              <p className="mt-3 text-xs leading-5 text-ink-light">
                A name here is pencilled in: free, and nobody is emailed. Taking somebody out ends
                their placement today and keeps the record of it.
              </p>
            )}

            <div className="mt-7 border-t border-rust-200 pt-6">
              <span className="label-caps block text-rust-700">Team KPIs &mdash; shared group score</span>
              <p className="mt-1.5 max-w-[60ch] text-[13px] leading-5 text-ink-light">
                One set of measures for the whole crew. Everybody in the team is scored on the same
                four pillars together, which is what makes it a team rather than {(openTeam.members?.length ?? 0) || 'several'} separate cards.
              </p>
              <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                {PILLARS.map(p => (
                  <PillarCard
                    key={p}
                    pillar={p}
                    role={openTeam}
                    canEdit={canEdit && editable.has(openTeam.id)}
                  />
                ))}
              </div>

              {/*
                ── Where a team's month is marked and signed off ─────────────────────────────

                Kris, having built one: *"how do i sign off the team kpi's"*.

                The answer was "nowhere", and that was a bug — a team is `staff` level, and both
                `isScored` and `scoredRolesInScope` filtered `staff` out, so a team's KPIs could be
                written here and then never marked, never rolled up and never signed off. Fixed in
                lib/today-data and lib/scope.

                But the fix alone would have left him in the same place: knowing it works somewhere
                and not where. A team is marked and signed off exactly like every other scorecard —
                which is the point of building it as a role — so the honest thing is to say that in
                one line and put the two doors next to it, rather than explain a process.
              */}
              <div className="mt-5 rounded-xl bg-cream p-4">
                <p className="text-[13.5px] leading-[22px] text-ink">
                  This team is scored like any other card on the chart: mark it each month with
                  everything else, and it is signed off in the same pass. One score for the crew,
                  not one each.
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <Link href={`/scorecard/${openTeam.id}`} className="btn-secondary">
                    Open the team&rsquo;s scorecard
                  </Link>
                  <Link href="/scoring" className="btn-secondary">
                    Mark and sign off this month
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <>
        {/*
          What part of the business is on screen, and how to change it.

          Forty roles on one canvas is a picture nobody can read. The selector narrows the drawing
          to one branch — and the sentence beside it says so plainly, because a chart quietly
          showing you two thirds of a company is a chart that lies by omission.
        */}
        {/*
          ── The month, and when it has to be signed off ────────────────────────────────────────

          Design 15 puts this in the chart's header: the month being scored, and the deadline to
          sign off and reset. The design computes it on the client as a placeholder and says Code
          should drive it from the real lock schedule; `cadence` in lib/chart-seats is that one
          function, so the banner and whatever eventually locks the month cannot disagree.

          It reads as a fact, not an alarm — until it is overdue, which is the only state worth a
          colour, because it is the only one that changes what somebody does today.
        */}
        <div
          className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"
          data-chart-cadence
        >
          <span className="label-caps text-ink-light">Scoring month</span>
          <strong className="font-medium text-ink">{month.scoringMonth}</strong>
          <span className="text-ink-light">·</span>
          <span style={month.overdue ? { color: LIGHT_COLOUR.red } : undefined} className="text-ink-light">
            {month.overdue
              ? `Sign-off was due ${month.deadline}.`
              : `Sign off and reset before ${month.deadline} — ${month.daysLeft} ${month.daysLeft === 1 ? 'day' : 'days'} left.`}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <span className="text-[13.5px] text-ink-light">
            Viewing:{' '}
            <strong className="font-medium text-ink">
              {from
                ? `${roles.find(r => r.id === from)?.title ?? 'a role'} and below`
                : 'Whole company chart'}
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

        {/*
          ── One page, not a scrollbar ────────────────────────────────────────────────────────

          Kris, 20 September: *"the org chart with the movement bar is annoying and visibility not
          great - make it all symetrical and on one page"*. The layout below was already symmetric
          — `layout()` in lib/orgchart centres every parent over its own children — but the CANVAS
          drew every card at its native pixel size and left the browser to grow a horizontal
          scrollbar once the tree was wider than the screen. A chart you have to drag sideways to
          read is not "on one page" whatever the boxes underneath it look like.

          So the tree is measured at its true size, same as always, and then scaled down as ONE
          image to fit the space actually available — width primarily, since that is what forced
          the scrollbar, and height too so a tall chart does not run off the bottom either. `fitRef`
          is the frame; `fit` is how much the tree inside it is shrunk. A chart that already fits
          scales at 1 and nothing changes. Below `MIN_FIT` the cards would stop being readable, so
          past that floor the frame gives up trying to fit it and hands the scrollbar back —
          survivable and rare, rather than forty roles rendered at a size nobody can read.
        */}
        <div ref={fitRef} className="mt-4 pt-4" style={{ overflowX: fit <= MIN_FIT ? 'auto' : 'hidden' }}>
        <div className="mx-auto" style={{ width: width * fit, height: height * fit }}>
        {/* Marked so a browser check can measure the cards against the tree they sit on — the
            chart's height is derived from the bottom row's card, and that arithmetic has drifted
            before. See the note on `layout`'s height in lib/orgchart. */}
        <div data-org-tree className="relative" style={{ width, height, transform: `scale(${fit})`, transformOrigin: 'top left' }}>
          {/*
            The lines carry the reading, and they are rails rather than hairlines.

            They were 2px of one flat colour — plumbing. Kris, 19 September: *"links nice and thick
            lines like pipes"*. So they are `PIPE` thick and `rounded-full`, which at this width
            domes the free ends and leaves the junctions square, because a rail overlaps the stub
            and risers it meets by half a pipe — see the geometry in lib/orgchart.

            They carry what they are reporting, so a branch in trouble is visible from the shape of
            the chart instead of by reading eight cards. `LIGHT_COLOUR` because these are looked at
            rather than read; a line with nothing scored behind it stays the quiet sand it was.
          */}
          {lines.map((l, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: l.x, top: l.y, width: l.w, height: l.h,
                /*
                  ── An unscored line is GREY, not almost-the-panel ──────────────────────────

                  This was `#e7d6bb` against a `#ebddc5` panel: two per cent apart, so on a chart
                  where nothing is scored yet — which is every business on its first morning — the
                  whole tree vanished and the cards floated unconnected. Kris, 19 September, with
                  a photograph of it: *"It is not right and doesnt match the design"*. In the
                  design every line is green because the prototype ships with every role scored; it
                  has no unscored case, so this colour was mine and it was invisible.

                  `LIGHT_COLOUR.pending` is the same grey as an unset tile and the same swatch the
                  key prints beside "Not set", so a line with nothing behind it reads exactly like
                  the letters it joins. The structure is the one thing this screen must always
                  show: a business can have no scores, and still has a shape.
                */
                background: l.score === null ? LIGHT_COLOUR.pending : LIGHT_COLOUR[light(l.score)],
              }}
            />
          ))}

          {cards.map(c => {
            const r = c.role;
            const isOver = over === r.id;
            const dragging = drag?.kind === 'role' && drag.id === r.id;
            const team = teamSize(r.id, onChart);
            const shut_ = collapsed.has(r.id);
            // The design's numbers for this depth — width, padding, radius, title and tile size.
            const z = cardStyle(c.depth);

            /*
              ── A team node, which is a different card ────────────────────────────────────────

              Design 15 draws it sage rather than cream, with the team's name, a member count where
              a person's pill would be, and the same four S/P/E/C tiles — one shared score for the
              group.

              It is not draggable and cannot be dropped onto: nothing reports to a team, and a team
              belongs to the leader who runs it. `canMove` refuses both on the server as well, so
              this is politeness rather than the rule.

              One press opens the team. The design uses a double-click, and the same reasoning that
              moved the power meter off one applies here — a double-click cannot be discovered,
              cannot be reached from a keyboard and does not exist on a phone. There is nothing else
              a press on a team card could usefully mean.
            */
            if (r.isTeam) {
              const count = r.members?.length ?? 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  data-team-node={r.id}
                  onClick={() => setTeamId(r.id)}
                  onContextMenu={e => openMenu(e, r.id)}
                  title={`${r.title} — ${memberLine(count)}. Press to go into the team.`}
                  className="group absolute flex flex-col items-center justify-center bg-sage-100 text-center transition-[box-shadow,transform] hover:-translate-y-px"
                  style={{
                    left: c.x, top: c.y, width: c.w, height: c.h,
                    padding: `${z.pad}px ${Math.round(z.pad * 1.3)}px`,
                    /* The same box as a role card — same radius, same ring. Only the colour says
                       it is a team, because colour is the one thing on this chart allowed to
                       differ. See CARD_RING in lib/orgchart. */
                    borderRadius: z.radius,
                    boxShadow: selectedId === r.id
                      ? `0 0 0 ${CARD_RING_SELECTED}px #7a8a5e, 0 6px 16px -6px rgba(0,0,0,0.22)`
                      : `0 0 0 ${CARD_RING}px rgba(122,138,94,0.45), 0 6px 16px -8px rgba(0,0,0,0.18)`,
                  }}
                >
                  <span className="font-serif font-semibold leading-[1.25] text-sage-900" style={{ fontSize: z.title }}>
                    {r.title}
                  </span>
                  <span className="mt-1 block text-[12px] text-ink-light" data-team-count={r.id}>
                    {memberLine(count)}
                  </span>
                  <span className="mt-2.5 flex items-center justify-center gap-[7px]">
                    {PILLARS.map(p => {
                      const value = r.pillars?.[p] ?? null;
                      return (
                        <span
                          key={p}
                          title={`${PILLAR_META[p].name} ${value === null ? 'no score' : `${Math.round(value * 100)}%`}`}
                          className="grid shrink-0 place-content-center font-serif text-cream"
                          style={{
                            width: z.tile, height: z.tile, borderRadius: 8,
                            fontSize: Math.max(11, Math.round((z.tile - 13) * 1.05)), lineHeight: 1,
                            background: LIGHT_INK[light(value)],
                          }}
                        >
                          {PILLAR_META[p].letter}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            }

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
                /*
                  ── The card, to the design's own numbers ────────────────────────────────────

                  Three things here were the "old design" Kris kept pointing at, and all three are
                  in `SPEC Org Chart.dc.html` in black and white:

                  **The fill is the CREAM page colour, not the sand surface.** The cards sit on a
                  sand panel, so a sand card is the same colour as the thing behind it — which is
                  why the chart photographed flat and washed out. `fills` in the prototype is
                  `var(--color-bg)` at every level: the card is LIGHTER than its panel.

                  **The edge is a 2.5px ring, not a border.** `box-shadow: 0 0 0 2.5px` sits
                  outside the box, so it cannot eat a pixel of the space the title needs, and it
                  reads as part of the chart rather than as a table rule. Selected is the full
                  terracotta and lifts a pixel.

                  **The radius and the type grow with seniority** — 28px at the top, 24 at the
                  bottom. The product drew one radius and one text size for every card, so the
                  hierarchy had to be read off the lines instead of being visible in the shapes.
                */
                className={`group absolute flex flex-col items-center bg-cream text-center transition-[box-shadow,transform] ${
                  dragging ? 'opacity-40' : ''
                } ${canEdit ? 'cursor-grab' : ''}`}
                style={{
                  left: c.x, top: c.y, width: c.w, height: c.h,
                  padding: `${z.pad}px ${Math.round(z.pad * 1.3)}px`,
                  borderRadius: z.radius,
                  boxShadow: isOver
                    ? `0 0 0 3px ${LIGHT_COLOUR.green}, 0 12px 22px -8px rgba(0,0,0,0.28)`
                    : selectedId === r.id
                      ? `0 0 0 ${CARD_RING_SELECTED}px #c67139, 0 6px 16px -6px rgba(0,0,0,0.22)`
                      : `0 0 0 ${CARD_RING}px #f6a06b, 0 6px 16px -8px rgba(0,0,0,0.18)`,
                  transform: isOver ? 'translateY(-3px)' : selectedId === r.id ? 'translateY(-1px)' : undefined,
                }}
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

                    1.4 clears the descenders at every size the card uses. Line-height is rounded
                    to whole pixels differently at different zoom levels and on different platforms,
                    so a ratio that is comfortable at 100% on this machine can still shave a tail at
                    110% on somebody else's. Clipping through the middle of a person's role is not a
                    thing to leave to rounding.

                    `scripts/org-journey.mjs` asserts the ratio AND that the box is at least two full
                    lines tall, so a future tightening of the type cannot quietly start cutting names
                    in half again.
                  */
                  /*
                    The title takes the space, and the rest sits under it.

                    The design gives the title `height: 100%` so it fills whatever the card has
                    spare, which puts air between the role and the name and drops the name and the
                    four tiles towards the bottom. Everything centred in a tight block, which is
                    what this was, reads as a label; the design's card reads as a card.
                  */
                  className={`flex w-full flex-1 items-center justify-center font-semibold text-ink [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] [overflow:hidden] ${r.ace?.holdingAce ? 'px-5' : ''}`}
                  style={{
                    fontSize: z.title,
                    /*
                      1.4, and NO padding underneath.

                      The descenders need the room; padding is the wrong way to give it to them. A
                      clamp box is capped at two line-heights, so padding-bottom sits OUTSIDE what
                      the clamp will draw — the browser reports the box as overflowing by exactly
                      the padding, for ever, and the check that exists to catch a cut-off name
                      spends its life crying wolf about three pixels of nothing. Put the space in
                      the line-height, where the clamp counts it.
                    */
                    lineHeight: 1.4,
                    /*
                      ── The BODY face, which is what the design's preview draws ────────────────

                      The prototype computes a `titleStyle` — the display face, sized by depth, with
                      a half-pixel shadow on all four sides to fake a heavier weight — and never
                      applies it to the element. So every title in the design's own preview is plain
                      16px Figtree, and for a while the product was the only one of the two
                      rendering what the file's code asked for.

                      Kris looked at both: *"match the design preview - make titles the body font"*.
                      Right on more than deference — the display face at card size is a lot of
                      texture on a diagram somebody scans forty of at once, and the faux-bold reads
                      as damaged rather than bolder at these sizes anyway.
                    */
                  }}
                  title={r.title}
                >
                  {r.title}
                </span>

                {/*
                  ── Which seat this is ──────────────────────────────────────────────────────

                  Design 15: a leadership seat for anybody who leads people, a team seat for
                  anybody who is led — and they are priced very differently, so the card has to say
                  which it is rather than leaving it to a bill at the end of the month.

                  Worked out from the chart AND the title together; see lib/chart-seats for why
                  neither on its own is safe. Grey, always: this is what the seat IS, and colour on
                  this diagram only ever says how something is GOING.
                */}
                {r.badges.length > 0 && (
                  <span
                    /*
                      The line-height is EXPLICIT and matches `SEAT_BADGE_ROW`, which is what
                      `cardHeight` reserves for this row. Left to inherit, it was ~15px of line the
                      card's arithmetic knew nothing about — the title lost a line to make room and
                      "Head of Commercial" came out as "Head of". A row the layout has to allow for
                      may not be a size only the browser knows.
                    */
                    className="mt-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-ink-light"
                    style={{ lineHeight: `${SEAT_BADGE_ROW - 4}px` }}
                    data-role-seat={r.id}
                  >
                    {r.badges.join(' · ')}
                  </span>
                )}

                {r.person ? (
                  <span
                    /* Named so a browser check can take hold of the pill itself rather than the
                       card it sits on — the two are different drags with different meanings. */
                    data-person-pill={r.id}
                    draggable={canEdit}
                    onDragStart={e => {
                      if (!canEdit) return;
                      e.stopPropagation();
                      setDrag({ kind: 'person', id: r.id, title: r.person! });
                    }}
                    /*
                      The design's pill: the page colour with a one-pixel ring, not a tinted block.
                      A pencilled name is the same pill in a quieter ink — the difference between
                      somebody invited and somebody written in is a fact about the PERSON, and the
                      tooltip says it; painting it a different colour would make it look like a
                      score.
                    */
                    className={`mt-[5px] inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-[14px] font-semibold leading-[19px] ${
                      canEdit ? 'cursor-grab' : ''
                    }`}
                    style={{
                      background: '#f5ead8',
                      boxShadow: 'inset 0 0 0 1px #ffe1d0',
                      color: r.pencilled ? 'rgba(32,30,29,0.55)' : 'rgba(32,30,29,0.85)',
                    }}
                    title={
                      r.id === myRoleId ? `${r.person} — this is your own account`
                      : r.pencilled ? `${r.person} — pencilled in, not invited`
                      : r.person
                    }
                  >
                    {r.person}
                    {/*
                      ── Which card is YOU ───────────────────────────────────────────────────

                      Kris, 19 September, after putting his account back into the General Manager
                      role: *"it didnt add me - anthony is still there"*.

                      He had no way to tell whether it had worked. Two completely different
                      situations look identical on this chart — the claim did nothing, or the claim
                      worked and his own ACCOUNT is carrying the wrong name, which is possible
                      because renaming the person on a card held by a login used to rename that
                      login. A name on a card says nothing about whose account it is.

                      SPEC decides everything a person can do from where they sit on this chart, so
                      "where do I sit" is the one question it should never make somebody guess at.
                    */}
                    {r.id === myRoleId && (
                      <span className="ml-1 opacity-60" style={{ fontSize: '11px' }}>(you)</span>
                    )}
                  </span>
                ) : (
                  /* Vacant is not a pill in the design — it is quiet text, because there is no
                     name to pick up and move. */
                  <span className="mt-[5px] inline-block text-[14px] leading-[19px]" style={{ color: 'rgba(32,30,29,0.55)' }}>
                    Vacant
                  </span>
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
                  <span className="mt-2.5 flex items-center justify-center gap-[7px]">
                    {PILLARS.map(p => {
                      const value = r.pillars?.[p] ?? null;
                      return (
                        <span
                          key={p}
                          title={`${PILLAR_META[p].name} ${value === null ? 'no score' : `${Math.round(value * 100)}%`}`}
                          /*
                            TILES, 8px of radius — the design's `tile()`. They were 6px on a
                            smaller box, which at that size reads as a dot with a letter in it
                            rather than as one of four squares. The size comes from the depth
                            table like everything else on the card.
                          */
                          className="grid shrink-0 place-content-center font-serif text-cream"
                          style={{
                            width: z.tile, height: z.tile, borderRadius: 8,
                            fontSize: Math.max(11, Math.round((z.tile - 13) * 1.05)), lineHeight: 1,
                            background: LIGHT_INK[light(value)],
                          }}
                        >
                          {PILLAR_META[p].letter}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="mt-2 block text-[10px] text-ink-light">Checklist role</span>
                )}

                {/*
                  ── The Ace run, only once there IS a run ─────────────────────────────────────

                  Kris asked for this outright: *"Now show me the org chart with the aces on it"*.
                  Before it, finding out where somebody was in their three meant opening their
                  scorecard one role at a time, which nobody does for forty people.

                  What was wrong was not the pips, it was drawing three EMPTY circles on every
                  scored card in the business whether or not anybody was on a run — forty cards
                  each wearing a marker for something that had not started. The design has no such
                  thing on a card, and that is the clutter in the chart Kris called the old design.

                  So they appear when the run does. Nought of three is not a run; it is a month
                  like any other, and the card says so by being quiet.
                */}
                {r.ace && r.ace.consecutive > 0 && (
                  <span className="absolute bottom-1.5 right-2 flex items-center">
                    <AcePips ace={r.ace} big={false} />
                  </span>
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
                    /*
                      ── Out of sight until it is wanted ──────────────────────────────────────

                      The design's card has no ⋯ at all: everything is right-click. The product
                      keeps one, because a menu reachable only by right-click is reachable only by
                      people who already know it is there — but a permanent glyph on forty cards is
                      forty marks the design does not have, and Kris photographed exactly that:
                      *"It is not right and doesnt match the design"*.

                      So on a device with a pointer it appears on hover or keyboard focus, and the
                      card at rest is the design's card. On touch, where there is neither hover NOR
                      right-click, it is always there — hiding it would leave a phone with no way
                      into the menu at all.

                      A 24px hit area around a 13px glyph: it measured 21×13, under the floor the
                      usability journey holds every control to.
                    */
                    className={`menu-key absolute top-0 grid h-6 w-6 place-content-center rounded text-[13px] leading-none text-ink-light opacity-0 transition-opacity hover:text-rust group-hover:opacity-100 focus-visible:opacity-100 ${
                      r.ace?.holdingAce ? 'right-7' : 'right-0.5'
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

        {/* The long answer about the colours and the Ace, folded away here rather than adding a
            second row to the key. See ChartKeyDetail. */}
        <div className="mt-3">
          <ChartKeyDetail />
        </div>
        </>
        )}
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
                ── How ready this role is to be scored, at the top of its own card ───────────────

                Design 15 puts a chip per pillar here — a dot, the pillar, and how many KPIs it
                carries — with one sentence underneath saying what it adds up to.

                The chips are green or red on SPEC's minimum of two, which is the same threshold
                `lib/period` refuses to open a month without. The line beneath names the pillars
                that are short rather than only saying that something is, because "compliance and
                people are short" is a thing somebody can go and fix and "not ready" is not.
              */}
              <div className="mt-4 flex flex-wrap gap-2.5" data-kpi-readiness>
                {PILLARS.map(p => {
                  const n = selected.kpiCounts?.[p] ?? 0;
                  const ready = pillarReadiness(n) === 'ready';
                  return (
                    <span
                      key={p}
                      className="flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-[5px] text-xs text-ink"
                      data-readiness={p}
                    >
                      <span
                        aria-hidden
                        className="block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: ready ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}
                      />
                      {PILLAR_META[p].name} {n}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-[12.5px] leading-[18px] text-sage-900" data-readiness-line>
                {readinessLine({
                  safety: selected.kpiCounts?.safety ?? 0,
                  people: selected.kpiCounts?.people ?? 0,
                  earnings: selected.kpiCounts?.earnings ?? 0,
                  compliance: selected.kpiCounts?.compliance ?? 0,
                })}
              </p>

              {/*
                Renaming, in the place the design puts it rather than behind a menu item.

                Two ordinary forms with a Save on each, not the prototype's save-as-you-type. A chart
                is a shared document: a keystroke that reaches the database before anybody has
                finished thinking is how a role gets renamed "Operations Manage" because a colleague
                walked past.
              */}
              {canEdit && editable.has(selected.id) ? (
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

                  {/*
                    The same answer in the panel, where the box that can correct it is.

                    If this IS your account and the name on it is wrong, typing over it fixes the
                    account — which is the situation Kris was in without being able to see it.
                  */}
                  {selected.id === myRoleId && (
                    <p className="mt-1.5 text-[12px] text-ink-light">
                      This role is <b>your own account</b>. The name above is the name on your
                      login &mdash; if it is wrong, type over it and save.
                    </p>
                  )}

                  {/*
                    ── Giving them a login, from the screen where you are thinking about them ──────

                    Kris, 19 September: *"i need to know how to invite new people - add their email
                    and send to them"*. All of it was built and all of it was proven end to end; the
                    only door was Setting up → Your business, and this screen — the one where a
                    leader actually thinks about who works for them — had none. So he could not find
                    it, and a feature nobody can find is not a feature.

                    It appears only where it means something: somebody is pencilled onto this card
                    and has no account yet. A vacant role has nobody to invite and a person who
                    already has a login has nothing to send — both would be a button that does
                    nothing, on every card in the business.

                    What it costs is written beside it, because pressing it starts a monthly charge.
                    A seat that quietly begins being billed from a control that never said so is the
                    kind of surprise that ends a trial.
                  */}
                  {/*
                    ── "This role is me" ─────────────────────────────────────────────────────

                    Kris, 19 September, four times over: *"i am the GM but it wont let me change
                    from anthony to my name"*, then *"I can't change GM back to me"*.

                    Renaming the person and claiming the role are different things, and SPEC only
                    had the first. Typing your own name over a pencilled-in one renames a NAME —
                    the card reads correctly and your login is still attached to nothing, so SPEC
                    still does not believe you are on your own chart. Every rule that works by
                    walking down from your role still finds nowhere to start.

                    Offered on any role the viewer can shape that is not already theirs. It is
                    deliberately a button and not a box: it is one decision with one outcome, and
                    a decision that reads as typing is how somebody does it by accident.
                  */}
                  {myRoleId !== selected.id && (
                    <form action={claimRole} className="mt-2">
                      <input type="hidden" name="roleId" value={selected.id} />
                      <button className="btn-secondary w-full sm:w-auto">
                        This role is me &mdash; put my account in it
                      </button>
                      {selected.person && selected.pencilled && (
                        <p className="mt-1.5 text-[12px] text-ink-light">
                          {selected.person} is pencilled in here and comes off the role. They have
                          no login, so nothing is lost &mdash; type the name onto another card to
                          put them back.
                        </p>
                      )}
                    </form>
                  )}

                  {selected.person && selected.pencilled && (
                    <form action={invitePerson} className="mt-3 rounded-xl bg-cream p-3">
                      <input type="hidden" name="roleId" value={selected.id} />
                      <label className="block text-[13px] text-ink-light" htmlFor="org-invite">
                        {selected.person} has no SPEC login yet. Send them one:
                      </label>
                      <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          id="org-invite"
                          name="email"
                          type="email"
                          autoComplete="off"
                          className="min-h-[40px] w-full rounded-md border border-ink/15 bg-surface-raised px-3 py-2 text-sm text-ink"
                          placeholder="their@email.com"
                        />
                        <button className="btn-secondary">Invite {selected.person.split(' ')[0]}</button>
                      </div>
                      <p className="mt-2 text-[12px] text-ink-light">
                        They set their own password when they arrive and land on their own My Page.
                        The link works once and only for that address.
                      </p>
                    </form>
                  )}
                </>
              ) : (
                <div className="mt-4">
                  <p className="font-serif text-[19px] text-ink">{selected.title}</p>
                  <p className="mt-1 text-sm text-ink-light">{selected.person ?? 'Vacant'}</p>
                  {/*
                    ── Why there is no box here ────────────────────────────────────────────────

                    Kris, 19 September: *"I still cant change my name in the org chart"*.

                    Until now this was simply static text, and a reader had to infer from an absence
                    that SPEC had decided something about them. That is the worst kind of refusal:
                    one nobody is told about, on a screen that looks like it is merely being quiet.

                    `readOnlyReason` covers the two cases where NOTHING is editable — no write
                    access, or not placed on the chart at all, which is the one that silently locks
                    an owner out of their own business. Otherwise this is simply somebody else's
                    branch, and that is worth saying too.
                  */}
                  <p className="mt-3 rounded-lg bg-cream p-3 text-xs leading-5 text-ink-light">
                    {readOnlyReason ?? 'This role is outside your part of the chart, so SPEC will not let you change it. You can change your own role and everybody who reports up to you.'}
                  </p>

                  {/*
                    ── Asking, rather than being stuck ────────────────────────────────────────

                    Kris's rule, 19 September: *"managers only have rights to their staff - if
                    rights are needed then the admin must approve this"*.

                    Without this the sentence above is a wall. Somebody covering another
                    supervisor's crew for a fortnight had two options — do without, or be handed an
                    administrator account, which throws the whole rule away to solve a fortnight.

                    Only offered where asking makes sense: a role that really is outside their part
                    of the chart. Somebody who is read-only, or not placed at all, has a different
                    problem and a different sentence, and a button here would be answering the
                    wrong question.
                  */}
                  {canEdit && !readOnlyReason && (
                    <form action={requestRights} className="mt-2 rounded-xl bg-cream p-3">
                      <input type="hidden" name="roleId" value={selected.id} />
                      <label className="block text-[13px] text-ink-light" htmlFor="org-why">
                        Need to manage {selected.title} and everybody under it?
                      </label>
                      <input
                        id="org-why"
                        name="why"
                        className="mt-1.5 min-h-[40px] w-full rounded-md border border-ink/15 bg-surface-raised px-3 py-2 text-sm text-ink"
                        placeholder="Why, in a line — it goes to the administrator"
                      />
                      <button className="btn-secondary mt-2 w-full sm:w-auto">
                        Ask the administrator for rights
                      </button>
                    </form>
                  )}
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
              {/*
                The four pillars as the design draws them: a card each, the percentage in serif,
                the measures NAMED underneath, and a box to add another.

                The prototype puts a slider here and drags the score around. That is the one thing
                from this design that must not be built: a score in SPEC is what the KPI results
                add up to, and a control that sets it directly would make every number on the board
                a matter of opinion. The button goes to where the numbers are actually decided.

                Drawn by the same `PillarCard` the team layer uses — the same question asked of a
                person's role and of a crew, and two copies would be two chances for the KPI list
                and the add box to drift.
              */}
              <div className="mt-6 grid gap-3">
                {PILLARS.map(p => (
                  <PillarCard key={p} pillar={p} role={selected} canEdit={canEdit} />
                ))}
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
                  {/*
                    This line used to end "Invitations are sent from People", which was wrong before
                    the invite box was built — they were sent from Setting up, not People — and is
                    now wrong twice, because they are sent from the box immediately above it. A
                    sentence pointing somewhere else, printed under the control that does the job,
                    is worse than no sentence: it sends somebody hunting.

                    What it still has to say is the part that is easy to get wrong and expensive to
                    discover: typing a name costs nothing and emails nobody. That is what makes it
                    safe to draw the whole business on this screen before deciding who gets a seat.
                  */}
                  <p className="mt-3 text-xs leading-5 text-ink-light">
                    A name typed here is pencilled in: free, and nobody is emailed until you press
                    Invite. Clearing the box changes nothing — use{' '}
                    <span className="italic">Make this role vacant</span> to empty a role.
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

/**
 * One pillar of one scorecard: how it is going, what it is measured on, and a box to add another.
 *
 * ── The KPI editor design 15 asks for ───────────────────────────────────────────────────────────
 *
 * Kris, 18 September: *"org chart and entering kpi's is everything to this system - why is it so
 * hard"*. The design's answer is a prompt that opens from a right-click on a pillar, with the
 * business's own examples offered underneath.
 *
 * This is that, as a box on the card rather than a modal over it. A modal has to be opened before
 * it can be typed in, which is two gestures for one line of text, and it hides the four KPIs
 * already on the pillar at the moment somebody is deciding whether to add a fifth. The examples
 * are a `datalist`, so they are suggestions in the box rather than a sentence to press.
 *
 * ── The same card in two places ─────────────────────────────────────────────────────────────────
 *
 * The Role scorecard panel and the team layer draw exactly this. They are the same question — what
 * is this scored on — asked of a person's role and of a crew, and the design draws them the same
 * way. Two copies would have been two chances for the KPI list and the add box to drift.
 */
function PillarCard({ pillar, role, canEdit }: {
  pillar: (typeof PILLARS)[number];
  role: ChartRole;
  canEdit: boolean;
}) {
  const value = role.pillars?.[pillar] ?? null;
  const named = role.kpis?.[pillar] ?? [];
  const ids = role.kpiIds?.[pillar] ?? [];
  const count = role.kpiCounts?.[pillar] ?? 0;
  /*
    A supervisor is measured on what their team did; an electrician on what they did. A team node
    is measured as a crew, which is the frontline list — offering "Gross profit margin at 40%" to
    somebody who cannot see a margin teaches them SPEC is not about their job.
  */
  const kind = role.isTeam
    ? 'team'
    : seatKindFor({ title: role.title, hasDirectReports: false });
  const examples = kpiSuggestions(kind, pillar, named);
  const listId = `kpi-examples-${role.id}-${pillar}`;

  return (
    <div className="rounded-2xl bg-cream p-5" data-pillar-card={pillar}>
      <div className="flex items-center justify-between gap-3">
        <span className="label-caps flex items-center gap-2.5 text-ink-light">
          <span
            aria-hidden
            className="block h-3 w-3 shrink-0 rounded-full"
            style={{ background: LIGHT_COLOUR[light(value)] }}
          />
          {PILLAR_META[pillar].name}
        </span>
        <span className="font-serif text-[22px] leading-none text-ink">
          {value === null ? '0%' : `${Math.round(value * 100)}%`}
        </span>
      </div>

      <div className="mt-3.5 grid gap-1.5">
        {named.length ? (
          named.map((n, i) => (
            <span key={ids[i] ?? n} className="flex items-start justify-between gap-2 text-[13.5px] leading-5 text-ink/80">
              {n}
              {/*
                The × the design puts beside every measure.

                It marks the criterion inactive rather than deleting it — a month already closed was
                scored against this line, and removing the row would change a number a board has
                signed off. See removeRoleKpi.
              */}
              {canEdit && ids[i] && (
                <form action={removeRoleKpi}>
                  <input type="hidden" name="criterionId" value={ids[i]} />
                  <button
                    aria-label={`Take "${n}" off ${PILLAR_META[pillar].name}`}
                    title={`Take "${n}" off ${PILLAR_META[pillar].name}`}
                    className="text-xs leading-none"
                    style={{ color: LIGHT_COLOUR.red }}
                  >
                    &times;
                  </button>
                </form>
              )}
            </span>
          ))
        ) : (
          <span className="text-[13.5px] leading-5 text-ink-light">No KPIs set, so nothing to score.</span>
        )}

        {/*
          ── Whether this pillar can be scored at all ──────────────────────────────────────────

          Design 15 draws a dot per pillar, green at SPEC's minimum of two KPIs and red below it.
          There is already a dot on this row and it means something else — how the pillar is GOING —
          so a second one in the same card, in the same colours, meaning readiness instead, would be
          two lights saying different things two centimetres apart.

          So it is said in words, and only when it is SHORT, which is the only time it changes what
          anybody does. `MIN_KPIS` is the same threshold lib/period refuses to open a month without.
        */}
        {pillarReadiness(count) === 'short' && (
          <span className="text-[13px] leading-5" style={{ color: LIGHT_COLOUR.red }} data-pillar-short={pillar}>
            {count} of {MIN_KPIS} KPIs — this pillar cannot be scored yet.
          </span>
        )}
      </div>

      {canEdit && (
        <form action={addRoleKpi} className="mt-3 flex gap-2">
          <input type="hidden" name="roleId" value={role.id} />
          <input type="hidden" name="pillar" value={pillar} />
          <label className="sr-only" htmlFor={`add-${role.id}-${pillar}`}>
            Add a KPI under {PILLAR_META[pillar].name}
          </label>
          <input
            id={`add-${role.id}-${pillar}`}
            name="text"
            list={listId}
            autoComplete="off"
            placeholder={examples[0] ?? 'What does good look like?'}
            className="min-h-[36px] w-full rounded-md border border-ink/15 bg-surface-raised px-2.5 py-1.5 text-[13px] text-ink"
            data-add-kpi={pillar}
          />
          {/* The design's round + button, at the end of the box. */}
          <button
            aria-label={`Add this KPI to ${PILLAR_META[pillar].name}`}
            className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-rust text-[17px] leading-none text-cream"
          >
            +
          </button>
          {/*
            The design's "Use suggestion" line, as a datalist instead.

            Same examples, same source — KPI_EXAMPLES in lib/chart-seats, which is the design's own
            list — but offered IN the box, where they can be edited before they are added. A button
            that fills the field is one more press for the same result, and a suggestion nobody can
            adjust before committing is one people accept unread.
          */}
          <datalist id={listId}>
            {examples.map(e => <option key={e} value={e} />)}
          </datalist>
        </form>
      )}
    </div>
  );
}
