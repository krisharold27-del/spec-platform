/**
 * Everywhere you can go, and it is all reached from My Page — pure, no I/O.
 *
 * ── The shape of the product, decided and written down ───────────────────────────────────────────
 *
 *   The landing page, for when somebody first arrives.
 *   My Page, which controls everything inside the system.
 *   No other way in, and no menu.
 *
 * That last part removed a navigation bar carrying five links and a dropdown of fourteen, which had
 * quietly made the product two things: a page you work on, and a menu you hunt in. A leader opening
 * SPEC at seven in the morning should see their day, and reach for the rest FROM it — not scan a
 * toolbar deciding which of nineteen places they meant.
 *
 * So the doors live here, in one list, grouped the way somebody actually thinks about them, and My
 * Page draws them at the bottom. The logo goes home. Nothing else navigates.
 *
 * Two consequences worth stating rather than discovering:
 *
 *   Every screen is now at most two presses from anywhere — logo, then a door. That is fewer than
 *   the dropdown took, because the dropdown needed opening first.
 *
 *   Signing out lives here too. It is not a destination and never belonged in a navigation bar,
 *   where it sits one slip away from whatever somebody was actually reaching for.
 */

export interface Door {
  href: string;
  label: string;
  /** What it is for, in the words somebody would use asking for it. */
  note: string;
}

export interface DoorGroup {
  title: string;
  doors: Door[];
}

export interface DoorsFor {
  /** More than one business means the group view and the switcher are real. */
  businesses: number;
  /** Whoever runs SPEC itself sees their own cockpit. Nobody else knows it exists. */
  runsSpec: boolean;
}

/**
 * The rhythm first, because it is what most days are made of, then the people, then the record.
 * Ordered by how often somebody needs it, never alphabetically — a list sorted by spelling is a
 * list that makes everybody read all of it.
 */
export function doors({ businesses, runsSpec }: DoorsFor): DoorGroup[] {
  const groups: DoorGroup[] = [
    {
      title: 'The rhythm',
      doors: [
        { href: '/meeting', label: 'COGS meeting', note: 'The weekly meeting, opening with the Make it simple report.' },
        { href: '/scoring', label: 'The month', note: 'Mark the month, and close it when it is done.' },
        { href: '/inbox', label: 'Approvals', note: 'What is waiting on a decision from you.' },
      ],
    },
    {
      title: 'The work',
      doors: [
        { href: '/jobs', label: 'Jobs', note: 'Quote it, win it, book the crew, do the job, invoice it.' },
        { href: '/crm', label: 'CRM', note: 'Every deal before it is a job, and the next call to make on each.' },
        { href: '/clients', label: 'Clients', note: 'Every client and everyone at them — sites, jobs, what is owed, one press to start the next job.' },
        { href: '/tech-day', label: 'Tech day', note: 'The tech\'s phone day, SWMS to client sign-off.' },
        { href: '/coverage', label: 'Coverage', note: 'SPEC or your own system, capability by capability.' },
      ],
    },
    {
      title: 'Your people',
      doors: [
        { href: '/org', label: 'Org chart', note: 'Who does what, and who reports to whom.' },
        { href: '/people', label: 'People', note: 'Who you have, who is clear to work, who you need.' },
        { href: '/safety', label: 'Safety', note: 'Report it, fix it, and who is clear to work.' },
        { href: '/compliance', label: 'Compliance', note: 'Licences, insurance, certificates, audits, contracts — and nothing lapsed.' },
        { href: '/training', label: 'Training', note: 'What each role has to know, and who has done it.' },
        { href: '/team', label: 'Team roll-up', note: 'How the roles beneath you are scoring.' },
      ],
    },
    {
      title: 'The numbers',
      doors: [
        { href: '/virtual-gm', label: 'Virtual GM + Virtual Admin', note: 'The whole business on one screen — the GM thinking and the admin department.' },
        { href: '/financials', label: 'Financials', note: 'Cash, profit, GST, wages, who owes you and who you owe — and payroll.' },
        { href: '/me', label: 'My scorecard', note: 'Your own four pillars, with the working shown.' },
        { href: '/summary', label: 'Executive summary', note: 'The whole business this month, on one screen.' },
        { href: '/curve', label: 'Your J curve', note: 'What SPEC has cost and returned, measured.' },
        /*
          Mirrors, because "boards" and "the Board" could not both keep the word.

          Kris, 17 September: *"there is the Board as the governing group and boards as the artifacts
          people review and run projects through"*. The note used to do the telling apart, which is
          a note doing a name's job. Design 11 renamed the artifacts to Mirrors and the collision is
          gone: the Board is the governing group — its charter, its pack, its meeting — and a mirror
          is a thing a team makes, a rate they are arguing about, a plan with an owner on each step.

          The label was left reading "Boards" after the rename because the address changed and the
          word did not, which put the old name in the navigation bar on a page whose heading already
          said Mirrors. Kris, on the live site: *"should say mirrors at the top"*.
        */
        { href: '/mirrors', label: 'Mirrors', note: 'Artifacts your team pins and runs projects through — not the Board itself.' },
        { href: '/mirrors/conversations', label: 'Conversation mirrors', note: 'The decisions being worked through.' },
      ],
    },
    {
      title: 'Setting it up',
      doors: [
        { href: '/connections', label: 'Connections', note: 'The systems that feed your numbers.' },
        /*
          Kris, 22 September, after finding what was then the AI-powered question buried inside
          Journey's setup steps: "put under pricing." What it costs used to share a page with "do
          the four questions", "build the chart" — money mixed into a setup checklist is money
          nobody goes looking for. `/billing` carries everything that decides the bill: seats,
          Start paying, and Stripe's own portal. The AI-powered question itself lasted one more day
          on that page before being retired — see the note on `SEAT_PRICES` in lib/pricing.
        */
        { href: '/billing', label: 'Pricing', note: 'What it costs, and Stripe billing.' },
        { href: '/setup', label: 'Setting up', note: 'Roles, KPIs and the things still to do.' },
        { href: '/charter', label: 'Board charter', note: 'What the Board commits to — the four, identical in every business.' },
        { href: '/settings', label: 'Administration', note: 'Seats, billing, permissions and the board.' },
        /*
          Help is a door, not only a footer link, because the footer sits at the bottom of a page
          somebody has already given up on. It is also the one door that works signed out — which is
          the whole point of it, since the person who most needs help is the one who cannot get in.
        */
        { href: '/help', label: 'Help', note: 'The questions people ask, answered — and how to reach a person.' },
      ],
    },
  ];

  if (businesses > 1) {
    groups.push({
      title: 'Your group',
      doors: [
        { href: '/group', label: 'Group', note: 'Every business you hold a seat in, side by side.' },
        { href: '/businesses', label: 'Switch business', note: 'Move to another one.' },
      ],
    });
  }

  if (runsSpec) {
    groups.push({
      title: 'Running SPEC itself',
      doors: [
        { href: '/cockpit', label: 'Cockpit', note: 'The two engines, the targets, and whether it is all working.' },
      ],
    });
  }

  return groups;
}

