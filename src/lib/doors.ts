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
        { href: '/meeting', label: 'This week', note: 'The weekly meeting, and what came out of it.' },
        { href: '/scoring', label: 'The month', note: 'Mark the month, and close it when it is done.' },
        { href: '/inbox', label: 'Approvals', note: 'What is waiting on a decision from you.' },
      ],
    },
    {
      title: 'Your people',
      doors: [
        { href: '/org', label: 'Org chart', note: 'Who does what, and who reports to whom.' },
        { href: '/people', label: 'People', note: 'Who you have, who is clear to work, who you need.' },
        { href: '/training', label: 'Training', note: 'What each role has to know, and who has done it.' },
        { href: '/team', label: 'Team roll-up', note: 'How the roles beneath you are scoring.' },
      ],
    },
    {
      title: 'The numbers',
      doors: [
        { href: '/me', label: 'My scorecard', note: 'Your own four pillars, with the working shown.' },
        { href: '/summary', label: 'Executive summary', note: 'The whole business this month, on one screen.' },
        { href: '/curve', label: 'Your J curve', note: 'What SPEC has cost and returned, measured.' },
        { href: '/boards', label: 'Conversation boards', note: 'The decisions being worked through.' },
      ],
    },
    {
      title: 'Setting it up',
      doors: [
        { href: '/connections', label: 'Connections', note: 'The systems that feed your numbers.' },
        { href: '/setup', label: 'Setting up', note: 'Roles, KPIs and the things still to do.' },
        { href: '/charter', label: 'Board charter', note: 'The four commitments, identical in every business.' },
        { href: '/settings', label: 'Administration', note: 'Seats, billing, permissions and the board.' },
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

/** Every door, flattened — for a test that wants to walk all of them. */
export const allDoors = (f: DoorsFor): Door[] => doors(f).flatMap(g => g.doors);