/**
 * The navigation bar.
 *
 * ── The decision, and the fact that it was reversed ──────────────────────────────────────────────
 *
 * SPEC had no navigation at all. The reasoning is worth keeping because it was good: a toolbar of
 * five links and a dropdown of fourteen had made SPEC two things — a page you work on and a menu you
 * hunt in — and a leader opening it at seven in the morning should see their day rather than scan a
 * toolbar deciding which of nineteen places they meant. So the mark went home and nothing else
 * navigated; the doors moved to the bottom of My Page, grouped the way somebody actually thinks.
 *
 * Every design screen has carried a navigation bar throughout. On 18 September Kris looked at the
 * product beside the designs and said *"keep the nav bar"*. That settles it: he is the one who opens
 * this at seven in the morning.
 *
 * Seven items — six screens plus **All pages** — because the argument against the old toolbar was
 * never that navigation is wrong, it was nineteen of them. These are the places somebody goes
 * repeatedly in a week. Everything else stays in the grouped directory on My Page, which is still
 * the complete list.
 *
 * Eight since 22 September: Kris asked for the AI-powered/pricing question "under pricing," which
 * meant Pricing had to be a place somebody could actually find rather than a box buried in Journey's
 * setup steps — see the note on `/billing` above. Money is one of the things a leader goes looking
 * for repeatedly, the same test every other item here passes.
 *
 * Nine, later the same day: Kris looked at the built bar and said tab one should be **Setup**, with
 * Pricing sitting right after Org chart rather than down near Connections — *"tab 1 is supposed to
 * be set up - then my page - org chart - pricing and so on."* `/setup` is the same door as "Setting
 * up" in the grouped directory, shortened to fit the bar the way `/billing` already shortens to
 * "Pricing" here.
 *
 * Built from `doors()` rather than written out again, so a route that is renamed cannot leave the
 * bar pointing at nothing while the directory quietly stays right.
 */
export const NAV_HREFS = [
  '/my-page', '/org', '/virtual-gm', '/jobs', '/crm', '/people', '/financials', '/safety', '/compliance', '/board', '/meeting',
  '/setup', '/connections', '/pages',
] as const;

export function navDoors(f: DoorsFor): Door[] {
  const all = allDoors(f);
  const find = (href: string) => all.find(d => d.href === href);
  return [
    /*
      ── The key areas, 24 September ────────────────────────────────────────────────────────────

      Kris, looking at a bar of fourteen: *"why is this like this - we already talked about these
      are to be combined."* He is right, and the design says it plainly:

        "Top menu on every app page is now the key areas: My page · Jobs · CRM · People · Safety ·
         Compliance · Board, with Setup, Connections and All pages on the right. Org chart and
         Training sit under People; Scoring and Mirrors under Board."

      Fourteen tabs is not navigation, it is a list of everything — the exact fault that got the old
      nineteen-item dropdown deleted in September, growing back one reasonable addition at a time.
      Each of Clients, Org chart, Pricing, Scoring and Mirrors earned its place on its own, and
      together they made a bar nobody reads.

      So the bar is now SEVEN key areas plus three on the right. What came off it did not become
      unreachable: Org chart and Training are opened from People, Scoring and Mirrors from Board,
      Clients from CRM, Pricing from Setup — and every one of them is still in the full directory
      behind All pages. `tests/doors.test.ts` holds that: nothing may leave the bar without still
      being reachable from somewhere a person would look.
    */
    { href: '/my-page', label: 'My page', note: 'Your day, and everything else opens from it.' },
    /*
      ── The core components, 25 September ─────────────────────────────────────────────────────────

      Kris could not find the org chart. It is THE key component of SiteVIP — everything hangs off
      it — and the September shortening had tucked it "under People", which in practice meant
      nothing in the bar and nothing on the pages he opens led to it. Findability beats a short bar:
      every component in docs/CORE-COMPONENTS.md now has its own item, the org chart second, and
      `tests/core-components.test.ts` fails the build if one ever leaves.
    */
    find('/org') ?? { href: '/org', label: 'Org chart', note: 'Who does what, and who reports to whom.' },
    /* Its own short label: the directory calls it "Virtual GM + Virtual Admin", too long for a tab. */
    { href: '/virtual-gm', label: 'Virtual GM', note: 'The whole business on one screen — the GM thinking and the admin department.' },
    find('/jobs') ?? { href: '/jobs', label: 'Jobs', note: 'Quote it, win it, book the crew, do the job, invoice it.' },
    /*
      CRM, and Clients folded into it. The design: "CRM opens Jobs on the Customers tab." Ours is
      its own page and stays that way — what matters is that the selling and the people sold to are
      one door rather than two beside each other.
    */
    find('/crm') ?? { href: '/crm', label: 'CRM', note: 'Deals, the clients behind them, and everyone at them.' },
    /* People, with the chart and the training under it — they are all the same question. */
    find('/people') ?? { href: '/people', label: 'People', note: 'Who you have, the chart they sit in, what they are trained on, who you need.' },
    /*
      Financials, right after People — Kris, 25 September: he could not see the money. It sat inside
      the Virtual GM, two screens down, and the bar had nothing for it. Money is the thing a trade
      business owner checks most, so it is a key area, and the ceiling moves from ten to eleven for
      it rather than something else being pushed off.
    */
    find('/financials') ?? { href: '/financials', label: 'Financials', note: 'Cash, profit, GST, wages, who owes you and who you owe — and payroll.' },
    find('/safety') ?? { href: '/safety', label: 'Safety', note: 'Report it, fix it, prove it.' },
    { href: '/compliance', label: 'Compliance', note: 'Licences, insurance, certificates, audits, contracts — and nothing lapsed.' },
    /*
      Board: the pack, and the month and the mirrors that feed it. The pack lives at
      /board/[periodId]; `/board` is the door, and it opens the most recently closed month, because
      a board pack is a record of a month that finished.
    */
    { href: '/board', label: 'Board', note: 'The pack, the month being scored, and the mirrors behind it.' },
    /* The weekly COGS meeting — and the Make it simple report, which is its first item. */
    { href: '/meeting', label: 'COGS meeting', note: 'The weekly meeting, opening with the Make it simple report.' },

    /* ── The three on the right: setting it up, not running it ──────────────────────────────── */
    { href: '/setup', label: 'Setup', note: 'Roles, KPIs, pricing and the things still to do.' },
    find('/connections') ?? { href: '/connections', label: 'Connections', note: 'The systems that feed your numbers.' },
    /*
      The last item, and the reason the bar can stay this short whatever else gets added. SPEC has
      far more than ten screens and always will. The complete grouped directory is at the foot of My
      Page — this is the door to it, so nothing is ever only reachable by knowing it is there.
    */
    { href: '/pages', label: 'All pages', note: 'Every screen in SPEC, grouped.' },
  ];
}

/** Every door, flattened — for a test that wants to walk all of them. */
export const allDoors = (f: DoorsFor): Door[] => doors(f).flatMap(g => g.doors);
